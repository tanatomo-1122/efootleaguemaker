import { sql } from './db.js';
import { STAT_COLUMNS } from './schema.js';

export const POOL_LABELS = 'ABCDEFGH'.split('');

/* ------------------------------------------------------------------ *
 * 参照系
 * ------------------------------------------------------------------ */

export async function getLeague(leagueId) {
  const [row] = await sql`
    SELECT l.*, ou.user_name AS organizer_user_name
    FROM leagues l
    LEFT JOIN users ou ON ou.user_id = l.organizer_user_id
    WHERE l.league_id = ${leagueId}
  `;
  return row ?? null;
}

export async function listLeagues() {
  const rows = await sql`
    SELECT l.*,
           ou.user_name AS organizer_user_name,
           (SELECT COUNT(*)::int FROM entries e WHERE e.league_id = l.league_id) AS entry_count
    FROM leagues l
    LEFT JOIN users ou ON ou.user_id = l.organizer_user_id
    ORDER BY
      CASE l.status WHEN 'recruiting' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      l.created_at DESC
  `;
  return rows.map((l) => ({ ...l, capacity: l.players_per_pool * l.pool_count }));
}

export async function listEntries(leagueId) {
  return await sql`
    SELECT e.*, u.user_name, u.photo_path AS user_photo,
           s.team_name, s.attack_formation, s.defence_formation,
           s.team_style, s.team_power, s.photo_path AS squad_photo
    FROM entries e
    JOIN users u  ON u.user_id  = e.user_id
    JOIN squads s ON s.squad_id = e.squad_id
    WHERE e.league_id = ${leagueId}
    ORDER BY e.pool_index NULLS FIRST, e.entry_id
  `;
}

// ユーザーIDは秘密情報なので SELECT しない（user_name だけを持ち回る）
export async function listMatches(leagueId) {
  return await sql`
    SELECT m.*,
           hu.user_id   AS home_user_id,
           au.user_id   AS away_user_id,
           hu.user_name AS home_user_name,
           au.user_name AS away_user_name
    FROM matches m
    JOIN entries he ON he.entry_id = m.home_entry_id
    JOIN entries ae ON ae.entry_id = m.away_entry_id
    JOIN users   hu ON hu.user_id  = he.user_id
    JOIN users   au ON au.user_id  = ae.user_id
    WHERE m.league_id = ${leagueId}
    ORDER BY m.pool_index, m.round, m.match_id
  `;
}

export async function getMatch(matchId) {
  const [row] = await sql`
    SELECT m.*,
           hu.user_id   AS home_user_id,
           au.user_id   AS away_user_id,
           hu.user_name AS home_user_name,
           au.user_name AS away_user_name
    FROM matches m
    JOIN entries he ON he.entry_id = m.home_entry_id
    JOIN entries ae ON ae.entry_id = m.away_entry_id
    JOIN users   hu ON hu.user_id  = he.user_id
    JOIN users   au ON au.user_id  = ae.user_id
    WHERE m.match_id = ${matchId}
  `;
  return row ?? null;
}

/* ------------------------------------------------------------------ *
 * 組み合わせ確定: 規定人数に達したら自動締切 → ランダム振り分け → 日程生成
 * ------------------------------------------------------------------ */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 円卓法(サークルメソッド)による総当たり日程 */
export function roundRobin(ids) {
  const arr = shuffle(ids);
  if (arr.length % 2 === 1) arr.push(null); // 奇数は bye を挿入
  const n = arr.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a == null || b == null) continue;
      // ホーム/アウェイが偏らないよう1節おきに入れ替える
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop()); // 先頭を固定して回転
  }
  return rounds;
}

/**
 * 規定人数に達していればリーグを締め切り、
 * プールへのランダム振り分けと対戦順の確定まで行う。
 * @returns {Promise<boolean>} 確定したら true
 */
