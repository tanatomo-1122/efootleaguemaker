import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { saveUpload } from '@/lib/storage';
import { getLeague, tryCloseAndDraw, listEntries } from '@/lib/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  return NextResponse.json({ entries: await listEntries(Number(params.id)) });
}

/** 試合申し込み + スカッド登録 */
export async function POST(req, { params }) {
  try {
    const leagueId = Number(params.id);
    const league = await getLeague(leagueId);
    if (!league) return NextResponse.json({ error: 'リーグが存在しません' }, { status: 404 });
    if (league.status !== 'recruiting') {
      return NextResponse.json({ error: 'このリーグは既に締め切られています' }, { status: 400 });
    }

    const form = await req.formData();
    const efootballId = String(form.get('efootball_id') || '').trim();
    const teamName = String(form.get('team_name') || '').trim();
    const attackFormation = String(form.get('attack_formation') || '').trim();
    const defenceFormation = String(form.get('defence_formation') || '').trim();
    const teamStyle = String(form.get('team_style') || '').trim();
    const teamPower = Number(form.get('team_power'));

    if (!efootballId) return NextResponse.json({ error: 'efootball ID を入力してください' }, { status: 400 });
    if (!teamName) return NextResponse.json({ error: 'スカッド名を入力してください' }, { status: 400 });
    if (!attackFormation) {
      return NextResponse.json({ error: '攻撃時フォーメーションを選択してください' }, { status: 400 });
    }
    if (!defenceFormation) {
      return NextResponse.json({ error: '守備時フォーメーションを選択してください' }, { status: 400 });
    }
    if (!teamStyle) return NextResponse.json({ error: 'チームスタイルを選択してください' }, { status: 400 });
    if (!Number.isFinite(teamPower) || teamPower <= 0) {
      return NextResponse.json({ error: 'チームパワーを入力してください' }, { status: 400 });
    }

    const [user] = await sql`SELECT * FROM users WHERE efootball_id = ${efootballId}`;
    if (!user) {
      return NextResponse.json(
        { error: 'ユーザー登録が見つかりません。先にユーザー登録を行ってください' },
        { status: 400 }
      );
    }

    const [dup] = await sql`
      SELECT 1 FROM entries WHERE league_id = ${leagueId} AND user_id = ${user.user_id}
    `;
    if (dup) return NextResponse.json({ error: '既にこのリーグへ申し込み済みです' }, { status: 400 });

    const capacity = league.players_per_pool * league.pool_count;
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM entries WHERE league_id = ${leagueId}
    `;
    if (count >= capacity) {
      return NextResponse.json({ error: '定員に達しています' }, { status: 400 });
    }

    // スカッド名はリーグ内で一意(結果画像の自動照合のため)
    const [nameTaken] = await sql`
      SELECT 1 FROM entries e JOIN squads s ON s.squad_id = e.squad_id
      WHERE e.league_id = ${leagueId} AND LOWER(s.team_name) = LOWER(${teamName})
    `;
    if (nameTaken) {
      return NextResponse.json(
        { error: 'このリーグ内で同じスカッド名が既に使われています。別の名前にしてください' },
        { status: 400 }
      );
    }

    const photoPath = await saveUpload(form.get('squad_photo'), 'squad');

    await sql.begin(async (tx) => {
      const [squad] = await tx`
        INSERT INTO squads
          (user_id, team_name, attack_formation, defence_formation, team_style, team_power, photo_path)
        VALUES (
          ${user.user_id}, ${teamName}, ${attackFormation}, ${defenceFormation},
          ${teamStyle}, ${Math.round(teamPower)}, ${photoPath}
        )
        RETURNING squad_id
      `;
      await tx`
        INSERT INTO entries (league_id, user_id, squad_id)
        VALUES (${leagueId}, ${user.user_id}, ${squad.squad_id})
      `;
    });

    // 規定人数に達したら自動締切 → 組み合わせ抽選
    const drawn = await tryCloseAndDraw(leagueId);

    return NextResponse.json({ ok: true, drawn, league_id: leagueId });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
