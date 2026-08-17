/**
 * フォーメーションの入力補正と検証。
 * クライアントからもサーバーからも使うので、ここには DB 依存を持ち込まないこと。
 *
 * 方針: ユーザーは数字だけ打てばよい。
 *   「４ー３ー３」「4-3-3」「4 3 3」「433」→ すべて "4-3-3" として受け取る。
 */

export const FORMATION_PLACEHOLDER = '例: 433 または 4231';
export const FIELD_PLAYERS = 10; // GK を除いたフィールドプレイヤーの人数

/**
 * 入力から数字だけを取り出す。
 * 全角数字は半角に直し、ハイフン・長音記号・スペース・スラッシュ等はすべて捨てる。
 */
export function sanitizeFormation(input) {
  return String(input ?? '')
    // 全角数字 → 半角数字
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 数字以外は問答無用で除去（- ー − ‐ / 空白 全角空白 など全部）
    .replace(/[^0-9]/g, '');
}

/** "433" → "4-3-3" */
export function formatFormation(digits) {
  return String(digits ?? '').split('').join('-');
}

/** 各桁の合計（フィールドプレイヤーの人数） */
export function sumFormation(digits) {
  return String(digits ?? '')
    .split('')
    .reduce((total, d) => total + Number(d), 0);
}

/**
 * 入力を解釈して検証する。
 * @param {string} input ユーザーが打った文字列
 * @returns {{ok: boolean, digits: string, formatted: string, total: number, error: string|null}}
 */
export function parseFormation(input) {
  const digits = sanitizeFormation(input);
  const total = sumFormation(digits);
  const base = { digits, formatted: formatFormation(digits), total };

  if (!digits) {
    return { ...base, ok: false, error: 'フォーメーションを入力してください' };
  }
  if (digits.length < 3 || digits.length > 4) {
    return {
      ...base,
      ok: false,
      error: `3桁か4桁の数字で入力してください（${FORMATION_PLACEHOLDER}）`,
    };
  }
  if (digits.includes('0')) {
    return {
      ...base,
      ok: false,
      error: '0 は使えません。各ラインが1人以上になるように入力してください',
    };
  }
  if (total !== FIELD_PLAYERS) {
    return {
      ...base,
      ok: false,
      error: `フィールドプレイヤーの合計が${FIELD_PLAYERS}人になりません（現在${total}人）`,
    };
  }

  return { ...base, ok: true, error: null };
}

/** 保存してよい形に正規化する。不正なら null */
export function normalizeFormation(input) {
  const r = parseFormation(input);
  return r.ok ? r.formatted : null;
}
