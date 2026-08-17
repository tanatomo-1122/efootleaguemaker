/**
 * 接続診断ツール。
 *   npm run doctor
 *
 * 「画面が重い / 開かない」ときに、原因が DB 側なのか Next.js 側なのかを切り分けます。
 * Next.js を経由せず、.env.local の設定だけで直接 Supabase に繋いで時間を測ります。
 */
import './env.mjs';

const t0 = Date.now();
const lap = () => `${String(Date.now() - t0).padStart(6)}ms`;
const step = (label, detail = '') => console.log(`[${lap()}] ${label} ${detail}`);

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('DATABASE_URL が設定されていません（.env.local を確認してください）');
  process.exit(1);
}

const masked = url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');
step('接続先', masked);

const host = masked.split('@')[1] ?? '';
const port = host.split(':')[1]?.split('/')[0];
if (port === '5432' && !/localhost|127\.0\.0\.1/.test(host)) {
  console.log('        ⚠ ポート 5432（直接接続）です。Supabase の直接接続は IPv6 のみで、');
  console.log('          環境によっては繋がりません。6543（Connection pooling）を推奨します。');
}

// --- 1. 名前解決 ---
const hostname = host.split(':')[0];
try {
  const dns = await import('node:dns/promises');
  const addrs = await dns.lookup(hostname, { all: true });
  step('DNS 解決', addrs.map((a) => `${a.address}(IPv${a.family})`).join(' '));
} catch (e) {
  step('DNS 解決', `✘ 失敗: ${e.code ?? e.message}`);
  console.log('\n→ ネットワーク（DNS）の問題です。ホスト名が正しいか確認してください。');
  process.exit(1);
}

// --- 2. 接続 ---
const { sql } = await import('../lib/db.js');
try {
  const t = Date.now();
  await sql`select 1`;
  const ms = Date.now() - t;
  step('接続 + 疎通', `${ms}ms`);
  if (ms > 3000) {
    console.log('        ⚠ 接続に時間がかかっています。Supabase プロジェクトが');
    console.log('          一時停止（Paused）していないか、ダッシュボードで確認してください。');
  }
} catch (e) {
  step('接続', `✘ 失敗: ${e.code ?? ''} ${e.message}`);
  console.log('\n→ DB に繋がっていません。パスワード・ホスト名・プロジェクトの稼働状態を確認してください。');
  process.exit(1);
}

// --- 3. テーブルの有無 ---
const tables = await sql`
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name
`;
step('テーブル', tables.map((t) => t.table_name).join(', ') || '（なし）');

// --- 4. データ画面の各クエリを個別に計測 ---
const { publicSummary, formationWinRates, formationMatrix, finishedLeagueChampions } =
  await import('../lib/analytics.js');

console.log('\n--- データ画面（/data）のクエリ ---');
const jobs = [
  ['集計サマリー', publicSummary],
  ['フォーメーション別勝率', formationWinRates],
  ['フォーメーション相性表', formationMatrix],
  ['歴代の大会結果', finishedLeagueChampions],
];

let slowest = 0;
for (const [name, fn] of jobs) {
  const t = Date.now();
  try {
    await fn();
    const ms = Date.now() - t;
    slowest = Math.max(slowest, ms);
    console.log(`  ${name.padEnd(24)} ${String(ms).padStart(6)}ms`);
  } catch (e) {
    console.log(`  ${name.padEnd(24)} ✘ ${e.message}`);
  }
}

// --- 5. 同時実行できるか（ここで止まるなら接続プール側の問題） ---
console.log('\n--- 同時実行の確認 ---');

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${ms}ms 待っても返らず`)), ms)),
  ]);

let concurrencyLimit = null;
for (const n of [2, 3, 4, 6]) {
  const t = Date.now();
  try {
    await withTimeout(Promise.all(Array.from({ length: n }, () => sql`select 1 as x`)), 8000);
    console.log(`  ${String(n).padStart(2)}本同時  ${String(Date.now() - t).padStart(6)}ms  OK`);
  } catch (e) {
    console.log(`  ${String(n).padStart(2)}本同時  ✘ ${e.message}`);
    concurrencyLimit = n;
    break;
  }
}

console.log('\n--- 判定 ---');
if (concurrencyLimit !== null) {
  console.log(`  同時に ${concurrencyLimit} 本のクエリを投げると返ってこなくなります。`);
  console.log('  接続プール側の問題です。次のどちらかで直ります:');
  console.log('    (a) .env.local に PGPOOL_MAX=1 を追加する（全クエリを1本ずつ流す）');
  console.log('    (b) Supabase の Connection pooling の Pool Size を増やす');
  console.log('  ※ アプリ側は同時実行をやめる修正済みなので、(a) は保険です。');
} else if (slowest < 1000) {
  console.log('  DB は正常です。画面が重いなら Next.js 側（初回コンパイル等）が原因です。');
  console.log('  .next を消して開き直すと直ることがあります: rm -rf .next && npm run dev');
} else {
  console.log('  DB のクエリ自体が遅いです。回線か Supabase 側の状態を確認してください。');
}

await sql.end({ timeout: 5 });
process.exit(0);
