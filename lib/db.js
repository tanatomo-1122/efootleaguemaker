import postgres from 'postgres';

/**
 * Supabase(PostgreSQL) への接続。
 *
 * DATABASE_URL には Supabase の「Connection pooling」の URI を入れてください。
 * Vercel のようなサーバーレス環境では、コネクションを使い捨てにしないよう
 * プーラー(ポート 6543 / transaction mode)経由の接続が必須です。
 * transaction mode ではプリペアドステートメントが使えないため prepare: false にしています。
 */

const CONNECTION_STRING =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

const isLocal = (url) => /@(localhost|127\.0\.0\.1|\[::1\])/.test(url || '');

function createClient() {
  if (!CONNECTION_STRING) {
    throw new Error(
      'DATABASE_URL が設定されていません。Supabase の Connection pooling URI を .env.local に設定してください。'
    );
  }

  return postgres(CONNECTION_STRING, {
    // Supabase のプーラー(transaction mode)ではプリペアドステートメントを使わない
    prepare: false,
    // サーバーレスでは接続を絞る
    max: Number(process.env.PGPOOL_MAX || 3),
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: /sslmode=disable/.test(CONNECTION_STRING) || isLocal(CONNECTION_STRING)
      ? false
      : 'require',
    onnotice: () => {},
  });
}

// 開発時のホットリロードで接続が増え続けないようグローバルに保持する
const globalForDb = globalThis;
export const sql = globalForDb.__efootleagueSql ?? createClient();
if (process.env.NODE_ENV !== 'production') globalForDb.__efootleagueSql = sql;

/** 開発用: 全テーブルを空にする */
export async function resetDb() {
  await sql`
    truncate table
      public.matches, public.entries, public.squads, public.leagues, public.users
    restart identity cascade
  `;
}
