import { NextResponse } from 'next/server';
import { authenticate, AuthError } from '@/lib/auth';
import { getSessionUser, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/** いま誰としてログインしているか（ユーザーIDは返さない） */
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}

/**
 * ログイン。ユーザーIDを1回だけ受け取り、以降は Cookie で本人確認する。
 * body: { efootball_user_id }
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = await authenticate(body.efootball_user_id);

    const res = NextResponse.json({
      ok: true,
      user: { user_id: user.user_id, user_name: user.user_name, photo_path: user.photo_path },
    });
    res.cookies.set(SESSION_COOKIE, user.efootball_user_id, sessionCookieOptions());
    return res;
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

/** ログアウト（別のアカウントに切り替えるときにも使う） */
export async function DELETE() {
  const res = NextResponse.json({ ok: true, user: null });
  res.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
