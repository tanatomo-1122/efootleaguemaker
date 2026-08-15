-- =====================================================================
-- マイグレーション 001: ユーザー名 ＋ ユーザーID(本人確認用) への移行
--
-- 変更前: users(efootball_id, display_name)  … 名前だけで本人確認していた
-- 変更後: users(user_name, efootball_user_id) … IDをパスワード代わりに使う
--
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全です（適用済みなら何も起きません）。
-- =====================================================================

-- 1) efootball_id → user_name にリネーム
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'efootball_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'user_name'
  ) then
    alter table public.users rename column efootball_id to user_name;
  end if;
end $$;

-- 2) ユーザーID列を追加
alter table public.users add column if not exists efootball_user_id text;

-- 3) 既存ユーザーに仮のIDを割り当てる
--    ※ 本人には別途、正しいIDで登録し直してもらう想定です。
--       すでに正しいIDが分かっている場合は、この後で UPDATE してください。
update public.users
   set efootball_user_id = 'TEMP-' ||
       lpad(((user_id * 7) % 1000)::text, 3, '0') || '-' ||
       lpad(((user_id * 13) % 1000)::text, 3, '0') || '-' ||
       lpad((user_id % 1000)::text, 3, '0')
 where efootball_user_id is null;

-- 4) 制約を付ける
alter table public.users alter column efootball_user_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_efootball_user_id_key'
  ) then
    alter table public.users add constraint users_efootball_user_id_key unique (efootball_user_id);
  end if;
end $$;

alter table public.users drop constraint if exists users_efootball_user_id_format;
alter table public.users add constraint users_efootball_user_id_format
  check (efootball_user_id ~ '^[A-Z]{4}-[0-9]{3}-[0-9]{3}-[0-9]{3}$');

-- 5) 使わなくなった表示名を削除
alter table public.users drop column if exists display_name;

-- =====================================================================
-- 確認用（実行して中身を見たいとき）
--   select user_id, user_name, efootball_user_id from public.users order by user_id;
-- 仮IDを本物に差し替える例:
--   update public.users set efootball_user_id = 'ASLV-569-790-534' where user_name = 'TOMOYA_10';
-- =====================================================================
