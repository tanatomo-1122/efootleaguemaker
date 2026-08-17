import { sql } from './db.js';
import { POOL_LABELS } from './league.js';

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

/**
 * 終了した大会と、その各グループの優勝者。
 * トーナメントが未実装なので「勝ち抜けた人」＝グループ1位としている。
 */
export async function finishedLeagueChampions() {
  const rows = await sql`
    WITH played AS (
      SELECT m.league_id, m.pool_index, m.home_entry_id AS entry_id,
             m.home_score AS gf, m.away_score AS ga
      FROM matches m
      WHERE m.status = 'reported'
      UNION ALL
      SELECT m.league_id, m.pool_index, m.away_entry_id,
             m.away_score, m.home_score
      FROM matches m
      WHERE m.status = 'reported'
    ),
    agg AS (
      SELECT league_id, pool_index, entry_id,
             COUNT(*)::int AS played,
             SUM(CASE WHEN gf > ga THEN 3 WHEN gf = ga THEN 1 ELSE 0 END)::int AS points,
             SUM(gf - ga)::int AS goal_diff,
             SUM(gf)::int AS goals_for
      FROM played
      GROUP BY league_id, pool_index, entry_id
    ),
    ranked AS (
      SELECT a.*,
             ROW_NUMBER() OVER (
               PARTITION BY a.league_id, a.pool_index
               ORDER BY a.points DESC, a.goal_diff DESC, a.goals_for DESC
             ) AS rn
      FROM agg a
    )
    SELECT l.league_id, l.name AS league_name, l.pool_count, l.created_at,
           r.pool_index, r.points, r.goal_diff, r.played,
           u.user_name, s.team_name, s.attack_formation, s.defence_formation,
           (SELECT COUNT(*)::int FROM entries e2 WHERE e2.league_id = l.league_id) AS entry_count
    FROM ranked r
    JOIN leagues l ON l.league_id = r.league_id
    JOIN entries e ON e.entry_id = r.entry_id
    JOIN users   u ON u.user_id  = e.user_id
    JOIN squads  s ON s.squad_id = e.squad_id
    WHERE r.rn = 1
      AND l.status = 'finished'
      AND l.cancelled_at IS NULL
    ORDER BY l.created_at DESC, r.pool_index
  `;

  // 大会ごとにまとめる
  const leagues = new Map();
  for (const r of rows) {
    if (!leagues.has(r.league_id)) {
      leagues.set(r.league_id, {
        league_id: r.league_id,
        league_name: r.league_name,
        pool_count: r.pool_count,
        entry_count: r.entry_count,
        created_at: r.created_at,
        champions: [],
      });
    }
    leagues.get(r.league_id).champions.push({
      pool_index: r.pool_index,
      label: POOL_LABELS[r.pool_index] ?? String(r.pool_index + 1),
      user_name: r.user_name,
      team_name: r.team_name,
      attack_formation: r.attack_formation,
      defence_formation: r.defence_formation,
      points: r.points,
      goal_diff: r.goal_diff,
      played: r.played,
    });
  }
  return [...leagues.values()];
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
