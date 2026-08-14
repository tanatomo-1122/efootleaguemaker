import { NextResponse } from 'next/server';
import { getLeague, getMatch, saveMatchResult } from '@/lib/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ホーム側が結果を登録する（アウェイの承認待ちになる） */
export async function POST(req, { params }) {
  try {
    const matchId = Number(params.id);
    const body = await req.json();
    const stats = body.stats || {};
    const efootballId = String(body.efootball_id || '').trim();

    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

    // --- 本人確認: 結果を登録できるのはホーム側のみ ---
    if (!efootballId) {
      return NextResponse.json({ error: 'あなたの efootball ID を入力してください' }, { status: 400 });
    }
    if (efootballId.toLowerCase() !== String(match.home_efootball_id).toLowerCase()) {
      return NextResponse.json(
        {
          error: `結果を登録できるのはホーム側（${match.home_efootball_id}）だけです。` +
            `アウェイの方は、ホームの登録後に承認をお願いします。`,
        },
        { status: 403 }
      );
    }

    if (stats.home_score === '' || stats.home_score == null ||
        stats.away_score === '' || stats.away_score == null) {
      return NextResponse.json({ error: '得点(スコア)は必須です' }, { status: 400 });
    }

    const league = await getLeague(match.league_id);
    if (league.status === 'finished') {
      return NextResponse.json({ error: 'このリーグは確定済みです' }, { status: 400 });
    }

    await saveMatchResult(matchId, stats, {
      imagePath: body.image_path ?? null,
      source: body.source ?? 'manual',
    });

    return NextResponse.json({
      ok: true,
      status: 'pending',
      awaiting: match.away_efootball_id,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
