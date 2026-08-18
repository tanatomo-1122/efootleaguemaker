import { NextResponse } from 'next/server';
import { chatSnapshot, postMessage, MESSAGE_MAX } from '@/lib/league';
import { AuthError, isValidUserId, normalizeUserId, USER_ID_PLACEHOLDER } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 詰まっても関数を長時間占有しないよう、上限を明示する
export const maxDuration = 15;

/**
 * 対戦相手とのトーク。読み書きどちらもこの1本で扱う。
 * body: { efootball_user_id, action: 'list' | 'post', body, after_id }
 *
 * ユーザーIDをURLに載せないよう、読み取りも POST にしている。
 * トークが使えるのは試合中（結果が承認されるまで）だけ。
 *
 * ポーリングで繰り返し叩かれるので、読み取りは DB 1往復で済ませている。
 */
export async function POST(req, { params }) {
  try {
    const matchId = Number(params.id);
    const payload = await req.json().catch(() => ({}));
    const action = payload.action === 'post' ? 'post' : 'list';

    const userId = normalizeUserId(payload.efootball_user_id);
    if (!String(payload.efootball_user_id ?? '').trim()) {
      throw new AuthError('ユーザーIDを入力してください', 400);
    }
    if (!isValidUserId(userId)) {
      throw new AuthError(
        `ユーザーIDの形式が違います（${USER_ID_PLACEHOLDER} のような形式です）`,
        400
      );
    }

    // 試合・リーグ・本人確認・メッセージをまとめて1回で取る
    let snap = await chatSnapshot(matchId, userId, payload.after_id);
    if (!snap) return NextResponse.json({ error: '試合が見つかりません' }, { status: 404 });

    if (!snap.me_user_id) {
      throw new AuthError(
        'そのユーザーIDは登録されていません。先にユーザー登録を行ってください',
        401
      );
    }
    if (snap.me_user_id !== snap.home_user_id && snap.me_user_id !== snap.away_user_id) {
      throw new AuthError(
        `トークを使えるのは、この試合の対戦者（${snap.home_user_name} / ${snap.away_user_name}）だけです`,
        403
      );
    }

    // --- 試合中かどうか ---
    const closed =
      snap.league_cancelled ||
      snap.league_status === 'finished' ||
      snap.match_status === 'reported';
    if (closed) {
      return NextResponse.json({
        ok: true,
        closed: true,
        messages: [],
        message: 'この試合は終了しているため、トークは見られません',
      });
    }

    if (action === 'post') {
      await postMessage(matchId, snap.me_user_id, payload.body);
      // 投稿した分を含めて取り直す
      snap = await chatSnapshot(matchId, userId, payload.after_id);
    }

    return NextResponse.json({
      ok: true,
      closed: false,
      me: snap.me_user_id,
      max_length: MESSAGE_MAX,
      messages: (snap.messages ?? []).map((m) => ({
        message_id: m.message_id,
        user_name: m.user_name,
        body: m.body,
        created_at: m.created_at,
        mine: m.user_id === snap.me_user_id,
      })),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
