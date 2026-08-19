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
  if (!row) return null;
  return { ...row, cancelled: row.cancelled_at !== null };
}

/**
 * リーグ一覧。中止したリーグは既定で除外する（募集一覧から隠す）。
 * @param {object} opts { includeCancelled?: boolean, excludeFinished?: boolean, organizerUserId?: number }
 */
export async function listLeagues(opts = {}) {
  const rows = await sql`
    SELECT l.*,
           ou.user_name AS organizer_user_name,
           (SELECT COUNT(*)::int FROM entries e WHERE e.league_id = l.league_id) AS entry_count
    FROM leagues l
    LEFT JOIN users ou ON ou.user_id = l.organizer_user_id
    WHERE ${
      opts.includeCancelled
        ? sql`TRUE`
        : opts.organizerUserId
          ? sql`(l.cancelled_at IS NULL OR l.organizer_user_id = ${opts.organizerUserId})`
          : sql`l.cancelled_at IS NULL`
    }
      -- 終了した大会は募集一覧に出さない（結果はデータ画面で見られる）
      AND ${opts.excludeFinished ? sql`l.status <> 'finished'` : sql`TRUE`}
    ORDER BY
      CASE WHEN l.cancelled_at IS NOT NULL THEN 3
           WHEN l.status = 'recruiting'    THEN 0
           WHEN l.status = 'in_progress'   THEN 1
           ELSE 2 END,
      l.created_at DESC
  `;
  return rows.map((l) => ({
    ...l,
    capacity: l.players_per_pool * l.pool_count,
    cancelled: l.cancelled_at !== null,
  }));
}

