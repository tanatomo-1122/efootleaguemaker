# efootleaguemaker

eFootball のリーグ戦を「作って・遊んで・データを残す」ためのウェブアプリです。
みんなが楽しめるリーグシステムを提供しながら、スカッド情報と試合結果を紐づけて蓄積し、
勝敗を左右する要因を分析できるようにすることを狙いとしています。

**構成**: Next.js (App Router) / Supabase PostgreSQL / Supabase Storage / OpenAI GPT-4o mini
デプロイ先は Vercel を想定しています。

---

## セットアップ

### 1. Supabase プロジェクトを作る

1. <https://supabase.com> でプロジェクトを作成（リージョンは東京 `ap-northeast-1` が無難）
2. 作成時のデータベースパスワードは後で使うので控えておく

### 2. テーブルを作る

Supabase ダッシュボード左の **SQL Editor** を開き、`supabase/schema.sql` の中身を
まるごと貼り付けて **Run**。テーブル・インデックス・RLS・Storage バケットが一度に作られます。
何度実行しても壊れません。

> **すでに稼働中の Supabase がある場合**は、`schema.sql` ではなく
> [マイグレーションの当て方](#マイグレーションの当て方すでに動いている-supabase-がある場合) を見てください。

作られるもの:

| テーブル | 内容 |
|---|---|
| `users` | 参加者（ユーザー名 / ユーザーID / 写真） |
| `leagues` | リーグ（主催者・プール構成・状態） |
| `squads` | スカッド（攻撃時/守備時フォーメーション・スタイル・パワー） |
| `entries` | 参加申込（どのプールに入ったか） |
| `matches` | 対戦カードと28項目の試合スタッツ |

### マイグレーションの当て方（すでに動いている Supabase がある場合）

スキーマを変更したときは、`supabase/migrations/` の SQL を番号順に
**SQL Editor** に貼り付けて実行します。どれも何度実行しても安全です。

| ファイル | 内容 |
|---|---|
| `001_user_name_and_user_id.sql` | 名前だけの認証 → ユーザー名 ＋ ユーザーID（合言葉）方式へ |

**001 を当てると起きること**

1. `users.efootball_id` が `users.user_name` にリネームされます
2. `users.efootball_user_id`（ASLV-569-790-534 形式）が追加されます
3. 既存ユーザーには `TEMP-xxx-xxx-xxx` という仮のIDが自動で入ります
4. `users.display_name` が削除されます

既存ユーザーがいる場合、仮IDのままでは本人が操作できません。
本人から正しいユーザーIDを聞いて、SQL Editor で差し替えてください。

```sql
-- 誰が仮IDのままか確認する
select user_id, user_name, efootball_user_id
  from public.users
 where efootball_user_id like 'TEMP-%';

-- 正しいIDに差し替える
update public.users
   set efootball_user_id = 'ASLV-569-790-534'
 where user_name = 'TOMOYA_10';
```

参加者がまだ少ないうちなら、`users` を空にして登録し直してもらうのが早いです
（`truncate table public.matches, public.entries, public.squads, public.leagues, public.users restart identity cascade;`）。

### 3. Storage バケットを確認する

`schema.sql` が `efootleague` という **Public バケット**を作ります。
ダッシュボードの **Storage** に表示されていれば OK です。
（手で作る場合も、名前を `efootleague`、Public bucket を ON にしてください）

### 4. 環境変数を用意する

```bash
cp .env.example .env.local
```

`.env.local` に以下を記入します。

| 変数 | どこで取るか |
|---|---|
| `DATABASE_URL` | Project Settings > **Database** > Connection string > **Connection pooling** の URI。**ポート 6543 / Transaction mode** のものを使い、`[YOUR-PASSWORD]` を実際のパスワードに置き換える |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings > API > Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings > API > **service_role** key（**絶対に公開しない**） |
| `SUPABASE_STORAGE_BUCKET` | `efootleague`（変えたなら合わせる） |
| `OPENAI_API_KEY` | OpenAI のダッシュボード。未設定でも手入力でリーグは回せます |
| `OPENAI_MODEL` | 省略可。既定は `gpt-4o-mini` |

> **なぜ 6543 のプーラー URI なのか**
> Vercel はリクエストごとに関数が起動するため、直接接続（5432）だと接続数がすぐ枯渇します。
> Transaction mode ではプリペアドステートメントが使えないので、コード側で `prepare: false` にしてあります。

### 5. 起動する

```bash
npm install
npm run seed -- --reset   # サンプルデータ投入（任意）
npm run dev               # http://localhost:3000
```

### 6. Vercel にデプロイする

1. GitHub にプッシュして、Vercel で **New Project** → リポジトリを選ぶ
2. **Environment Variables** に `.env.local` と同じ 4〜6 個を登録
   （`SUPABASE_SERVICE_ROLE_KEY` と `OPENAI_API_KEY` は Production / Preview のみに）
3. Deploy。ビルド設定は既定のままで動きます

補足:

- Supabase 側で Vercel の IP を許可する設定は不要です（プーラー経由のため）
- 画像は Supabase Storage に入るので、Vercel のファイルシステムには何も書きません
- `npm run export` はローカル（または任意のサーバー）から本番 DB に対して実行します

---

## 画面構成

| パス | 画面 | デザイン方針 |
|---|---|---|
| `/` | トップ | スポーティー／ナイキ的 |
| `/leagues` | 試合募集 | 誰が何を募集中か一目でわかるカード＋定員ゲージ |
| `/leagues/new` | リーグ作成（主催側） | 主催者ID・人数・プール数・募集日時を指定 |
| `/register` | ユーザー登録 | 番号つき1問1答の簡素な動線 |
| `/leagues/[id]/join` | 参加申込・スカッド登録 | W杯の選手登録シート風 |
| `/leagues/[id]` | リーグ表・トーナメント表 | W杯グループリーグ風（緑ピッチ＋ゴールド） |
| `/matches/[id]/report` | 試合結果の登録・承認 | 状態に応じてフォーム／承認パネルを出し分け |
| `/data` | みんなのデータ | フォーメーション別勝率と相性表（公開してよい集計のみ） |

## 本人確認のしくみ

登録時に2つを入力します。

| 項目 | 例 | 性質 |
|---|---|---|
| **ユーザー名** | `TOMOYA_10` | 公開。リーグ表や対戦カードに表示される。一意 |
| **ユーザーID** | `ASLV-569-790-534` | 秘密。eFootball のマイページに出ているID。一意 |

ユーザーIDは**パスワードの代わり**です。以下の操作はすべてユーザーIDで本人確認します。

- リーグの作成（＝主催者になる）
- 参加申込・スカッド登録
- 試合結果の登録（ホーム側のIDのみ受け付ける）
- 結果の承認・差し戻し（アウェイ側のIDのみ受け付ける）
- リーグの確定（主催者のIDのみ受け付ける）

扱いの決めごと:

- **画面にユーザーIDは一切表示しません。** 「ホーム側の TOMOYA_10 さんだけです」のように、
  権限の説明には常にユーザー名を使います
- 入力欄は既定で伏せ字です（「表示」ボタンで確認できます）
- `GET /api/users` もユーザー名しか返しません。CSV にもユーザーIDは含めません
- 小文字・全角・スペース・区切り無し（`aslv569790534`）で入力しても正規化して受け付けます
- 一度入力したIDはその端末の localStorage にだけ記憶し、次回から自動入力されます

## 動作の流れ

**主催側**

1. ユーザー登録（ユーザー名 ＋ ユーザーID ＋写真）
2. リーグ作成（主催者のユーザーID / 1プールの人数 / プール数 / 募集日時）
   - ここで本人確認されたユーザーが主催者になり、この人だけがリーグを確定できます
3. 全試合の承認が終わったら「結果を確定してリーグを終了」

**ユーザー側**

1. ユーザー登録
2. 試合申し込み＋スカッド登録
   （スクショ・スカッド名・**攻撃時/守備時フォーメーション**・チームスタイル・チームパワー）
3. 規定人数（`1プール人数 × プール数`）に達するまでは「準備中」画面
4. 定員到達で **自動締切 → プールへランダム振り分け → 総当たり日程を自動生成**

**リーグ進行（ホーム登録 → アウェイ承認）**

1. プールごとに対戦順（Matchday）が発表される
2. 試合後、**ホーム側**が結果画面の写真を送信して結果を登録する
3. AI（GPT-4o mini）が画像から 28 項目のスタッツを読み取り、内容を画面で確認
4. 登録スカッド名と画像内のチーム名を自動照合
   - 一致すれば勝敗・得点・失点がそのまま入る
   - 左右が逆なら自動で入れ替え／照合できなければ手動で確認して送信
5. **アウェイ側**が内容を確認して承認、または理由を添えて差し戻す
   - 差し戻すとホームに戻り、理由が表示された状態で登録し直せる
6. 承認された時点でリーグ表と集計に反映（**勝ち点降順 → 得失点差降順 → 総得点降順**）
7. 全試合が承認まで完了すると、主催者が「結果を確定してリーグを終了」を押せる

試合の状態は `scheduled`（未登録）→ `pending`（承認待ち）→ `reported`（承認済み）と遷移します。
承認待ちの結果はリーグ表にも集計にも反映されません。
本人確認はユーザーIDで行い、ホーム以外は登録できず、アウェイ以外は承認できません。

## 決勝トーナメント表

グループリーグの下に、W杯と同じ形式のトーナメント表を表示します。

- 各グループの**上位2名**が進出。「A組1位 × B組2位」のたすき掛けで組みます
- そのグループの全試合が承認されると、枠にチーム名が入ります（未確定の組は「未確定」表示）
- プール数が奇数のときは余ったグループの1位×2位、2の冪でないときは不戦勝で埋めます
- 現状は**表示のみ**。トーナメントの対戦・結果登録は今後のアップデートで対応します

## データの扱い（公開 / 運営）

**公開しているもの（`/data`）** — みんなが見て楽しめる集計だけ。試合が承認されるたびに更新されます。

- フォーメーション別の勝率（試合数・勝分敗・平均得失点・平均勝点）
- フォーメーション相性表（縦＝自分 / 横＝相手、セルは勝率と試合数）

**公開していないもの** — 個々の試合スタッツ、スカッド一覧、参加者マスタ、CSV。
サイト上にダウンロード口は一切ありません（CSV 配布用の API ルートは存在しません）。
DB 側も全テーブルで RLS を有効にし、ポリシーを作っていないため、
anon キーが漏れても外部からは1行も読めません。読み書きはサーバー側の接続だけです。

**運営による取り出し** — 手元で CLI から実行します（`.env.local` の `DATABASE_URL` を見ます）。

```bash
npm run export                          # exports/ に3ファイル出力
npm run export -- --out /path/to/dir    # 出力先を指定
npm run export -- --stdout matches.csv  # 標準出力へ（パイプ処理用）
```

出力される CSV:

- `matches.csv` — `match_id, league_id, home_squad_id, away_squad_id, home_team_name, away_team_name, match_result, home_score … away_saves`（全35列 / 承認済みの試合のみ）
- `squads.csv` — `squad_id, user_id, team_name, attack_formation, defence_formation, team_style, team_power`
- `user.csv` — `user_id, user_name`（ユーザーIDは合言葉なので出力しません）

`league_id` / `home_squad_id` / `away_squad_id` を含めているので、`squads.csv` と結合すれば
「どの攻撃時/守備時フォーメーション・チームパワー・チームスタイルで戦った試合か」を辿れます。

## 構成

```
app/
  page.jsx                     トップ
  leagues/                     募集一覧・作成・リーグ表・トーナメント表・参加申込
  matches/[id]/report/         結果の登録と承認
  data/                        公開用の集計（勝率・相性表）
  api/                         users / leagues / entries / analyze / result / approve / finalize
components/                    フォーム類・トーナメント表
lib/
  db.js         Supabase(PostgreSQL) 接続。プーラー前提で prepare:false
  auth.js       ユーザーIDによる本人確認（サーバー専用）
  user-id.js    ユーザー名/IDの形式ルール（クライアントからも使う）
  schema.js     スタッツ項目定義（matches.csv の列と一対一）
  league.js     抽選・日程生成・順位表・スカッド名照合・承認/差し戻し・トーナメント表
  analytics.js  公開してよい集計（勝率・相性表）だけを組み立てる
  vision.js     GPT-4o mini による画像読み取り
  csv.js        CSV 生成（運営用スクリプトからのみ利用）
  storage.js    Supabase Storage への画像アップロード
scripts/
  seed.mjs      サンプルデータ
  export.mjs    運営用の CSV 取り出し
  env.mjs       CLI 用の .env ローダー
supabase/
  schema.sql    新規構築用の DDL（テーブル・RLS・Storage バケット）
  migrations/   既存DBに当てる差分SQL
```

## 検証済みの動作

実際の PostgreSQL 18 に `schema.sql` を適用し、そこに接続して確認しています。

- スキーマ適用（5テーブル / matches 45カラム / 全テーブル RLS 有効）
- **マイグレーション 001**: 移行前スキーマを再現してから適用し、
  リネーム・仮ID付与・制約追加が通ること、2回続けて実行しても壊れないこと、
  不正な形式のIDが DB の CHECK 制約で弾かれること
- **本人確認**:
  - 登録時のバリデーション（形式不正 / ユーザー名の重複 / ユーザーIDの重複 /
    同一人物の再登録はログイン扱い）
  - 小文字・スペース入り・区切り無しのIDを正規化して受け付けること
  - 結果登録をアウェイのID・第三者のID・ID未入力で試して全て拒否されること
  - 承認をホーム自身のIDで試して拒否されること
  - 確定を参加者（非主催者）のIDで試して拒否されること
  - `GET /api/users` とレンダリング後のHTMLにユーザーIDが1件も含まれないこと
- seed 投入と、総当たり日程の生成・勝ち点／得失点差による並び替え
- 数値型が文字列で返らないこと（`played` / `avg_gf` / `team_power` などが number）
- スカッド名の自動照合（正順・左右逆・不一致）
- 承認フロー一連（ホーム登録 → 差し戻し（理由が画面に表示される）→ 再登録 → 承認 → 確定）
- 相性表の整合性（視点展開行数＝試合数×2、勝分敗の合計、勝率の範囲、行列の対称性）
- `/api/export/*` が 404 であること、`npm run export` の3ファイル出力と `--stdout`
- Storage クライアントの初期化と公開URLの組み立て
- `next build` の成功と全ページの 200 応答

未検証: 実際の Supabase インスタンスへの接続と、Storage への実アップロード
（サンドボックスから外部通信ができないため）。手順どおりに環境変数を入れれば動く想定です。

## 現状の割り切り

- ユーザーIDを知っている人はその人になりすませます（パスワードと同じ性質）。
  IDは平文で保存しているので、DB が漏れれば全員のIDが漏れます。
  本格的に守るなら、ハッシュ化やセッション方式への移行を検討してください。
- ログイン状態という概念はなく、操作のたびにIDを入力します
  （同じ端末なら localStorage から自動入力されます）。
- 承認の督促・通知機能はありません。承認待ちはリーグ表のバッジで確認します。
- トーナメントは表示のみで、対戦・結果登録には未対応です。
- Storage バケットは Public です（画像URLを知っていれば誰でも見られます）。