export async function tryCloseAndDraw(leagueId) {
  const league = await getLeague(leagueId);
  if (!league || league.status !== 'recruiting') return false;

  const squads = await sql`
    SELECT e.entry_id, s.squad_id, s.team_name
    FROM entries e
    JOIN squads s ON s.squad_id = e.squad_id
    WHERE e.league_id = ${leagueId}
  `;
  const capacity = league.players_per_pool * league.pool_count;
  if (squads.length < capacity) return false;

  const squadOf = new Map(squads.map((s) => [s.entry_id, s]));

  // --- ランダムにプール分け ---
  const shuffled = shuffle(squads.map((s) => s.entry_id));
  const pools = Array.from({ length: league.pool_count }, () => []);
  shuffled.forEach((entryId, i) => {
    const pool = Math.floor(i / league.players_per_pool);
    pools[Math.min(pool, league.pool_count - 1)].push(entryId);
  });

  // --- 対戦順番を組む ---
  const matchRows = [];
  pools.forEach((poolEntries, poolIndex) => {
    roundRobin(poolEntries).forEach((pairs, roundIdx) => {
      pairs.forEach(([home, away]) => {
        const h = squadOf.get(home);
        const a = squadOf.get(away);
        matchRows.push({
          league_id: leagueId,
          pool_index: poolIndex,
          round: roundIdx + 1,
          home_entry_id: home,
          away_entry_id: away,
          home_squad_id: h.squad_id,
          away_squad_id: a.squad_id,
          home_team_name: h.team_name,
          away_team_name: a.team_name,
          status: 'scheduled',
        });
      });
    });
  });

  await sql.begin(async (tx) => {
    // 二重抽選の防止（募集中のときだけ開催中へ進める）
    const updated = await tx`
      UPDATE leagues SET status = 'in_progress'
      WHERE league_id = ${leagueId} AND status = 'recruiting'
      RETURNING league_id
    `;
    if (updated.length === 0) return;

    for (const [poolIndex, poolEntries] of pools.entries()) {
      await tx`
        UPDATE entries SET pool_index = ${poolIndex}
        WHERE entry_id = ANY(${poolEntries})
      `;
    }

    await tx`INSERT INTO matches ${tx(matchRows, ...Object.keys(matchRows[0]))}`;
  });

  return true;
}

/* ------------------------------------------------------------------ *
 * 順位表: 勝ち点降順 → 得失点差降順 → 総得点降順
 * ------------------------------------------------------------------ */

export async function buildStandings(leagueId) {
  const league = await getLeague(leagueId);
  if (!league) return [];
  const [entries, allMatches] = await Promise.all([
    listEntries(leagueId),
    listMatches(leagueId),
  ]);
  const matches = allMatches.filter((m) => m.status === 'reported');

  const rows = new Map();
  for (const e of entries) {
    rows.set(e.entry_id, {
      entry_id: e.entry_id,
      pool_index: e.pool_index ?? 0,
      user_name: e.user_name,
      user_photo: e.user_photo,
      team_name: e.team_name,
      attack_formation: e.attack_formation,
      defence_formation: e.defence_formation,
      team_style: e.team_style,
      team_power: e.team_power,
      played: 0, win: 0, draw: 0, loss: 0,
      goals_for: 0, goals_against: 0, goal_diff: 0, points: 0,
    });
  }

  for (const m of matches) {
    const h = rows.get(m.home_entry_id);
    const a = rows.get(m.away_entry_id);
    if (!h || !a) continue;
    const hs = Number(m.home_score ?? 0);
    const as = Number(m.away_score ?? 0);
    h.played++; a.played++;
    h.goals_for += hs; h.goals_against += as;
    a.goals_for += as; a.goals_against += hs;
    if (hs > as) { h.win++; a.loss++; h.points += 3; }
    else if (hs < as) { a.win++; h.loss++; a.points += 3; }
    else { h.draw++; a.draw++; h.points += 1; a.points += 1; }
  }

  const pools = Array.from({ length: league.pool_count }, (_, i) => ({
    pool_index: i,
    label: POOL_LABELS[i] ?? String(i + 1),
    rows: [],
  }));

  for (const r of rows.values()) {
    r.goal_diff = r.goals_for - r.goals_against;
    const p = pools[r.pool_index];
    if (p) p.rows.push(r);
  }

  for (const p of pools) {
    p.rows.sort(
      (x, y) =>
        y.points - x.points ||
        y.goal_diff - x.goal_diff ||
        y.goals_for - x.goals_for ||
        String(x.team_name).localeCompare(String(y.team_name))
    );
    p.rows.forEach((r, i) => { r.rank = i + 1; });
  }

  return pools;
}

/* ------------------------------------------------------------------ *
 * 試合結果の登録(スカッド名の自動照合つき)
 * ------------------------------------------------------------------ */

function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s　]/g, '')
    // 全角英数を半角へ
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * 読み取ったチーム名と、その試合に登録された2つのスカッド名を照合する。
 * @returns {'normal'|'swapped'|null} normal=読み取りhome==登録home / swapped=左右逆 / null=照合失敗
 */
export function matchSquadNames(match, parsedHome, parsedAway) {
  const ph = normalizeName(parsedHome);
  const pa = normalizeName(parsedAway);
  const rh = normalizeName(match.home_team_name);
  const ra = normalizeName(match.away_team_name);
  if (!ph || !pa) return null;

  const hit = (x, y) => x === y || (x.length >= 3 && (x.includes(y) || y.includes(x)));

  if (hit(ph, rh) && hit(pa, ra)) return 'normal';
  if (hit(ph, ra) && hit(pa, rh)) return 'swapped';
  return null;
}

/**
 * ホーム側が試合結果を登録する。この時点では「アウェイの承認待ち(pending)」となり、
 * リーグ表・CSV にはまだ反映されない。
 * @param {number} matchId
 * @param {object} stats  home_xxx / away_xxx のスタッツ
 * @param {object} opts   { imagePath, source }
 */
