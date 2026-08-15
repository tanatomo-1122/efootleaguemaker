/**
 * ユーザー名 / ユーザーID の形式ルール。
 * クライアント側からも読むので、ここには DB 依存を持ち込まないこと。
 */

export const USER_ID_PATTERN = /^[A-Z]{4}-\d{3}-\d{3}-\d{3}$/;
export const USER_ID_PLACEHOLDER = 'ASLV-569-790-534';

/** 入力ゆれ（小文字・全角・スペース・区切り無し）を吸収して正規化する */
export function normalizeUserId(input) {
  const raw = String(input ?? '')
    // 全角英数・全角ハイフンを半角へ
    .replace(/[Ａ-Ｚａ-ｚ０-９－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]/g, '')
    .toUpperCase();

  // 区切り無しで入力された場合も受け付ける（ASLV569790534）
  const compact = raw.replace(/[^A-Z0-9]/g, '');
  const m = compact.match(/^([A-Z]{4})(\d{3})(\d{3})(\d{3})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}` : raw;
}

export function isValidUserId(input) {
  return USER_ID_PATTERN.test(normalizeUserId(input));
}

export function normalizeUserName(input) {
  return String(input ?? '').trim();
}

export function isValidUserName(input) {
  const n = normalizeUserName(input);
  return n.length >= 2 && n.length <= 32 && !/[\s　]/.test(n);
}
