import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { listLeagues } from '@/lib/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ leagues: await listLeagues() });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const organizerId = String(body.organizer_efootball_id || '').trim();
    const playersPerPool = Number(body.players_per_pool);
    const poolCount = Number(body.pool_count);

    if (!name) return NextResponse.json({ error: 'リーグ名を入力してください' }, { status: 400 });
    if (!organizerId) {
      return NextResponse.json({ error: '主催者の efootball ID を入力してください' }, { status: 400 });
    }
    if (!(playersPerPool >= 2 && playersPerPool <= 16)) {
      return NextResponse.json({ error: '1リーグの人数は2〜16人で指定してください' }, { status: 400 });
    }
    if (!(poolCount >= 1 && poolCount <= 8)) {
      return NextResponse.json({ error: 'プール数は1〜8で指定してください' }, { status: 400 });
    }

    const [organizer] = await sql`SELECT * FROM users WHERE efootball_id = ${organizerId}`;
    if (!organizer) {
      return NextResponse.json(
        { error: '主催者のユーザー登録が見つかりません。先にユーザー登録を行ってください' },
        { status: 400 }
      );
    }

    const [league] = await sql`
      INSERT INTO leagues
        (name, organizer_user_id, players_per_pool, pool_count, recruit_start, recruit_end, description)
      VALUES (
        ${name}, ${organizer.user_id}, ${playersPerPool}, ${poolCount},
        ${body.recruit_start || null}, ${body.recruit_end || null},
        ${String(body.description || '').trim() || null}
      )
      RETURNING *
    `;
    return NextResponse.json({ league });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
