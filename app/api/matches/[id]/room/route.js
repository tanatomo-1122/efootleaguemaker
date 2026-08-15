import { NextResponse } from 'next/server';
import { getLeague, getMatch, setMatchRoom, clearMatchRoom } from '@/lib/league';
import { authenticateAs, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 対戦部屋の番号を共有する / 取り消す。ホーム側だけが実行できる。
 * body: { efootball_user_id, room_code, room_note, action?: 'post' | 'clear' }
 */
export async function POST(req, { params }) {
  try {
    const matchId = Number(params.id);
    const body = await req.json().catch(() => ({}));
    const action = body.action === 'clear' ? 'clear' : 'post';

    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

    const league = await getLeague(match.league_id);
    if (league.cancelled) {
      return NextResponse.json({ error: 'このリーグは中止されています' }, { status: 400 });
    }
    if (league.status === 'finished') {
      return NextResponse.json({ error: 'このリーグは確定済みです' }, { status: 400 });
    }
    if (match.status === 'reported') {
      return NextResponse.json({ error: 'この試合は既に承認済みです' }, { status: 400 });
    }

    // --- 本人確認: 部屋を立てるのはホーム側 ---
    await authenticateAs(
      body.efootball_user_id,
      match.home_user_id,
      `部屋番号を共有できるのはホーム側（${match.home_user_name}）だけです`
    );

    if (action === 'clear') {
      await clearMatchRoom(matchId);
      return NextResponse.json({ ok: true, has_room: false });
    }

    await setMatchRoom(matchId, body.room_code, body.room_note);
    return NextResponse.json({ ok: true, has_room: true, notify: match.away_user_name });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
