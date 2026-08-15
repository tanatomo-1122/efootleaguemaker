-- =====================================================================
-- マイグレーション 002: リーグの中止（募集一覧から隠す）
--
-- status は触らず、cancelled_at が入っているかどうかで「中止中」を表します。
-- こうしておくと、再開したときに元の状態（募集中／開催中）にそのまま戻せます。
--
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全です。
-- =====================================================================

alter table public.leagues add column if not exists cancelled_at  timestamptz;
alter table public.leagues add column if not exists cancel_reason text;

create index if not exists idx_leagues_active on public.leagues (cancelled_at, status);

-- =====================================================================
-- 手動で操作したいとき
--   中止する:
--     update public.leagues set cancelled_at = now(), cancel_reason = '人が集まらないため'
--      where league_id = 12;
--   再開する:
--     update public.leagues set cancelled_at = null, cancel_reason = null
--      where league_id = 12;
--   中止中のリーグを見る:
--     select league_id, name, status, cancelled_at, cancel_reason
--       from public.leagues where cancelled_at is not null;
-- =====================================================================
