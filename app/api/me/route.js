import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { authenticate, AuthError } from '@/lib/auth';
import { POOL_LABELS } from '@/lib/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * マイページ用のまとめ取得。
 * body: { efootball_user_id }
 *
 * ユーザーIDをURLに載せないよう POST。返す内容は本人の分だけ。
 */
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const user = await authenticate(body.efootball_user_id);
    const uid = user.user_id;

    // --- 申し込んだリーグ ---
    const joined = await sql`
      SELECT l.league_id, l.name, l.status, l.cancelled_at, l.cancel_reason,
             l.players_per_pool, l.pool_count,
             e.pool_index, s.team_name,
             ou.user_name AS organizer_user_name,
             (SELECT COUNT(*)::int FROM entries e2 WHERE e2.league_id = l.league_id) AS entry_count,
             (SELECT COUNT(*)::int FROM matches m WHERE m.league_id = l.league_id) AS match_count,
             (SELECT COUNT(*)::int FROM matches m
               WHERE m.league_id = l.league_id AND m.status = 'reported') AS done_count
      FROM entries e
      JOIN leagues l ON l.league_id = e.league_id
      JOIN squads  s ON s.squad_id  = e.squad_id
      LEFT JOIN users ou ON ou.user_id = l.organizer_user_id
      WHERE e.user_id = ${uid}
      ORDER BY
        CASE WHEN l.cancelled_at IS NOT NULL THEN 3
             WHEN l.status = 'in_progress' THEN 0
             WHEN l.status = 'recruiting'  THEN 1
             ELSE 2 END,
        l.created_at DESC
    `;

    // --- 主催したリーグ ---
    const organized = await sql`
      SELECT l.league_id, l.name, l.status, l.cancelled_at,
             l.players_per_pool, l.pool_count,
             (SELECT COUNT(*)::int FROM entries e WHERE e.league_id = l.league_id) AS entry_count,
             (SELECT COUNT(*)::int FROM matches m WHERE m.league_id = l.league_id) AS match_count,
             (SELECT COUNT(*)::int FROM matches m
               WHERE m.league_id = l.league_id AND m.status = 'reported') AS done_count
      FROM leagues l
      WHERE l.organizer_user_id = ${uid}
      ORDER BY
        CASE WHEN l.cancelled_at IS NOT NULL THEN 3
             WHEN l.status = 'in_progress' THEN 0
             WHEN l.status = 'recruiting'  THEN 1
             ELSE 2 END,
        l.created_at DESC
    `;

    // --- 未消化の自分の試合 ---
    const matches = await sql`
      SELECT m.match_id, m.status, m.pool_index, m.round, m.reject_note,
             (m.room_code IS NOT NULL) AS has_room,
             m.home_team_name, m.away_team_name,
             he.user_id AS home_user_id, ae.user_id AS away_user_id,
             hu.user_name AS home_user_name, au.user_name AS away_user_name,
             l.league_id, l.name AS league_name
      FROM matches m
      JOIN leagues l ON l.league_id = m.league_id
      JOIN entries he ON he.entry_id = m.home_entry_id
      JOIN entries ae ON ae.entry_id = m.away_entry_id
      JOIN users   hu ON hu.user_id  = he.user_id
      JOIN users   au ON au.user_id  = ae.user_id
      WHERE (he.user_id = ${uid} OR ae.user_id = ${uid})
        AND m.status <> 'reported'
        AND l.status = 'in_progress'
        AND l.cancelled_at IS NULL
      ORDER BY l.league_id, m.round, m.match_id
    `;

    // --- やること / お知らせに整形 ---
    const todos = [];
    for (const m of matches) {
      const iAmHome = m.home_user_id === uid;
      const opponent = iAmHome ? m.away_user_name : m.home_user_name;
      const base = {
        match_id: m.match_id,
        league_id: m.league_id,
        league_name: m.league_name,
        pool: POOL_LABELS[m.pool_index] ?? String(m.pool_index + 1),
        round: m.round,
        opponent,
        my_team: iAmHome ? m.home_team_name : m.away_team_name,
        opponent_team: iAmHome ? m.away_team_name : m.home_team_name,
        side: iAmHome ? 'home' : 'away',
        has_room: m.has_room,
      };

      if (m.status === 'pending') {
        todos.push({
          ...base,
          kind: iAmHome ? 'waiting_approval' : 'approve',
          urgent: !iAmHome,
          text: iAmHome
            ? `${opponent} さんの承認待ちです`
            : `${opponent} さんが結果を登録しました。確認して承認してください`,
        });
      } else if (m.reject_note && iAmHome) {
        todos.push({
          ...base,
          kind: 'rejected',
          urgent: true,
          text: `結果が差し戻されました（${m.reject_note}）。登録し直してください`,
        });
      } else {
        todos.push({
          ...base,
          kind: iAmHome ? 'play_home' : 'play_away',
          urgent: false,
          text: iAmHome
            ? m.has_room
              ? '部屋を立て済みです。対戦して結果を登録してください'
              : '未消化です。部屋を立てて対戦しましょう'
            : m.has_room
              ? `${opponent} さんが部屋を立てています。番号を確認してください`
              : '未消化です。相手が部屋を立てるのを待ちましょう',
        });
      }
    }

    // 主催者向けのお知らせ
    for (const l of organized) {
      if (l.cancelled_at) continue;
      if (l.status === 'in_progress' && l.match_count > 0 && l.match_count === l.done_count) {
        todos.push({
          kind: 'finalize',
          urgent: true,
          league_id: l.league_id,
          league_name: l.name,
          text: '全試合の承認が終わりました。結果を確定できます',
        });
      }
      if (l.status === 'recruiting') {
        const capacity = l.players_per_pool * l.pool_count;
        todos.push({
          kind: 'recruiting',
          urgent: false,
          league_id: l.league_id,
          league_name: l.name,
          text:
            l.entry_count >= capacity
              ? '定員に達しています'
              : `あと ${capacity - l.entry_count} 人で自動締切（今の人数で始めることもできます）`,
        });
      }
    }

    todos.sort((a, b) => Number(b.urgent) - Number(a.urgent));

    return NextResponse.json({
      ok: true,
      user: { user_name: user.user_name, photo_path: user.photo_path },
      joined: joined.map((l) => ({
        ...l,
        cancelled: l.cancelled_at !== null,
        capacity: l.players_per_pool * l.pool_count,
        pool_label: l.pool_index === null ? null : POOL_LABELS[l.pool_index] ?? String(l.pool_index + 1),
      })),
      organized: organized.map((l) => ({
        ...l,
        cancelled: l.cancelled_at !== null,
        capacity: l.players_per_pool * l.pool_count,
      })),
      todos,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