export async function listEntries(leagueId) {
  return await sql`
    SELECT e.*, u.user_name, u.photo_path AS user_photo, u.last_seen_at,
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
// 部屋番号も一覧では返さず、「部屋が立っているか」だけを渡す
export async function listMatches(leagueId) {
  return await sql`
    SELECT m.match_id, m.league_id, m.pool_index, m.round,
           m.home_entry_id, m.away_entry_id, m.home_squad_id, m.away_squad_id,
           m.home_team_name, m.away_team_name, m.match_result, m.status,
           m.home_score, m.away_score,
           m.reported_at, m.approved_at, m.reject_note, m.admin_note,
           (m.room_code IS NOT NULL) AS has_room,
           m.room_posted_at,
           hu.user_id   AS home_user_id,
           au.user_id   AS away_user_id,
           hu.user_name AS home_user_name,
           au.user_name AS away_user_name,
           hu.last_seen_at AS home_last_seen_at,
           au.last_seen_at AS away_last_seen_at
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
           au.user_name AS away_user_name,
           hu.last_seen_at AS home_last_seen_at,
           au.last_seen_at AS away_last_seen_at,
           ab.user_name AS approved_by_user_name
    FROM matches m
    JOIN entries he ON he.entry_id = m.home_entry_id
    JOIN entries ae ON ae.entry_id = m.away_entry_id
    JOIN users   hu ON hu.user_id  = he.user_id
    JOIN users   au ON au.user_id  = ae.user_id
    LEFT JOIN users ab ON ab.user_id = m.approved_by_user_id
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

async function fetchEntrySquads(leagueId) {
  return await sql`
    SELECT e.entry_id, s.squad_id, s.team_name
    FROM entries e
    JOIN squads s ON s.squad_id = e.squad_id
    WHERE e.league_id = ${leagueId}
  `;
}

/** n人を poolCount 個のプールへ、できるだけ均等に分ける（例: 7人2プール → 4,3） */
function evenPoolSizes(n, poolCount) {
  const base = Math.floor(n / poolCount);
  const rest = n % poolCount;
  return Array.from({ length: poolCount }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * 抽選と日程生成の本体。
 * @param {object} league
 * @param {Array}  squads  参加者（entry_id / squad_id / team_name）
 * @param {number[]} poolSizes 各プールの人数
 * @param {object} sizeUpdate 実際の構成に合わせて leagues を更新する場合の値
 */
async function drawLeague(league, squads, poolSizes, sizeUpdate = null) {
  const squadOf = new Map(squads.map((s) => [s.entry_id, s]));

  // --- ランダムにプール分け ---
  const shuffled = shuffle(squads.map((s) => s.entry_id));
  const pools = [];
  let cursor = 0;
  for (const size of poolSizes) {
    pools.push(shuffled.slice(cursor, cursor + size));
    cursor += size;
  }

  // --- 対戦順番を組む ---
  const matchRows = [];
  pools.forEach((poolEntries, poolIndex) => {
    roundRobin(poolEntries).forEach((pairs, roundIdx) => {
      pairs.forEach(([home, away]) => {
        const h = squadOf.get(home);
        const a = squadOf.get(away);
        matchRows.push({
          league_id: league.league_id,
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

  let drawn = false;
  await sql.begin(async (tx) => {
    // 二重抽選の防止（募集中のときだけ開催中へ進める）
    const updated = await tx`
      UPDATE leagues SET status = 'in_progress'
      WHERE league_id = ${league.league_id} AND status = 'recruiting' AND cancelled_at IS NULL
      RETURNING league_id
    `;
    if (updated.length === 0) return;

    if (sizeUpdate) {
      await tx`
        UPDATE leagues
        SET pool_count = ${sizeUpdate.pool_count},
            players_per_pool = ${sizeUpdate.players_per_pool}
        WHERE league_id = ${league.league_id}
      `;
    }

    for (const [poolIndex, poolEntries] of pools.entries()) {
      await tx`
        UPDATE entries SET pool_index = ${poolIndex}
        WHERE entry_id = ANY(${poolEntries})
      `;
    }

    if (matchRows.length > 0) {
      await tx`INSERT INTO matches ${tx(matchRows, ...Object.keys(matchRows[0]))}`;
    }
    drawn = true;
  });

  return drawn;
}

/**
 * 規定人数に達していればリーグを締め切り、
 * プールへのランダム振り分けと対戦順の確定まで行う。
 * @returns {Promise<boolean>} 確定したら true
 */
export async function tryCloseAndDraw(leagueId) {
  const league = await getLeague(leagueId);
  if (!league || league.status !== 'recruiting' || league.cancelled) return false;

  const squads = await fetchEntrySquads(leagueId);
  const capacity = league.players_per_pool * league.pool_count;
  if (squads.length < capacity) return false;

  // 定員ちょうどが基本だが、上振れしていても均等に分ける
  return await drawLeague(league, squads, evenPoolSizes(squads.length, league.pool_count));
}

/**
 * 定員に届いていなくても、今いる人数でリーグを始める（主催者のみ）。
 * プール数は「1プール2人以上」を満たす範囲まで自動的に減らす。
 */
export async function forceStartLeague(leagueId) {
  const league = await getLeague(leagueId);
  if (!league) throw new Error('リーグが存在しません');
  if (league.cancelled) throw new Error('中止中のリーグは開始できません。先に再開してください');
  if (league.status !== 'recruiting') throw new Error('このリーグは既に開始しています');

  const squads = await fetchEntrySquads(leagueId);
  if (squads.length < 2) {
    throw new Error('参加者が2人以上いないと開始できません');
  }

  // 1プールに2人未満ができないよう、プール数を抑える
  const poolCount = Math.max(1, Math.min(league.pool_count, Math.floor(squads.length / 2)));
  const sizes = evenPoolSizes(squads.length, poolCount);

  const drawn = await drawLeague(league, squads, sizes, {
    pool_count: poolCount,
    players_per_pool: Math.max(...sizes),
  });
  if (!drawn) throw new Error('開始できませんでした。画面を再読み込みしてください');

  return { players: squads.length, pool_count: poolCount, pool_sizes: sizes };
}

/**
 * 募集人数（プール数 / 1プールの人数）を変更する（主催者のみ・開始前だけ）。
 * 変更後に定員を満たしていれば、その場で抽選まで進む。
 */
export async function changeLeagueSize(leagueId, playersPerPool, poolCount) {
  const league = await getLeague(leagueId);
  if (!league) throw new Error('リーグが存在しません');
  if (league.cancelled) throw new Error('中止中のリーグは変更できません');
  if (league.status !== 'recruiting') throw new Error('開始後は募集人数を変更できません');

  const p = Number(playersPerPool);
  const c = Number(poolCount);
  if (!(p >= 2 && p <= 16)) throw new Error('1プールの人数は2〜16人で指定してください');
  if (!(c >= 1 && c <= 8)) throw new Error('プール数は1〜8で指定してください');

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count FROM entries WHERE league_id = ${leagueId}
  `;
  if (p * c < count) {
    throw new Error(
      `既に${count}人が申し込んでいるため、定員を${p * c}人には減らせません`
    );
  }

  await sql`
    UPDATE leagues SET players_per_pool = ${p}, pool_count = ${c}
    WHERE league_id = ${leagueId} AND status = 'recruiting' AND cancelled_at IS NULL
  `;

  // 縮小した結果すでに定員ちょうどなら、そのまま抽選へ
  const drawn = await tryCloseAndDraw(leagueId);
  return { capacity: p * c, entries: count, drawn };
}

/* ------------------------------------------------------------------ *
 * 順位表: 勝ち点降順 → 得失点差降順 → 総得点降順
 * ------------------------------------------------------------------ */

export async function buildStandings(leagueId) {
  const league = await getLeague(leagueId);
  if (!league) return [];
  const entries = await listEntries(leagueId);
  const allMatches = await listMatches(leagueId);
  const matches = allMatches.filter((m) => m.status === 'reported');

  const rows = new Map();
  for (const e of entries) {
    rows.set(e.entry_id, {
      entry_id: e.entry_id,
      pool_index: e.pool_index ?? 0,
      user_name: e.user_name,
      user_photo: e.user_photo,
      last_seen_at: e.last_seen_at,
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

/* ------------------------------------------------------------------ *
 * 主催者による代理操作
 *   相手が音信不通で試合が進まないときの詰み防止。
 *   誰がやったかを必ず残し、画面にも「代理」と表示する。
 * ------------------------------------------------------------------ */

/**
 * 主催者が結果を直接確定する（アウェイの承認を待たない）。
 * スクショが無くても入れられるので、不戦勝の記録にも使える。
 */
export async function settleMatchByOrganizer(matchId, stats, organizerUserId, note) {
  const [match] = await sql`SELECT * FROM matches WHERE match_id = ${matchId}`;
  if (!match) throw new Error('試合が見つかりません');

  const hs = Number(stats.home_score ?? 0);
  const as = Number(stats.away_score ?? 0);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) {
    throw new Error('得点(スコア)を入力してください');
  }
  const result = hs > as ? 'home_win' : hs < as ? 'away_win' : 'draw';

  const payload = {};
  for (const c of STAT_COLUMNS) {
    const v = stats[c];
    payload[c] = v === '' || v === undefined || v === null ? null : Number(v);
  }

  await sql`
    UPDATE matches
    SET ${sql(payload, ...Object.keys(payload))},
        match_result = ${result},
        status = 'reported',
        match_source = 'organizer',
        reported_at = COALESCE(reported_at, now()),
        approved_at = now(),
        reject_note = NULL,
        approved_by_user_id = ${organizerUserId},
        reported_by_user_id = COALESCE(reported_by_user_id, ${organizerUserId}),
        admin_note = ${String(note || '').trim() || '主催者が代理で確定'},
        room_code = NULL, room_note = NULL, room_posted_at = NULL
    WHERE match_id = ${matchId}
  `;

  await clearMessages(matchId);
  return { home_score: hs, away_score: as, match_result: result };
}

/** 承認待ちの結果を、主催者が代理で承認する */
export async function approveMatchByOrganizer(matchId, organizerUserId, note) {
  const updated = await sql`
    UPDATE matches
    SET status = 'reported', approved_at = now(), reject_note = NULL,
        approved_by_user_id = ${organizerUserId},
        admin_note = ${String(note || '').trim() || '主催者が代理で承認'},
        room_code = NULL, room_note = NULL, room_posted_at = NULL
    WHERE match_id = ${matchId} AND status = 'pending'
    RETURNING match_id
  `;
  if (updated.length === 0) throw new Error('承認待ちの結果がありません');
  await clearMessages(matchId);
}

/** 結果を取り消して未消化に戻す（誤って確定したときの救済） */
export async function resetMatchByOrganizer(matchId, organizerUserId, note) {
  const cols = STAT_COLUMNS.map((c) => `${c} = NULL`).join(', ');
  const [row] = await sql.unsafe(
    `UPDATE matches
     SET ${cols},
         match_result = NULL,
         status = 'scheduled',
         match_source = NULL,
         reported_at = NULL,
         approved_at = NULL,
         approved_by_user_id = NULL,
         reported_by_user_id = NULL,
         reject_note = NULL,
         admin_note = $2
     WHERE match_id = $1
     RETURNING match_id`,
    [matchId, String(note || '').trim() || '主催者が結果を取り消し']
  );
  if (!row) throw new Error('試合が見つかりません');
}

/** アウェイ側が承認する → 正式な結果として確定し、リーグ表と CSV に反映される */
export async function approveMatch(matchId) {
  const updated = await sql`
    UPDATE matches
    SET status = 'reported', approved_at = now(), reject_note = NULL,
        -- 試合が終わったので部屋番号は片付ける
        room_code = NULL, room_note = NULL, room_posted_at = NULL
    WHERE match_id = ${matchId} AND status = 'pending'
    RETURNING match_id
  `;
  if (updated.length === 0) throw new Error('承認待ちの結果がありません');

  // トークは試合中だけのものなので、終わったら消す
  await clearMessages(matchId);
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
 * 対戦部屋の番号
 *   ホームが eFootball で部屋を立てて番号を貼り、アウェイが確認する。
 *   番号は対戦する2人以外には返さない。
 * ------------------------------------------------------------------ */

export const ROOM_CODE_MAX = 40;

export async function setMatchRoom(matchId, code, note) {
  const room = String(code ?? '').trim();
  if (!room) throw new Error('部屋番号を入力してください');
  if (room.length > ROOM_CODE_MAX) {
    throw new Error(`部屋番号は${ROOM_CODE_MAX}文字以内で入力してください`);
  }

  await sql`
    UPDATE matches
    SET room_code = ${room},
        room_note = ${String(note ?? '').trim() || null},
        room_posted_at = now()
    WHERE match_id = ${matchId}
  `;
  return { room_code: room };
}

export async function clearMatchRoom(matchId) {
  await sql`
    UPDATE matches
    SET room_code = NULL, room_note = NULL, room_posted_at = NULL
    WHERE match_id = ${matchId}
  `;
}

/** 部屋番号そのものを取り出す。呼び出し側で必ず本人確認をしてから使うこと */
export async function getMatchRoom(matchId) {
  const [row] = await sql`
    SELECT room_code, room_note, room_posted_at FROM matches WHERE match_id = ${matchId}
  `;
  return row ?? null;
}

/* ------------------------------------------------------------------ *
 * 対戦相手とのトーク
 *   試合中の連絡用。結果が承認された時点で消える。
 * ------------------------------------------------------------------ */

export const MESSAGE_MAX = 300;

/**
 * トークの画面に必要なものを「1クエリ」で取る。
 *
 * ポーリングで毎秒何度も叩かれる経路なので、往復を1回に抑えるのが効く。
 * 試合・リーグ・本人確認・メッセージをまとめて取得する。
 */
export async function chatSnapshot(matchId, efootballUserId, afterId = 0) {
  const [row] = await sql`
    WITH touched AS (
      -- 開いている間は在席とみなす。ポーリングのついでなので通信は増えない
      UPDATE users SET last_seen_at = now()
      WHERE efootball_user_id = ${efootballUserId}
      RETURNING user_id
    )
    SELECT
      m.match_id, m.status AS match_status,
      hu.user_id AS home_user_id, au.user_id AS away_user_id,
      hu.user_name AS home_user_name, au.user_name AS away_user_name,
      l.status AS league_status, (l.cancelled_at IS NOT NULL) AS league_cancelled,
      (SELECT user_id FROM touched) AS me_user_id,
      COALESCE((
        SELECT json_agg(x ORDER BY x.message_id)
        FROM (
          SELECT mm.message_id, mm.user_id, mm.body, mm.created_at, u2.user_name
          FROM match_messages mm
          JOIN users u2 ON u2.user_id = mm.user_id
          WHERE mm.match_id = m.match_id AND mm.message_id > ${Number(afterId) || 0}
          ORDER BY mm.message_id
          LIMIT 200
        ) x
      ), '[]'::json) AS messages
    FROM matches m
    JOIN leagues l  ON l.league_id = m.league_id
    JOIN entries he ON he.entry_id = m.home_entry_id
    JOIN entries ae ON ae.entry_id = m.away_entry_id
    JOIN users   hu ON hu.user_id  = he.user_id
    JOIN users   au ON au.user_id  = ae.user_id
    WHERE m.match_id = ${matchId}
  `;
  return row ?? null;
}

export async function listMessages(matchId, afterId = 0) {
  return await sql`
    SELECT mm.message_id, mm.user_id, mm.body, mm.created_at, u.user_name
    FROM match_messages mm
    JOIN users u ON u.user_id = mm.user_id
    WHERE mm.match_id = ${matchId} AND mm.message_id > ${Number(afterId) || 0}
    ORDER BY mm.message_id
    LIMIT 200
  `;
}

export async function postMessage(matchId, userId, body) {
  const text = String(body ?? '').trim();
  if (!text) throw new Error('メッセージを入力してください');
  if (text.length > MESSAGE_MAX) {
    throw new Error(`メッセージは${MESSAGE_MAX}文字以内で入力してください`);
  }

  const [row] = await sql`
    INSERT INTO match_messages (match_id, user_id, body)
    VALUES (${matchId}, ${userId}, ${text})
    RETURNING message_id
  `;
  return row;
}

export async function clearMessages(matchId) {
  await sql`DELETE FROM match_messages WHERE match_id = ${matchId}`;
}

/* ------------------------------------------------------------------ *
 * 中止 / 再開
 *   status は変えず cancelled_at で表すので、再開すれば元の状態に戻る
 * ------------------------------------------------------------------ */

export async function cancelLeague(leagueId, reason) {
  const [row] = await sql`
    UPDATE leagues
    SET cancelled_at = now(), cancel_reason = ${String(reason || '').trim() || null}
    WHERE league_id = ${leagueId} AND cancelled_at IS NULL
    RETURNING league_id
  `;
  if (!row) throw new Error('このリーグは既に中止されています');
}

export async function resumeLeague(leagueId) {
  const [row] = await sql`
    UPDATE leagues
    SET cancelled_at = NULL, cancel_reason = NULL
    WHERE league_id = ${leagueId} AND cancelled_at IS NOT NULL
    RETURNING league_id
  `;
  if (!row) throw new Error('このリーグは中止されていません');
}

/* ------------------------------------------------------------------ *
 * 参加取り消し（組み合わせ抽選の前だけ）
 * ------------------------------------------------------------------ */

/**
 * 自分のエントリーを取り消す。
 * 使われなくなったスカッドも一緒に片付ける。
 * @returns {Promise<{team_name: string}>} 取り消したスカッド
 */
export async function withdrawEntry(leagueId, userId) {
  const [entry] = await sql`
    SELECT e.entry_id, e.squad_id, s.team_name
    FROM entries e
    JOIN squads s ON s.squad_id = e.squad_id
    WHERE e.league_id = ${leagueId} AND e.user_id = ${userId}
  `;
  if (!entry) throw new Error('このリーグへの申し込みが見つかりません');

  await sql.begin(async (tx) => {
    await tx`DELETE FROM entries WHERE entry_id = ${entry.entry_id}`;
    // 他から参照されていないスカッドだけ削除する
    await tx`
      DELETE FROM squads s
      WHERE s.squad_id = ${entry.squad_id}
        AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.squad_id = s.squad_id)
        AND NOT EXISTS (
          SELECT 1 FROM matches m
          WHERE m.home_squad_id = s.squad_id OR m.away_squad_id = s.squad_id
        )
    `;
  });

  return { team_name: entry.team_name };
}

/* ------------------------------------------------------------------ *
 * 決勝トーナメント: 各プールの上位2名が進出
 *   ワールドカップ方式で「A組1位 × B組2位」のようにたすき掛けで組む
 * ------------------------------------------------------------------ */

export async function buildBracket(leagueId) {
  const league = await getLeague(leagueId);
  if (!league) return null;

  const pools = await buildStandings(leagueId);
  const matches = await listMatches(leagueId);

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
