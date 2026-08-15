import { NextResponse } from 'next/server';
import { getMatch, getMatchRoom } from '@/lib/league';
import { authenticate, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 部屋番号を確認する。対戦する2人（ホーム / アウェイ）だけが見られる。
 * body: { efootball_user_id }
 *
 * ユーザーIDをURLに載せないよう POST にしている。
 */
export async function POST(req, { params }) {
  try {
    const matchId = Number(params.id);
    const body = await req.json().catch(() => ({}));

    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

    const user = await authenticate(body.efootball_user_id);
    if (user.user_id !== match.home_user_id && user.user_id !== match.away_user_id) {
      throw new AuthError(
        `部屋番号を見られるのは、この試合の対戦者（${match.home_user_name} / ${match.away_user_name}）だけです`,
        403
      );
    }

    const room = await getMatchRoom(matchId);
    if (!room?.room_code) {
      return NextResponse.json({
        ok: true,
        has_room: false,
        message: `${match.home_user_name} さんがまだ部屋を立てていません`,
      });
    }

    return NextResponse.json({
      ok: true,
      has_room: true,
      room_code: room.room_code,
      room_note: room.room_note,
      room_posted_at: room.room_posted_at,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
