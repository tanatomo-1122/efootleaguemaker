-- =====================================================================
-- efootleaguemaker — Supabase (PostgreSQL) スキーマ
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全です（IF NOT EXISTS）。
-- =====================================================================

-- ---------------------------------------------------------------
-- users
--   user_name         : eFootball のユーザー名。公開表示に使う（一意）
--   efootball_user_id : eFootball のユーザーID（ASLV-569-790-534 形式）。
--                       本人確認の合言葉として使うため、画面には一切表示しない（一意）
-- ---------------------------------------------------------------
create table if not exists public.users (
  user_id           int generated always as identity primary key,
  user_name         text        not null unique,
  efootball_user_id text        not null unique,
  photo_path        text,
  created_at        timestamptz not null default now()
);

-- 形式チェック（大文字4文字 + 3桁×3）
alter table public.users drop constraint if exists users_efootball_user_id_format;
alter table public.users add constraint users_efootball_user_id_format
  check (efootball_user_id ~ '^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$');

-- ---------------------------------------------------------------
-- leagues
--   organizer_user_id: 主催者。リーグの確定・中止はこのユーザーだけが行える
--   status:       recruiting（募集中） / in_progress（開催中） / finished（確定済み）
--   cancelled_at: 中止した日時。NULL でなければ「中止中」。
--                 status は元のまま残すので、再開するとその状態に戻る
-- ---------------------------------------------------------------
create table if not exists public.leagues (
  league_id         int generated always as identity primary key,
  name              text not null,
  organizer_user_id int  references public.users(user_id),
  players_per_pool  int  not null,
  pool_count        int  not null,
  recruit_start     text,
  recruit_end       text,
  description       text,
  status            text not null default 'recruiting',
  cancelled_at      timestamptz,
  cancel_reason     text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_leagues_active on public.leagues (cancelled_at, status);

-- ---------------------------------------------------------------
-- squads
--   攻撃時 / 守備時でフォーメーションを分けて登録する
-- ---------------------------------------------------------------
create table if not exists public.squads (
  squad_id          int generated always as identity primary key,
  user_id           int  not null references public.users(user_id),
  team_name         text not null,
  attack_formation  text not null,
  defence_formation text not null,
  team_style        text not null,
  team_power        int  not null,
  photo_path        text,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- entries（リーグへの参加申込）
-- ---------------------------------------------------------------
create table if not exists public.entries (
  entry_id   int generated always as identity primary key,
  league_id  int not null references public.leagues(league_id) on delete cascade,
  user_id    int not null references public.users(user_id),
  squad_id   int not null references public.squads(squad_id),
  pool_index int,
  created_at timestamptz not null default now(),
  unique (league_id, user_id)
);

-- ---------------------------------------------------------------
-- matches
--   status: scheduled（未登録） / pending（アウェイ承認待ち） / reported（承認済み）
--   match_result: home_win / away_win / draw
--   match_source: auto（スカッド名の自動照合成功） / manual（手動確認）
-- ---------------------------------------------------------------
create table if not exists public.matches (
  match_id       int generated always as identity primary key,
  league_id      int not null references public.leagues(league_id) on delete cascade,
  pool_index     int not null,
  round          int not null,
  home_entry_id  int not null references public.entries(entry_id) on delete cascade,
  away_entry_id  int not null references public.entries(entry_id) on delete cascade,
  home_squad_id  int references public.squads(squad_id),
  away_squad_id  int references public.squads(squad_id),
  home_team_name text,
  away_team_name text,
  match_result   text,
  status         text not null default 'scheduled',
  image_path     text,
  match_source   text,
  reported_at    timestamptz,
  approved_at    timestamptz,
  reject_note    text,

  -- ---- 対戦部屋（ホームが立てた部屋の番号。対戦する2人だけが見られる） ----
  room_code      text,
  room_note      text,
  room_posted_at timestamptz,

  -- ---- 試合スタッツ（matches.csv の列と一対一） ----
  home_score           double precision, away_score           double precision,
  home_possession      double precision, away_possession      double precision,
  home_shots           double precision, away_shots           double precision,
  home_shots_goal      double precision, away_shots_goal      double precision,
  home_fouls           double precision, away_fouls           double precision,
  home_offsides        double precision, away_offsides        double precision,
  home_corners         double precision, away_corners         double precision,
  home_free_kicks      double precision, away_free_kicks      double precision,
  home_passes          double precision, away_passes          double precision,
  home_pass_success    double precision, away_pass_success    double precision,
  home_cross           double precision, away_cross           double precision,
  home_pass_cut        double precision, away_pass_cut        double precision,
  home_tackle_success  double precision, away_tackle_success  double precision,
  home_saves           double precision, away_saves           double precision
);

-- ---------------------------------------------------------------
-- match_messages（対戦相手とのトーク）
--   試合中の連絡用。結果が承認された時点で消える。
--   読み書きできるのはその試合の2人だけ（アプリ側で制御）。
-- ---------------------------------------------------------------
create table if not exists public.match_messages (
  message_id int generated always as identity primary key,
  match_id   int  not null references public.matches(match_id) on delete cascade,
  user_id    int  not null references public.users(user_id),
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_match_messages on public.match_messages (match_id, message_id);

create index if not exists idx_entries_league on public.entries (league_id);
create index if not exists idx_matches_league on public.matches (league_id, pool_index, round);
create index if not exists idx_matches_status on public.matches (status);

-- =====================================================================
-- Row Level Security
--   アプリはサーバー側から直接接続（またはサービスロール）でのみ読み書きします。
--   RLS を有効にし、ポリシーを一切作らないことで、
--   anon / authenticated キーからは何も読めない状態にします。
--   ＝ 生の試合データを外から取得されない（データの囲い込み）
-- =====================================================================
alter table public.users          enable row level security;
alter table public.leagues        enable row level security;
alter table public.squads         enable row level security;
alter table public.entries        enable row level security;
alter table public.matches        enable row level security;
alter table public.match_messages enable row level security;

-- =====================================================================
-- Storage
--   スカッド画像・試合結果画像を入れる公開バケットを作ります。
--   ダッシュボードの Storage から作成しても構いません（Public bucket）。
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('efootleague', 'efootleague', true)
on conflict (id) do nothing;

-- 誰でも閲覧できる（画像を <img> で表示するため）
drop policy if exists "efootleague public read" on storage.objects;
create policy "efootleague public read"
  on storage.objects for select
  using (bucket_id = 'efootleague');

-- アップロードはサーバー側（サービスロール）からのみ。
-- サービスロールは RLS をバイパスするため、追加のポリシーは不要です。
