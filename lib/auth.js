import { sql } from './db.js';
import { USER_ID_PATTERN, USER_ID_PLACEHOLDER, normalizeUserId, isValidUserId } from './user-id.js';

/**
 * 本人確認（サーバー側専用）。
 *
 * eFootball のユーザーID（ASLV-569-790-534 形式）を、パスワード代わりの合言葉として使う。
 * ユーザー名は公開情報、ユーザーIDは秘密情報。
 * 画面にもエラーメッセージにも、ユーザーIDそのものは出さないこと。
 */

export * from './user-id.js';

export class AuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * ユーザーIDからユーザーを引く。
 * ついでに最終アクセス時刻も更新する（在席表示のため。追加の通信は発生しない）。
 * 連打で無駄な書き込みが増えないよう、60秒以内の再更新はしない。
 */
export async function findUserByUserId(input) {
  const id = normalizeUserId(input);
  if (!USER_ID_PATTERN.test(id)) return null;
  const [user] = await sql`
    UPDATE users
    SET last_seen_at = now()
    WHERE efootball_user_id = ${id}
      AND (last_seen_at IS NULL OR last_seen_at < now() - interval '60 seconds')
    RETURNING *
  `;
  if (user) return user;

  // 60秒以内に来たばかりで更新しなかった場合は、そのまま読む
  const [fresh] = await sql`SELECT * FROM users WHERE efootball_user_id = ${id}`;
  return fresh ?? null;
}

/**
 * ユーザーIDで本人を特定する。失敗したら AuthError を投げる。
 * @returns {Promise<object>} users の行
 */
export async function authenticate(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new AuthError('ユーザーIDを入力してください', 400);
  if (!isValidUserId(raw)) {
    throw new AuthError(
      `ユーザーIDの形式が違います（${USER_ID_PLACEHOLDER} のような形式です）`,
      400
    );
  }
  const user = await findUserByUserId(raw);
  if (!user) {
    throw new AuthError(
      'そのユーザーIDは登録されていません。先にユーザー登録を行ってください',
      401
    );
  }
  return user;
}

/**
 * 本人であることに加えて、特定のユーザーであることを確認する。
 * @param {string} input        入力されたユーザーID
 * @param {number} expectedId   users.user_id
 * @param {string} roleMessage  権限が無いときに出す説明
 */
export async function authenticateAs(input, expectedId, roleMessage) {
  const user = await authenticate(input);
  if (user.user_id !== expectedId) throw new AuthError(roleMessage, 403);
  return user;
}
