import { NextResponse } from 'next/server';
import { getLeague, getMatch, listMessages, postMessage, MESSAGE_MAX } from '@/lib/league';
import { authenticate, AuthError } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 対戦相手とのトーク。読み書きどちらもこの1本で扱う。
 * body: { efootball_user_id, action: 'list' | 'post', body, after_id }
 *
 * ユーザーIDをURLに載せないよう、読み取りも POST にしている。
 * トークが使えるのは試合中（結果が承認されるまで）だけ。
 */
export async function POST(req, { params }) {
  try {
    const matchId = Number(params.id);
    const payload = await req.json().catch(() => ({}));
    const action = payload.action === 'post' ? 'post' : 'list';

    const match = await getMatch(matchId);
    if (!match) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

    // --- 本人確認: 使えるのは対戦する2人だけ ---
    const user = await authenticate(payload.efootball_user_id);
    if (user.user_id !== match.home_user_id && user.user_id !== match.away_user_id) {
      throw new AuthError(
        `トークを使えるのは、この試合の対戦者（${match.home_user_name} / ${match.away_user_name}）だけです`,
        403
      );
    }

    // --- 試合中かどうか ---
    const league = await getLeague(match.league_id);
    const closed =
      league.cancelled || league.status === 'finished' || match.status === 'reported';
    if (closed) {
      return NextResponse.json({
        ok: true,
        closed: true,
        messages: [],
        message: 'この試合は終了しているため、トークは見られません',
      });
    }

    if (action === 'post') {
      await postMessage(matchId, user.user_id, payload.body);
    }

    const messages = await listMessages(matchId, payload.after_id);
    return NextResponse.json({
      ok: true,
      closed: false,
      me: user.user_id,
      max_length: MESSAGE_MAX,
      messages: messages.map((m) => ({
        message_id: m.message_id,
        user_name: m.user_name,
        body: m.body,
        created_at: m.created_at,
        mine: m.user_id === user.user_id,
      })),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
