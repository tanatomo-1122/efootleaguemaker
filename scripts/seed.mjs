/**
 * サンプルデータ投入スクリプト
 *   npm run seed            … 既存データを残したまま追加
 *   npm run seed -- --reset … 全消去してから投入
 *
 * 事前に supabase/schema.sql を Supabase の SQL Editor で実行しておいてください。
 */
import './env.mjs';
import { sql, resetDb } from '../lib/db.js';
import { tryCloseAndDraw, listMatches, saveMatchResult, approveMatch } from '../lib/league.js';
import { FORMATIONS, TEAM_STYLES } from '../lib/schema.js';

if (process.argv.includes('--reset')) {
  await resetDb();
  console.log('既存データを削除しました');
}

// [ユーザー名, ユーザーID(本人確認用), スカッド名]
// ユーザーIDは本来 eFootball のマイページに表示されているものを本人が入力します。
// ここではサンプル用のダミーです。
const PLAYERS = [
  ['TOMOYA_10', 'KZLP-482-119-673', 'TOMOYA FC'],
  ['KENTA_SS', 'BQMW-118-224-903', 'Blue Lions'],
  ['YUKI_007', 'CRNX-337-651-208', 'Osaka United'],
  ['SHOTA_ACE', 'DSOY-472-019-745', 'Nagoya Wolves'],
  ['REN_9', 'ETPZ-860-533-127', 'Sapporo Frost'],
  ['DAIKI_R', 'FUQA-205-948-360', 'Kobe Marina'],
  ['HARUTO_88', 'GVRB-714-286-591', 'Fukuoka Falcons'],
  ['SORA_11', 'HWSC-093-467-812', 'Sendai Thunder'],
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// --- ユーザー登録 ---
for (const [userName, userId] of PLAYERS) {
  await sql`
    INSERT INTO users (user_name, efootball_user_id) VALUES (${userName}, ${userId})
    ON CONFLICT (user_name) DO NOTHING
  `;
}

const [organizer] = await sql`SELECT * FROM users WHERE user_name = 'TOMOYA_10'`;

// --- リーグ作成: 2プール × 4人 ---
const [league] = await sql`
  INSERT INTO leagues (name, organizer_user_id, players_per_pool, pool_count, description)
  VALUES ('第1回 efootleague 杯', ${organizer.user_id}, 4, 2,
          '初心者歓迎。1日1試合ペースでゆるくやります。')
  RETURNING league_id
`;
const leagueId = league.league_id;

// --- 参加申込 + スカッド登録 ---
for (const [userName, , teamName] of PLAYERS) {
  const [user] = await sql`SELECT * FROM users WHERE user_name = ${userName}`;
  const [squad] = await sql`
    INSERT INTO squads
      (user_id, team_name, attack_formation, defence_formation, team_style, team_power)
    VALUES (${user.user_id}, ${teamName}, ${pick(FORMATIONS)}, ${pick(FORMATIONS)},
            ${pick(TEAM_STYLES)}, ${rnd(2700, 3400)})
    RETURNING squad_id
  `;
  await sql`
    INSERT INTO entries (league_id, user_id, squad_id)
    VALUES (${leagueId}, ${user.user_id}, ${squad.squad_id})
  `;
}

// --- 規定人数に達したので自動締切 → 抽選 ---
const drawn = await tryCloseAndDraw(leagueId);
console.log(drawn ? '組み合わせを抽選しました' : '抽選条件を満たしませんでした');

// --- 全体の 6 割ほどの試合結果を投入 ---
// 最後の1件はあえて「アウェイ承認待ち」のまま残し、承認フローを画面で確認できるようにする
const matches = await listMatches(leagueId);
const reportCount = Math.floor(matches.length * 0.6);

for (const [i, m] of matches.slice(0, reportCount).entries()) {
  const hp = rnd(38, 62);
  const hShots = rnd(4, 18);
  const aShots = rnd(4, 18);
  const stats = {
    home_score: rnd(0, 4),
    away_score: rnd(0, 4),
    home_possession: hp,
    away_possession: 100 - hp,
    home_shots: hShots,
    away_shots: aShots,
    home_shots_goal: rnd(1, Math.max(1, hShots)),
    away_shots_goal: rnd(1, Math.max(1, aShots)),
    home_fouls: rnd(0, 8),
    away_fouls: rnd(0, 8),
    home_offsides: rnd(0, 4),
    away_offsides: rnd(0, 4),
    home_corners: rnd(0, 9),
    away_corners: rnd(0, 9),
    home_free_kicks: rnd(0, 8),
    away_free_kicks: rnd(0, 8),
    home_passes: rnd(180, 480),
    away_passes: rnd(180, 480),
    home_pass_success: rnd(72, 94),
    away_pass_success: rnd(72, 94),
    home_cross: rnd(0, 14),
    away_cross: rnd(0, 14),
    home_pass_cut: rnd(2, 16),
    away_pass_cut: rnd(2, 16),
    home_tackle_success: rnd(2, 14),
    away_tackle_success: rnd(2, 14),
    home_saves: rnd(0, 8),
    away_saves: rnd(0, 8),
  };
  await saveMatchResult(m.match_id, stats, { source: 'auto' });
  if (i < reportCount - 1) await approveMatch(m.match_id); // アウェイが承認
}

console.log(
  `リーグ #${leagueId}: ${reportCount - 1} 試合を承認済み、1 試合を承認待ちにしました（全 ${matches.length} 試合）`
);

// --- 募集中のリーグも1つ用意 ---
await sql`
  INSERT INTO leagues (name, organizer_user_id, players_per_pool, pool_count, description)
  VALUES ('週末スプリント リーグ', ${organizer.user_id}, 4, 1,
          '週末だけで一気に消化する短期リーグ。')
`;

console.log(`主催者: ${organizer.user_name}（ユーザーID ${organizer.efootball_user_id}）`);
console.log('\nサンプルユーザーのユーザーID（動作確認用の合言葉）:');
for (const [userName, userId] of PLAYERS) console.log(`  ${userName.padEnd(12)} ${userId}`);
console.log('\n完了しました。npm run dev で起動してください。');

await sql.end();
