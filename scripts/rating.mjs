/**
 * EFLランクの一括計算。
 *
 *   npm run rating:rebuild          … 承認済みの全試合から計算し直す（実行する）
 *   npm run rating:rebuild -- --dry … 計算するが保存しない（結果だけ見る）
 *
 * 使いどころ:
 *   - 導入時に、これまでの試合結果から初期値を決めるとき
 *   - リーグのカテゴリー（一般/賞金あり/公式）を後から変えたとき
 *   - 結果を取り消して履歴がずれたと感じたとき
 *
 * 何度実行しても同じ結果になります（毎回 1500 から計算し直すため）。
 */
import './env.mjs';
import { sql } from '../lib/db.js';
import {
  recomputeAllRatings, listRanking, INITIAL_RATING, CATEGORIES,
  computeMatch, importanceOf, tierOf,
} from '../lib/rating.js';

const dryRun = process.argv.includes('--dry');

console.log('EFLランク 一括計算' + (dryRun ? '（お試し・保存しません）' : ''));
console.log('='.repeat(58));

// --- 対象になる試合を確認する ---
const [{ total, reported, cancelled }] = await sql`
  SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE m.status = 'reported')::int AS reported,
         COUNT(*) FILTER (WHERE l.cancelled_at IS NOT NULL)::int AS cancelled
  FROM matches m JOIN leagues l ON l.league_id = m.league_id
`;
console.log(`\n試合: 全 ${total} 件 / 承認済み ${reported} 件 / 中止リーグ内 ${cancelled} 件`);

const byCategory = await sql`
  SELECT l.category, COUNT(*)::int AS matches
  FROM matches m JOIN leagues l ON l.league_id = m.league_id
  WHERE m.status = 'reported' AND l.cancelled_at IS NULL
  GROUP BY l.category ORDER BY matches DESC
`;
if (byCategory.length) {
  console.log('\n対象試合の内訳:');
  for (const c of byCategory) {
    const label = CATEGORIES[c.category]?.label ?? c.category;
    console.log(`  ${label.padEnd(16)} ${String(c.matches).padStart(4)} 試合  (I = ${importanceOf(c.category)})`);
  }
}

if (dryRun) {
  // --- 保存せずに計算だけしてみる ---
  const matches = await sql`
    SELECT m.match_id, m.home_score, m.away_score, l.category,
           hu.user_name AS home_name, au.user_name AS away_name
    FROM matches m
    JOIN leagues l  ON l.league_id = m.league_id AND l.cancelled_at IS NULL
    JOIN entries he ON he.entry_id = m.home_entry_id
    JOIN entries ae ON ae.entry_id = m.away_entry_id
    JOIN users   hu ON hu.user_id  = he.user_id
    JOIN users   au ON au.user_id  = ae.user_id
    WHERE m.status = 'reported'
    ORDER BY COALESCE(m.approved_at, m.reported_at), m.match_id
  `;
  const r = new Map();
  const n = new Map();
  const get = (k) => (r.has(k) ? r.get(k) : INITIAL_RATING);
  for (const m of matches) {
    const c = computeMatch({
      homeRating: get(m.home_name),
      awayRating: get(m.away_name),
      homeScore: m.home_score,
      awayScore: m.away_score,
      importance: importanceOf(m.category),
    });
    r.set(m.home_name, c.home.after);
    r.set(m.away_name, c.away.after);
    n.set(m.home_name, (n.get(m.home_name) ?? 0) + 1);
    n.set(m.away_name, (n.get(m.away_name) ?? 0) + 1);
  }
  print([...r.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([user_name, rating], i) => ({
      rank: i + 1, user_name, rating, rating_matches: n.get(user_name), tier: tierOf(rating),
    })));
  console.log('\n※ --dry のため保存していません。実行するには --dry を外してください。');
  await sql.end();
  process.exit(0);
}

// --- 実行 ---
const before = await listRanking();
const result = await recomputeAllRatings();
const after = await listRanking();

console.log(`\n計算しました: ${result.matches} 試合 / ${result.users} 人`);
print(after, new Map(before.map((b) => [b.user_name, b.rating])));

console.log('\n完了しました。サイトの「EFLランク」に反映されています。');
await sql.end();

function print(rows, beforeMap) {
  if (!rows.length) {
    console.log('\n対象となる試合がまだありません。全員 ' + INITIAL_RATING + ' のままです。');
    return;
  }
  console.log('\n' + '-'.repeat(58));
  console.log('順位 ユーザー名        レート  試合   ランク帯' + (beforeMap ? '   変化' : ''));
  console.log('-'.repeat(58));
  for (const r of rows) {
    const diff = beforeMap
      ? (() => {
          const b = beforeMap.get(r.user_name);
          if (b === undefined) return '  new';
          const d = Math.round(r.rating - b);
          return d === 0 ? '   ±0' : `  ${d > 0 ? '+' : ''}${d}`;
        })()
      : '';
    console.log(
      String(r.rank).padStart(3) + '  ' +
      String(r.user_name).padEnd(16) +
      String(Math.round(r.rating)).padStart(5) + '  ' +
      String(r.rating_matches).padStart(3) + '   ' +
      (r.tier?.label ?? '').padEnd(10) + diff
    );
  }
  console.log('-'.repeat(58));
}
