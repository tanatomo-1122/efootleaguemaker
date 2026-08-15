import { sql } from './db.js';

/**
 * 公開してよい「みんなが楽しめるデータ」だけを組み立てる。
 * 生の試合スタッツやスカッド一覧はここからは返さない。
 */

// 承認済みの試合を、1試合につき2行（自分視点 / 相手視点）に展開するビュー
// 中止されたリーグの試合は公開集計から除外する
const PERSPECTIVE = sql`
  SELECT hs.attack_formation  AS my_formation,
         as_.attack_formation AS opp_formation,
         m.home_score         AS gf,
         m.away_score         AS ga
  FROM matches m
  JOIN leagues l  ON l.league_id  = m.league_id AND l.cancelled_at IS NULL
  JOIN squads hs  ON hs.squad_id  = m.home_squad_id
  JOIN squads as_ ON as_.squad_id = m.away_squad_id
  WHERE m.status = 'reported'
  UNION ALL
  SELECT as_.attack_formation, hs.attack_formation, m.away_score, m.home_score
  FROM matches m
  JOIN leagues l  ON l.league_id  = m.league_id AND l.cancelled_at IS NULL
  JOIN squads hs  ON hs.squad_id  = m.home_squad_id
  JOIN squads as_ ON as_.squad_id = m.away_squad_id
  WHERE m.status = 'reported'
`;

/** フォーメーションごとの勝率 */
export async function formationWinRates() {
  const rows = await sql`
    SELECT my_formation AS formation,
           COUNT(*)::int                                  AS played,
           COUNT(*) FILTER (WHERE gf >  ga)::int          AS wins,
           COUNT(*) FILTER (WHERE gf =  ga)::int          AS draws,
           COUNT(*) FILTER (WHERE gf <  ga)::int          AS losses,
           ROUND(AVG(gf)::numeric, 2)::float8             AS avg_gf,
           ROUND(AVG(ga)::numeric, 2)::float8             AS avg_ga
    FROM (${PERSPECTIVE}) AS p
    WHERE my_formation IS NOT NULL
    GROUP BY my_formation
    ORDER BY played DESC, formation
  `;

  return rows.map((r) => ({
    ...r,
    win_rate: r.played ? Math.round((r.wins / r.played) * 100) : 0,
    points_per_game: r.played
      ? Math.round(((r.wins * 3 + r.draws) / r.played) * 100) / 100
      : 0,
  }));
}

/** フォーメーションの相性表（行=自分 / 列=相手） */
export async function formationMatrix() {
  const rows = await sql`
    SELECT my_formation, opp_formation,
           COUNT(*)::int                         AS played,
           COUNT(*) FILTER (WHERE gf > ga)::int  AS wins,
           COUNT(*) FILTER (WHERE gf = ga)::int  AS draws
    FROM (${PERSPECTIVE}) AS p
    WHERE my_formation IS NOT NULL AND opp_formation IS NOT NULL
    GROUP BY my_formation, opp_formation
  `;

  // 出現したフォーメーションだけを軸にする（試合数の多い順）
  const totals = new Map();
  for (const r of rows) {
    totals.set(r.my_formation, (totals.get(r.my_formation) || 0) + r.played);
    totals.set(r.opp_formation, (totals.get(r.opp_formation) || 0) + r.played);
  }
  const axis = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([f]) => f);

  const cellMap = new Map(rows.map((r) => [`${r.my_formation}|${r.opp_formation}`, r]));
  const matrix = axis.map((my) =>
    axis.map((opp) => {
      const c = cellMap.get(`${my}|${opp}`);
      if (!c || !c.played) return { played: 0, win_rate: null };
      return {
        played: c.played,
        wins: c.wins,
        draws: c.draws,
        win_rate: Math.round((c.wins / c.played) * 100),
      };
    })
  );

  return { axis, matrix };
}

/** 公開してよいサマリー数値 */
export async function publicSummary() {
  // 中止したリーグは数えない
  const [row] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS players,
      (SELECT COUNT(*)::int FROM leagues WHERE cancelled_at IS NULL) AS leagues,
      (SELECT COUNT(*)::int FROM matches m
         JOIN leagues l ON l.league_id = m.league_id AND l.cancelled_at IS NULL
        WHERE m.status = 'reported') AS matches,
      (SELECT COALESCE(SUM(m.home_score + m.away_score), 0)::int
         FROM matches m
         JOIN leagues l ON l.league_id = m.league_id AND l.cancelled_at IS NULL
        WHERE m.status = 'reported') AS goals
  `;
  return row;
}
