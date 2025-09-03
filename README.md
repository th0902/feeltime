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
 - `STORAGE_BACKEND` に `gcs` を指定すると、DBなしで Google Cloud Storage に保存します。
 - `GCS_BUCKET`（必須: `STORAGE_BACKEND=gcs` のとき）保存先バケット名。
 - `GCS_PREFIX`（任意）バケット内の保存プレフィックス。デフォルト `feeltime`

## デプロイ（Cloud Run）
前提: GCP プロジェクトと gcloud CLI を設定済み。本番DBは Cloud SQL for PostgreSQL を想定します。

1) コンテナのビルド/プッシュ
- `gcloud builds submit --tag gcr.io/PROJECT_ID/feeltime`

2) Cloud SQL を準備（例）
- PostgreSQL インスタンスとデータベース、ユーザー/パスワードを作成
- 接続方法はいずれかを選択
  - 公開IP: `DATABASE_URL=postgres://USER:PASSWORD@PUBLIC_IP:5432/DBNAME`
  - Unix ソケット（推奨）: Cloud Run で `--add-cloudsql-instances INSTANCE_CONNECTION_NAME` を付与し、
    `DATABASE_URL="postgres://USER:PASSWORD@/DBNAME?host=/cloudsql/INSTANCE_CONNECTION_NAME"`

3) Cloud Run へデプロイ
```
gcloud run deploy feeltime \
  --image gcr.io/PROJECT_ID/feeltime \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL="postgres://USER:PASSWORD@HOST_OR_SOCKET/DBNAME[?host=/cloudsql/INSTANCE_CONNECTION_NAME]" \
  [--add-cloudsql-instances INSTANCE_CONNECTION_NAME]
```

4) 初期データの投入（非破壊）
- 初回のみ、データが空であればサンプルの部門/社員/直近30日分の感情ログを投入します。
- いずれかの方法を選んで実行してください。

方法A: ローカルから一度だけ実行
```
DATABASE_URL="postgres://..." npm run seed:once
```

方法B: Cloud Run Job で実行（推奨）
```
gcloud run jobs create feeltime-seed \
  --image gcr.io/PROJECT_ID/feeltime \
  --region asia-northeast1 \
  --command node \
  --args scripts/seed-once.js \
  --set-env-vars DATABASE_URL="postgres://USER:PASSWORD@HOST_OR_SOCKET/DBNAME[?host=/cloudsql/INSTANCE_CONNECTION_NAME]" \
  [--add-cloudsql-instances INSTANCE_CONNECTION_NAME]

gcloud run jobs execute feeltime-seed --region asia-northeast1 --wait
```

注意:
- `scripts/seed-once.js` は既に部門が存在する場合は何もしません（非破壊）。
- `scripts/seed.js` はリセット（TRUNCATE/DELETE）して再投入するため、本番では使用しないでください。
- PostgreSQL を指定すると、アプリ起動時に必要なテーブルは自動作成されます。

### DBなし運用（Cloud Storage への保存）
DB セットアップが面倒な場合の簡易運用モードです。Cloud Storage に JSON ファイルとして保存します。

- 使い方（Cloud Run）
  - サービス/ジョブで以下を設定
    - `STORAGE_BACKEND=gcs`
    - `GCS_BUCKET=your-bucket`
    - `GCS_PREFIX=feeltime`（任意）
  - サービスアカウントに最低 `roles/storage.objectAdmin`（またはより限定的な権限）を付与

- 仕組み
  - 部門/社員は `departments.json` / `employees.json`
  - 感情ログは `events/<イベントID>.json` として 1 イベント = 1 オブジェクトで保存
  - 集計系APIは GCS からイベントを読み出してアプリ側で計算（小規模前提）

- 注意点
  - 同時書き込みが多い大規模用途や高度なクエリには不向きです（DB推奨）
  - 料金・パフォーマンス最適化のため、データ量が増えたら Cloud SQL/Firestore 等への移行を検討してください

初期データ投入は前述の Cloud Run Job（`scripts/seed-once.js`）がそのまま使えます。`STORAGE_BACKEND=gcs` と GCS 関連の環境変数を設定すれば、Cloud SQL なしで GCS に初期データが作られます。

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
