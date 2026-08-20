import { cookies } from 'next/headers';
import { sql } from './db.js';
import { normalizeUserId, isValidUserId } from './user-id.js';

/**
 * ログイン状態（サーバー専用）。
 *
 * ユーザーIDはパスワード相当なので、
 *   - httpOnly Cookie に入れる（JavaScript から読めない ＝ XSS で盗まれない）
 *   - SameSite=Lax にする（他サイトからの POST に Cookie が付かない ＝ CSRF 対策）
 *   - URL には絶対に載せない
 * という方針にしている。
 *
 * これにより、画面側は「ユーザーIDを知らないまま」操作できる。
 */

export const SESSION_COOKIE = 'elm_session';
const ONE_YEAR = 60 * 60 * 24 * 365;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_YEAR,
  };
}

/** Cookie に入っているユーザーID（生の文字列）。無ければ null */
export function readSessionUserId() {
  try {
    const raw = cookies().get(SESSION_COOKIE)?.value;
    if (!raw) return null;
    const id = normalizeUserId(raw);
    return isValidUserId(id) ? id : null;
  } catch {
    // 静的レンダリング中など cookies() が使えない場面
    return null;
  }
}

/**
 * ログイン中のユーザー。画面に出してよい情報だけを返す。
 * @returns {Promise<{user_id:number, user_name:string, photo_path:string|null}|null>}
 */
export async function getSessionUser() {
  const id = readSessionUserId();
  if (!id) return null;
  const [user] = await sql`
    SELECT user_id, user_name, photo_path FROM users WHERE efootball_user_id = ${id}
  `;
  return user ?? null;
}
