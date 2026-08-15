-- =====================================================================
-- マイグレーション 003: 対戦部屋の番号共有
--
-- ホームが eFootball で部屋を立て、その番号をここに貼る。
-- アウェイは自分のユーザーIDを入れると番号を確認できる。
--
-- Supabase ダッシュボード > SQL Editor に貼り付けて実行してください。
-- 何度実行しても安全です。
-- =====================================================================

alter table public.matches add column if not exists room_code      text;
alter table public.matches add column if not exists room_note      text;
alter table public.matches add column if not exists room_posted_at timestamptz;

-- =====================================================================
-- 補足
--   room_code は対戦する2人以外には返しません（アプリ側で制御）。
--   試合結果が承認されると自動で NULL に戻ります。
--
--   手動で消したいとき:
--     update public.matches
--        set room_code = null, room_note = null, room_posted_at = null
--      where match_id = 123;
-- =====================================================================
