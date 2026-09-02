import { sql } from './db.js';
import { INITIAL_RATING, CATEGORIES, DEFAULT_CATEGORY, importanceOf, computeMatch, tierOf } from './rank.js';

/**
 * EFLランクの DB 反映（サーバー専用）。
 * 計算式そのものは lib/rank.js にある（クライアントからも読むため）。
 */

// 画面から使いやすいよう、そのまま再輸出する
export * from './rank.js';

/** 「公式」は運営者だけが選べる。環境変数に列挙したユーザー名のみ許可する */
export function officialOrganizers() {
  return String(process.env.OFFICIAL_ORGANIZERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function canUseCategory(category, userName) {
  if (category !== 'official') return true;
  return officialOrganizers().includes(String(userName));
}

/* ------------------------------------------------------------------ *
 * DB への反映
 * ------------------------------------------------------------------ */

/** その試合の計算に必要な情報を集める */
async function fetchMatchForRating(matchId, tx = sql) {
  const [row] = await tx`
    SELECT m.match_id, m.league_id, m.status, m.home_score, m.away_score,
           l.category, l.cancelled_at,
           he.user_id AS home_user_id, ae.user_id AS away_user_id
    FROM matches m
    JOIN leagues l  ON l.league_id = m.league_id
    JOIN entries he ON he.entry_id = m.home_entry_id
    JOIN entries ae ON ae.entry_id = m.away_entry_id
    WHERE m.match_id = ${matchId}
  `;
  return row ?? null;
}

/**
 * 承認された試合をレーティングに反映する。
 * 既に反映済みなら何もしない（二重加算しない）。
 * @returns {Promise<null|object>} 反映した内容
 */
export async function applyMatchRating(matchId) {
  const m = await fetchMatchForRating(matchId);
  if (!m) return null;
  if (m.status !== 'reported') return null;
  if (m.cancelled_at) return null; // 中止したリーグは対象外
  if (m.home_user_id === m.away_user_id) return null;

  const importance = importanceOf(m.category);

  let applied = null;
  await sql.begin(async (tx) => {
    // 反映済みかどうかを行ロック付きで確認する
    const already = await tx`
      SELECT 1 FROM rating_events WHERE match_id = ${matchId} FOR UPDATE
    `;
    if (already.length > 0) return;

    // 両者のレーティングを取り出す（更新のためロックする）
    const users = await tx`
      SELECT user_id, rating FROM users
      WHERE user_id IN (${m.home_user_id}, ${m.away_user_id})
      FOR UPDATE
    `;
    const ratingOf = new Map(users.map((u) => [u.user_id, Number(u.rating)]));
    const homeRating = ratingOf.get(m.home_user_id) ?? INITIAL_RATING;
    const awayRating = ratingOf.get(m.away_user_id) ?? INITIAL_RATING;

    const r = computeMatch({
      homeRating,
      awayRating,
      homeScore: m.home_score,
      awayScore: m.away_score,
      importance,
    });

    for (const [side, me, opp] of [
      ['home', m.home_user_id, m.away_user_id],
      ['away', m.away_user_id, m.home_user_id],
    ]) {
      const x = r[side];
      await tx`
        INSERT INTO rating_events
          (match_id, user_id, opponent_id, league_id, importance,
           result, expected, rating_before, rating_after, delta)
        VALUES (${matchId}, ${me}, ${opp}, ${m.league_id}, ${importance},
                ${x.result}, ${x.expected}, ${x.before}, ${x.after}, ${x.delta})
      `;
      await tx`
        UPDATE users
        SET rating = ${x.after}, rating_matches = rating_matches + 1
        WHERE user_id = ${me}
      `;
    }
    applied = r;
  });

  return applied;
}

/**
 * 反映済みの変動を取り消す（結果が取り消されたとき用）。
 * 履歴の途中を消すと以降の計算が厳密には合わなくなるので、
 * 呼び出し側では続けて recomputeAllRatings() を走らせている。
 */
export async function revertMatchRating(matchId) {
  await sql.begin(async (tx) => {
    const events = await tx`
      SELECT user_id, delta FROM rating_events WHERE match_id = ${matchId} FOR UPDATE
    `;
    if (events.length === 0) return;

    for (const e of events) {
      await tx`
        UPDATE users
        SET rating = rating - ${e.delta},
            rating_matches = GREATEST(0, rating_matches - 1)
        WHERE user_id = ${e.user_id}
      `;
    }
    await tx`DELETE FROM rating_events WHERE match_id = ${matchId}`;
  });
}

/**
 * 承認済みの全試合を時系列でたどり、レーティングを最初から計算し直す。
 *
 * 使いどころ:
 *   - 過去の試合から初期値を決めるとき（導入時の一括計算）
 *   - リーグのカテゴリーを後から変えたとき
 *   - 結果を取り消して履歴がずれたとき
 *
 * @returns {Promise<{users:number, matches:number}>}
 */
export async function recomputeAllRatings() {
  // 承認された順にたどる。時刻が無い場合は match_id の順
  const matches = await sql`
    SELECT m.match_id, m.league_id, m.home_score, m.away_score,
           l.category,
           he.user_id AS home_user_id, ae.user_id AS away_user_id
    FROM matches m
    JOIN leagues l  ON l.league_id = m.league_id AND l.cancelled_at IS NULL
    JOIN entries he ON he.entry_id = m.home_entry_id
    JOIN entries ae ON ae.entry_id = m.away_entry_id
    WHERE m.status = 'reported'
    ORDER BY COALESCE(m.approved_at, m.reported_at), m.match_id
  `;

  const ratings = new Map(); // user_id -> rating
  const counts = new Map();
  const get = (id) => (ratings.has(id) ? ratings.get(id) : INITIAL_RATING);

  const events = [];
  for (const m of matches) {
    if (m.home_user_id === m.away_user_id) continue;
    const importance = importanceOf(m.category);
    const r = computeMatch({
      homeRating: get(m.home_user_id),
      awayRating: get(m.away_user_id),
      homeScore: m.home_score,
      awayScore: m.away_score,
      importance,
    });

    ratings.set(m.home_user_id, r.home.after);
    ratings.set(m.away_user_id, r.away.after);
    counts.set(m.home_user_id, (counts.get(m.home_user_id) ?? 0) + 1);
    counts.set(m.away_user_id, (counts.get(m.away_user_id) ?? 0) + 1);

    for (const [side, me, opp] of [
      ['home', m.home_user_id, m.away_user_id],
      ['away', m.away_user_id, m.home_user_id],
    ]) {
      const x = r[side];
      events.push({
        match_id: m.match_id,
        user_id: me,
        opponent_id: opp,
        league_id: m.league_id,
        importance,
        result: x.result,
        expected: x.expected,
        rating_before: x.before,
        rating_after: x.after,
        delta: x.delta,
      });
    }
  }

  await sql.begin(async (tx) => {
    await tx`DELETE FROM rating_events`;
    await tx`UPDATE users SET rating = ${INITIAL_RATING}, rating_matches = 0`;

    if (events.length > 0) {
      // まとめて入れる（件数が多い場合に備えて分割）
      const CHUNK = 200;
      for (let i = 0; i < events.length; i += CHUNK) {
        const part = events.slice(i, i + CHUNK);
        await tx`INSERT INTO rating_events ${tx(part, ...Object.keys(part[0]))}`;
      }
    }
    for (const [userId, rating] of ratings) {
      await tx`
        UPDATE users SET rating = ${rating}, rating_matches = ${counts.get(userId) ?? 0}
        WHERE user_id = ${userId}
      `;
    }
  });

  return { users: ratings.size, matches: matches.length };
}

/** ランキング（レーティング降順）。公開してよい情報だけ返す */
export async function listRanking() {
  const rows = await sql`
    SELECT u.user_id, u.user_name, u.photo_path, u.last_seen_at,
           u.rating, u.rating_matches,
           (SELECT COALESCE(SUM(e.delta), 0) FROM rating_events e
             WHERE e.user_id = u.user_id
               AND e.created_at > now() - interval '30 days') AS delta_30d,
           (SELECT e.delta FROM rating_events e
             WHERE e.user_id = u.user_id ORDER BY e.event_id DESC LIMIT 1) AS last_delta
    FROM users u
    WHERE u.rating_matches > 0
    ORDER BY u.rating DESC, u.rating_matches DESC, u.user_name
  `;
  return rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    rating: Number(r.rating),
    delta_30d: Number(r.delta_30d ?? 0),
    last_delta: r.last_delta === null ? null : Number(r.last_delta),
    tier: tierOf(Number(r.rating)),
  }));
}

/** まだ1試合もしていない登録者（ランキング外として別に出す） */
export async function listUnrated() {
  return await sql`
    SELECT user_id, user_name, photo_path, rating
    FROM users WHERE rating_matches = 0
    ORDER BY user_name
  `;
}
