-- =====================================================================
-- マイグレーション 004: 対戦相手とのトーク
--
-- 「部屋立てた？」「回線落ちた」といった、試合中の連絡用です。
-- 読み書きできるのはその試合の2人だけ。
-- 結果が承認された時点でメッセージは削除されます（試合中だけ見られれば十分なので）。
--
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全です。
-- =====================================================================

create table if not exists public.match_messages (
  message_id int generated always as identity primary key,
  match_id   int  not null references public.matches(match_id) on delete cascade,
  user_id    int  not null references public.users(user_id),
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_match_messages on public.match_messages (match_id, message_id);

-- anon キーから読めないようにする（読み書きはサーバー経由のみ）
alter table public.match_messages enable row level security;

-- =====================================================================
-- 手動で確認したいとき
--   select m.match_id, u.user_name, mm.body, mm.created_at
--     from public.match_messages mm
--     join public.matches m on m.match_id = mm.match_id
--     join public.users u   on u.user_id  = mm.user_id
--    order by mm.message_id;
--
-- まとめて消したいとき
--   delete from public.match_messages where match_id = 123;
-- =====================================================================
