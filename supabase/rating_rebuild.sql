-- =====================================================================
-- EFLランク 一括計算（SQL版）
--
-- これまでの承認済みリーグ戦をすべてさかのぼって、全員 1500 から
-- レーティングを計算し直します。Supabase の SQL Editor に貼って実行するだけ。
-- （ローカルから実行する場合は `npm run rating:rebuild` でも同じ結果になります）
--
-- 先に 006_efl_rank.sql を適用しておいてください。
-- 何度実行しても同じ結果になります。
--
-- こんなときに使います:
--   - 導入時に、これまでの試合結果から初期値を出したいとき
--   - リーグのカテゴリー（一般/賞金あり/公式）を後から変えたとき
--   - 結果を取り消して履歴がずれたと感じたとき
-- =====================================================================

do $$
declare
  m        record;
  imp      int;
  hr       double precision;   -- ホームの試合前レート
  ar       double precision;   -- アウェイの試合前レート
  h_result double precision;   -- W（ホーム視点）
  h_exp    double precision;   -- We（ホーム視点）
  a_exp    double precision;   -- We（アウェイ視点）
  h_delta  double precision;
  a_delta  double precision;
  n_match  int := 0;
begin
  -- 計算中のレートを持つ作業用テーブル
  drop table if exists _efl_rating;
  create temp table _efl_rating (
    user_id int primary key,
    rating  double precision not null,
    n       int not null
  );

  -- いったん全部リセット
  delete from public.rating_events;
  update public.users set rating = 1500, rating_matches = 0;

  -- 承認された順に1試合ずつ積み上げる
  for m in
    select mm.match_id, mm.league_id, mm.home_score, mm.away_score, l.category,
           he.user_id as home_user_id, ae.user_id as away_user_id
    from public.matches mm
    join public.leagues l  on l.league_id = mm.league_id and l.cancelled_at is null
    join public.entries he on he.entry_id = mm.home_entry_id
    join public.entries ae on ae.entry_id = mm.away_entry_id
    where mm.status = 'reported'
    order by coalesce(mm.approved_at, mm.reported_at), mm.match_id
  loop
    continue when m.home_user_id = m.away_user_id;

    -- リーグの格 → 重要度 I
    imp := case m.category when 'official' then 40 when 'prize' then 25 else 10 end;

    -- 初登場なら 1500 から
    insert into _efl_rating (user_id, rating, n)
      values (m.home_user_id, 1500, 0) on conflict (user_id) do nothing;
    insert into _efl_rating (user_id, rating, n)
      values (m.away_user_id, 1500, 0) on conflict (user_id) do nothing;

    select rating into hr from _efl_rating where user_id = m.home_user_id;
    select rating into ar from _efl_rating where user_id = m.away_user_id;

    -- W: 勝ち1 / 引き分け0.5 / 負け0（得点差は影響しない）
    h_result := case
                  when coalesce(m.home_score, 0) > coalesce(m.away_score, 0) then 1
                  when coalesce(m.home_score, 0) < coalesce(m.away_score, 0) then 0
                  else 0.5
                end;

    -- We = 1 / (10^(-dr/600) + 1)
    h_exp := 1 / (power(10, -(hr - ar) / 600) + 1);
    a_exp := 1 / (power(10, -(ar - hr) / 600) + 1);

    -- P = P_before + I * (W - We)
    h_delta := imp * (h_result - h_exp);
    a_delta := imp * ((1 - h_result) - a_exp);

    insert into public.rating_events
      (match_id, user_id, opponent_id, league_id, importance,
       result, expected, rating_before, rating_after, delta)
    values
      (m.match_id, m.home_user_id, m.away_user_id, m.league_id, imp,
       h_result, h_exp, hr, hr + h_delta, h_delta),
      (m.match_id, m.away_user_id, m.home_user_id, m.league_id, imp,
       1 - h_result, a_exp, ar, ar + a_delta, a_delta);

    update _efl_rating set rating = hr + h_delta, n = n + 1 where user_id = m.home_user_id;
    update _efl_rating set rating = ar + a_delta, n = n + 1 where user_id = m.away_user_id;

    n_match := n_match + 1;
  end loop;

  -- 結果を users に反映
  update public.users u
     set rating = r.rating, rating_matches = r.n
    from _efl_rating r
   where u.user_id = r.user_id;

  raise notice 'EFLランクを計算しました: % 試合 / % 人', n_match, (select count(*) from _efl_rating);
end $$;

-- =====================================================================
-- 計算結果の確認
-- =====================================================================
select row_number() over (order by rating desc, rating_matches desc, user_name) as "順位",
       user_name as "ユーザー",
       round(rating)::int as "レート",
       rating_matches as "試合数",
       case when rating >= 1800 then 'エリート'
            when rating >= 1650 then 'プロ'
            when rating >= 1500 then 'レギュラー'
            when rating >= 1350 then 'チャレンジャー'
            else 'ルーキー' end as "ランク帯"
  from public.users
 where rating_matches > 0
 order by rating desc, rating_matches desc, user_name;
