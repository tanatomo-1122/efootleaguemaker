/**
 * EFLランクの計算と定義（DBに依存しない部分）。
 * 画面（クライアント）からも読むので、ここには DB を持ち込まないこと。
 *
 * FIFAランク 2018年改訂版（SUM方式・Eloベース）の式をリーグ戦向けに採用している。
 *
 *   P  = P_before + I * (W - We)
 *   We = 1 / (10^(-dr / 600) + 1)      dr = 自分の P_before - 相手の P_before
 *
 * 当サイトの決めごと:
 *   - 対象は「リーグ戦の承認済みの試合」だけ。決勝トーナメントは含めない
 *   - PK戦が無いので W は 勝ち=1 / 引き分け=0.5 / 負け=0 の3通りだけ
 *   - 初期値は一律 1500
 *   - リーグのカテゴリーで重要度 I が変わる
 */

export const INITIAL_RATING = 1500;

/** リーグのカテゴリーと重要度 I */
export const CATEGORIES = {
  general: { importance: 10, label: '一般リーグ', short: '一般' },
  prize: { importance: 25, label: '賞金ありリーグ', short: '賞金' },
  official: { importance: 40, label: '公式リーグ', short: '公式' },
};

export const DEFAULT_CATEGORY = 'general';

export function importanceOf(category) {
  return (CATEGORIES[category] ?? CATEGORIES[DEFAULT_CATEGORY]).importance;
}

export function categoryLabel(category) {
  return (CATEGORIES[category] ?? CATEGORIES[DEFAULT_CATEGORY]).label;
}

/* ------------------------------------------------------------------ *
 * 計算そのもの（DBに触れない純粋な関数）
 * ------------------------------------------------------------------ */

/** 期待勝率 We */
export function expectedScore(myRating, opponentRating) {
  const dr = myRating - opponentRating;
  return 1 / (10 ** (-dr / 600) + 1);
}

/** 試合結果 W を得点から決める */
export function resultOf(myScore, opponentScore) {
  const a = Number(myScore ?? 0);
  const b = Number(opponentScore ?? 0);
  if (a > b) return 1;
  if (a < b) return 0;
  return 0.5;
}

/**
 * 1試合ぶんの変動を計算する。
 * 両者とも「試合前のレーティング」を使うので、順番による有利不利は生じない。
 */
export function computeMatch({ homeRating, awayRating, homeScore, awayScore, importance }) {
  const homeResult = resultOf(homeScore, awayScore);
  const awayResult = 1 - homeResult;

  const homeExpected = expectedScore(homeRating, awayRating);
  const awayExpected = expectedScore(awayRating, homeRating);

  const homeDelta = importance * (homeResult - homeExpected);
  const awayDelta = importance * (awayResult - awayExpected);

  return {
    home: {
      result: homeResult,
      expected: homeExpected,
      delta: homeDelta,
      before: homeRating,
      after: homeRating + homeDelta,
    },
    away: {
      result: awayResult,
      expected: awayExpected,
      delta: awayDelta,
      before: awayRating,
      after: awayRating + awayDelta,
    },
  };
}

/** レーティング帯の呼び名 */
export const TIERS = [
  { min: 1800, name: 'ELITE', label: 'エリート', cls: 'bg-gold text-pitchdark' },
  { min: 1650, name: 'PRO', label: 'プロ', cls: 'bg-volt text-ink' },
  { min: 1500, name: 'REGULAR', label: 'レギュラー', cls: 'bg-white/80 text-ink' },
  { min: 1350, name: 'CHALLENGER', label: 'チャレンジャー', cls: 'bg-white/20 text-chalk' },
  { min: -Infinity, name: 'ROOKIE', label: 'ルーキー', cls: 'bg-white/10 text-white/60' },
];

export function tierOf(rating) {
  return TIERS.find((t) => rating >= t.min) ?? TIERS[TIERS.length - 1];
}
