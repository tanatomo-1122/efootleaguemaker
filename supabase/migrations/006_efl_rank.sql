-- =====================================================================
-- マイグレーション 006: EFLランク（レーティング）
--
-- FIFAランク（2018年改訂版・Eloベース）の式をリーグ戦に合わせて採用する。
--   P = P_before + I * (W - We)
--   We = 1 / (10^(-dr/600) + 1)      dr = 自分のP_before - 相手のP_before
--
-- 1) users.rating          … 現在のレーティング（初期値 1500）
-- 2) leagues.category      … 重要度 I を決めるカテゴリー
-- 3) rating_events         … 1試合1人ぶんの変動履歴（巻き戻しと表示に使う）
--
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全です。
-- =====================================================================

-- ---------------------------------------------------------------
-- 1) ユーザーのレーティング
-- ---------------------------------------------------------------
alter table public.users add column if not exists rating double precision not null default 1500;
alter table public.users add column if not exists rating_matches int not null default 0;

create index if not exists idx_users_rating on public.users (rating desc);

-- ---------------------------------------------------------------
-- 2) リーグのカテゴリー（重要度 I）
--    general = 10 / prize = 25 / official = 40
-- ---------------------------------------------------------------
alter table public.leagues add column if not exists category text not null default 'general';

alter table public.leagues drop constraint if exists leagues_category_check;
alter table public.leagues add constraint leagues_category_check
  check (category in ('general', 'prize', 'official'));

-- ---------------------------------------------------------------
-- 3) レーティング変動履歴
--    1試合につき2行（ホーム視点・アウェイ視点）。
--    (match_id, user_id) を一意にして、二重加算を DB 側でも防ぐ。
-- ---------------------------------------------------------------
create table if not exists public.rating_events (
  event_id        int generated always as identity primary key,
  match_id        int  not null references public.matches(match_id) on delete cascade,
  user_id         int  not null references public.users(user_id),
  opponent_id     int  not null references public.users(user_id),
  league_id       int  references public.leagues(league_id) on delete set null,
  importance      int  not null,
  result          double precision not null,   -- W: 1 / 0.5 / 0
  expected        double precision not null,   -- We
  rating_before   double precision not null,
  rating_after    double precision not null,
  delta           double precision not null,
  created_at      timestamptz not null default now(),
  unique (match_id, user_id)
);

create index if not exists idx_rating_events_user on public.rating_events (user_id, event_id desc);

alter table public.rating_events enable row level security;

-- =====================================================================
-- 確認用
--   ランキング:
--     select user_name, round(rating)::int as rating, rating_matches
--       from public.users order by rating desc;
--
--   ある人の変動履歴:
--     select e.created_at, o.user_name as 相手, e.result, round(e.delta::numeric,1) as 増減,
--            round(e.rating_after::numeric)::int as 変動後
--       from public.rating_events e
--       join public.users u on u.user_id = e.user_id
--       join public.users o on o.user_id = e.opponent_id
--      where u.user_name = 'TOMOYA_10'
--      order by e.event_id;
--
--   リーグを公式に格上げする:
--     update public.leagues set category = 'official' where league_id = 1;
--     ※ 変更後は `npm run rating:rebuild` で再計算してください
-- =====================================================================
