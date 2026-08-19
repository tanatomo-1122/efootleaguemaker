-- =====================================================================
-- マイグレーション 005: 在席状況 と 主催者の代理操作
--
-- 1) users.last_seen_at
--    「連絡がつかない人」を見分けるための最終アクセス時刻。
--    追加の通信はせず、既に走っているリクエストのついでに更新する。
--
-- 2) matches の代理操作の記録
--    主催者が代わりに結果を確定した場合に、誰がやったかを残す。
--    画面にも「主催者が代理で確定」と表示するため。
--
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全です。
-- =====================================================================

alter table public.users add column if not exists last_seen_at timestamptz;

alter table public.matches
  add column if not exists reported_by_user_id int references public.users(user_id);
alter table public.matches
  add column if not exists approved_by_user_id int references public.users(user_id);
alter table public.matches
  add column if not exists admin_note text;

create index if not exists idx_users_last_seen on public.users (last_seen_at desc nulls last);

-- =====================================================================
-- 確認用
--   誰がいつ来ているか:
--     select user_name, last_seen_at,
--            now() - last_seen_at as 経過
--       from public.users order by last_seen_at desc nulls last;
--
--   代理で確定された試合:
--     select m.match_id, m.home_team_name, m.away_team_name, m.admin_note,
--            u.user_name as 実行者
--       from public.matches m
--       join public.users u on u.user_id = m.approved_by_user_id
--      where m.admin_note is not null;
-- =====================================================================
