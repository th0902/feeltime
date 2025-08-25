# FeelTime

企業向けの勤怠管理に「感情の記録」を組み合わせたシンプルなサンプルアプリです。出勤・退勤時に 5 段階のアイコンと任意のメモを登録できます。

## 機能
- 出勤/退勤の記録（必須: 社員ID, 感情 1–5、任意: メモ）
- 最近の記録と簡易サマリ（出勤/退勤の件数・平均感情）
- API: `POST /api/clock`, `GET /api/summary`, `GET /api/recent`

## 技術スタック
- Node.js (Express)
- DB: ローカルは SQLite、Cloud Run など本番は PostgreSQL を想定
- セキュリティ: Helmet、入力バリデーション: Zod

## セットアップ（ローカル）
1. Node.js 18+ を用意
2. 依存関係をインストール
   - `npm install`
3. 起動
   - `npm run dev`
4. ブラウザで `http://localhost:8080` を開く

デフォルトでは `./data/dev.db` に SQLite データベースを作成します。

## 環境変数
- `DATABASE_URL` を `postgres://` で始まる接続文字列に設定すると PostgreSQL を使用します（例: Cloud SQL）。
- `SQLITE_PATH` で SQLite のパスを上書きできます（ローカル開発向け）。
- `PORT`（省略可、デフォルト 8080）

## デプロイ（Cloud Run）
前提: GCP プロジェクトと gcloud CLI を設定済み、Cloud SQL (PostgreSQL) を用意。

1. コンテナイメージのビルドとプッシュ
   - `gcloud builds submit --tag gcr.io/PROJECT_ID/feeltime` 
2. Cloud Run にデプロイ
   - `gcloud run deploy feeltime \
       --image gcr.io/PROJECT_ID/feeltime \
       --region asia-northeast1 \
       --platform managed \
       --allow-unauthenticated \
       --set-env-vars DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DBNAME"`

Cloud SQL を使用する場合は、Cloud SQL Proxy（または Cloud Run のVPCコネクタ/プライベートIP）を適宜設定してください。PostgreSQL を指定すると、アプリ起動時にテーブルが自動作成されます。

## API 仕様（概要）
### POST /api/clock
Body(JSON): `{ employeeId: string, type: 'in'|'out', emotion: 1..5, note?: string }`
レスポンス: `201 { ok: true, id: string }`

### GET /api/summary?employeeId=E123&from=ISO&to=ISO
レスポンス: `{ ok: true, summary: { in: { count, avg }, out: { count, avg } } }`

### GET /api/recent?employeeId=E123&limit=10
レスポンス: `{ ok: true, rows: [{ id, event_type, emotion, note, created_at }, ...] }`

## 注意点
- Cloud Run のコンテナファイルシステムはエフェメラルです。永続化には必ず外部DB(PostgreSQL/Cloud SQL)を使用してください。ローカル開発のみ SQLite を想定しています。
- 本サンプルには認証は含まれていません。社内導入時は SSO 等の認証/認可を追加してください。