export async function saveMatchResult(matchId, stats, opts = {}) {
  const [match] = await sql`SELECT * FROM matches WHERE match_id = ${matchId}`;
  if (!match) throw new Error('試合が見つかりません');

  const hs = Number(stats.home_score ?? 0);
  const as = Number(stats.away_score ?? 0);
  const result = hs > as ? 'home_win' : hs < as ? 'away_win' : 'draw';

  const payload = {};
  for (const c of STAT_COLUMNS) {
    const v = stats[c];
    payload[c] = v === '' || v === undefined || v === null ? null : Number(v);
  }
  payload.match_result = result;
  payload.status = 'pending';
  payload.image_path = opts.imagePath ?? match.image_path ?? null;
  payload.match_source = opts.source ?? 'manual';
  payload.approved_at = null;
  payload.reject_note = null;

  await sql`
    UPDATE matches
    SET ${sql(payload, ...Object.keys(payload))}, reported_at = now()
    WHERE match_id = ${matchId}
  `;

  return { ...match, ...payload };
}

/** アウェイ側が承認する → 正式な結果として確定し、リーグ表と CSV に反映される */
export async function approveMatch(matchId) {
  const updated = await sql`
    UPDATE matches
    SET status = 'reported', approved_at = now(), reject_note = NULL
    WHERE match_id = ${matchId} AND status = 'pending'
    RETURNING match_id
  `;
  if (updated.length === 0) throw new Error('承認待ちの結果がありません');
}

/** アウェイ側が差し戻す → ホームが登録し直す */
export async function rejectMatch(matchId, note) {
  const updated = await sql`
    UPDATE matches
    SET status = 'scheduled', reported_at = NULL,
        reject_note = ${String(note || '').trim() || null}
    WHERE match_id = ${matchId} AND status = 'pending'
    RETURNING match_id
  `;
  if (updated.length === 0) throw new Error('承認待ちの結果がありません');
}

/** 全試合がアウェイ承認済みならリーグを確定できる */
export async function canFinalize(leagueId) {
  const [row] = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'reported')::int AS done
    FROM matches WHERE league_id = ${leagueId}
  `;
  return row.total > 0 && row.total === row.done;
}

export async function finalizeLeague(leagueId) {
  if (!(await canFinalize(leagueId))) throw new Error('未消化・承認待ちの試合があります');
  await sql`UPDATE leagues SET status = 'finished' WHERE league_id = ${leagueId}`;
}

/* ------------------------------------------------------------------ *
 * 決勝トーナメント: 各プールの上位2名が進出
 *   ワールドカップ方式で「A組1位 × B組2位」のようにたすき掛けで組む
 * ------------------------------------------------------------------ */

export async function buildBracket(leagueId) {
  const league = await getLeague(leagueId);
  if (!league) return null;

  const [pools, matches] = await Promise.all([
    buildStandings(leagueId),
    listMatches(leagueId),
  ]);

  // そのプールの全試合が承認済みなら順位が確定したとみなす
  const settled = new Map(
    pools.map((p) => {
      const ms = matches.filter((m) => m.pool_index === p.pool_index);
      return [p.pool_index, ms.length > 0 && ms.every((m) => m.status === 'reported')];
    })
  );

  const seedOf = (poolIndex, rank) => {
    const pool = pools[poolIndex];
    const row = pool?.rows?.[rank - 1];
    return {
      label: `${pool?.label ?? '?'}組 ${rank}位`,
      team_name: settled.get(poolIndex) ? row?.team_name ?? null : null,
      user_name: settled.get(poolIndex) ? row?.user_name ?? null : null,
      settled: !!settled.get(poolIndex),
    };
  };

  // --- 1回戦の組み合わせ ---
  const first = [];
  const n = league.pool_count;
  for (let k = 0; k + 1 < n; k += 2) {
    first.push([seedOf(k, 1), seedOf(k + 1, 2)]);
    first.push([seedOf(k + 1, 1), seedOf(k, 2)]);
  }
  if (n % 2 === 1) {
    // 余ったプールは組内の1位 × 2位
    first.push([seedOf(n - 1, 1), seedOf(n - 1, 2)]);
  }

  // 2の冪になるよう不戦勝(BYE)で埋める
  const size = Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, first.length))));
  while (first.length < size) first.push([{ label: 'BYE', team_name: null, settled: true }, null]);

  const rounds = [{ name: roundName(first.length), matches: first }];
  let count = first.length;
  while (count > 1) {
    count = Math.ceil(count / 2);
    rounds.push({
      name: roundName(count),
      matches: Array.from({ length: count }, () => [null, null]),
    });
  }

  return { rounds, slots: first.length * 2 };
}

function roundName(matchCount) {
  if (matchCount === 1) return '決勝';
  if (matchCount === 2) return '準決勝';
  if (matchCount === 4) return '準々決勝';
  return `ラウンド${matchCount * 2}`;
}
