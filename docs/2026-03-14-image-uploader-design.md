# Image Uploader 設計ドキュメント

**作成日:** 2026-03-14
**ステータス:** 承認済み（POC スコープ）

## 概要

ユーザーが画像をアップロード・閲覧できる Web サービス。ログイン済みユーザーはアップロードと自分の画像の削除が可能。非ログインユーザーはギャラリーの閲覧のみ可能。

## 技術スタック

| 用途 | 技術 |
|------|------|
| フレームワーク | TanStack Start (React 19) |
| デプロイ | Cloudflare Workers |
| 認証 | BetterAuth（GitHub / Google OAuth） |
| データベース | Cloudflare D1（SQLite） |
| 画像ストレージ | Cloudflare R2 |
| スタイリング | Tailwind CSS v4 |

## アーキテクチャ

```
ブラウザ
  ├─ 画像一覧・詳細（誰でも）
  ├─ アップロード・削除（ログイン済みのみ）
  └─ OAuthログイン（GitHub / Google）

TanStack Start on Cloudflare Worker
  ├─ サーバー関数: アップロード・削除・一覧取得
  ├─ 画像配信エンドポイント: GET /api/images/:imageId/file
  └─ BetterAuth: 認証・セッション管理

Cloudflare D1（SQLite）
  ├─ BetterAuth テーブル（user / session / account / verification）
  └─ images テーブル（メタデータ）

Cloudflare R2
  └─ 実際の画像ファイル（images/{userId}/{uuid}.{ext}）
  ※ バケットはパブリック公開しない。Worker 経由でのみ配信。
```

### アップロードのデータフロー

1. ブラウザがサーバー関数に画像を POST
2. サーバーがセッションを確認（未認証なら 401）
3. ファイルサイズと Content-Type を検証
4. R2 に保存（`images/{userId}/{uuid}.{ext}`）
5. D1 にメタデータを保存（失敗した場合はエラーをログ記録して 500 を返す）
6. imageId をレスポンスとして返す

### 画像配信フロー

1. ブラウザが `GET /api/images/:imageId/file` をリクエスト
2. D1 からメタデータを取得（存在しなければ 404）
3. R2 からバイナリを取得して `Content-Type` ヘッダー付きでレスポンス

## ルート構成

| パス | 説明 | 認証要件 |
|------|------|---------|
| `/` | パブリックギャラリー（画像一覧） | 不要 |
| `/images/$imageId` | 画像詳細ページ | 不要 |
| `/upload` | アップロードページ | 必須（未認証は `/` へリダイレクト） |
| `/api/auth/...` | BetterAuth エンドポイント | - |
| `/api/images/:imageId/file` | 画像バイナリ配信 | 不要 |

## データモデル

### D1 スキーマ

```sql
-- BetterAuth が自動生成
-- user, session, account, verification テーブル

-- 独自テーブル
CREATE TABLE images (
  id          TEXT PRIMARY KEY,                        -- UUID v4
  user_id     TEXT NOT NULL REFERENCES user(id),
  r2_key      TEXT NOT NULL UNIQUE,                    -- R2 オブジェクトキー
  filename    TEXT NOT NULL,                           -- オリジナルファイル名
  mime_type   TEXT NOT NULL,                           -- image/jpeg など
  size        INTEGER NOT NULL,                        -- バイト数
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))  -- YYYY-MM-DD HH:MM:SS UTC
);

CREATE INDEX idx_images_created_at ON images(created_at DESC);
```

### R2 キー構造

```
images/{userId}/{uuid}.{ext}
```

## サーバー関数

| 関数名 | 処理 | 認証 |
|--------|------|------|
| `uploadImage(formData)` | 認証確認 → サイズ・MIME検証 → R2保存 → D1保存 → imageId返却 | 必須 |
| `deleteImage(imageId)` | 認証確認 → 所有者確認 → D1削除 → R2削除（失敗時はログ記録） | 必須（所有者のみ） |
| `listImages()` | 新着順で最大50件取得 | 不要 |
| `getImage(imageId)` | 画像メタデータ取得 | 不要 |

## 認証フロー

- BetterAuth の `auth.api.getSession()` でセッション取得
- `/upload` ルートはサーバーサイドでセッション確認し、未認証なら `/` にリダイレクト
- `uploadImage` / `deleteImage` はサーバー関数内でも再チェック（二重防衛）

## バリデーション

**アップロード時:**
- ファイルサイズ上限: 10MB（受信後に検証）
- 許可 MIME タイプ（Content-Type で確認）: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

## Cloudflare バインディング（wrangler.jsonc）

```jsonc
{
  "d1_databases": [
    { "binding": "DB", "database_name": "tanstack-image-uploader", "database_id": "<TBD>" }
  ],
  "r2_buckets": [
    { "binding": "IMAGES_BUCKET", "bucket_name": "tanstack-image-uploader-images" }
  ]
}
```

## セキュリティ考慮事項

- サーバー関数は常にセッション検証を行う（クライアント側のみに依存しない）
- 削除時は所有者確認を必ず行う（他ユーザーの画像を削除できないこと）
- R2 オブジェクトへの直接アクセスは Worker 経由のみ（バケットをパブリック公開しない）

## ファイル構成（予定）

```
src/
├─ routes/
│   ├─ __root.tsx                    # レイアウト
│   ├─ index.tsx                     # ギャラリー
│   ├─ upload.tsx                    # アップロードページ
│   ├─ images/
│   │   └─ $imageId.tsx              # 画像詳細
│   └─ api/
│       └─ images.$imageId.file.ts   # 画像配信エンドポイント
├─ server/
│   ├─ auth.ts                       # BetterAuth 設定
│   ├─ db.ts                         # D1 クライアント
│   └─ functions/
│       ├─ uploadImage.ts
│       ├─ deleteImage.ts
│       ├─ listImages.ts
│       └─ getImage.ts
└─ styles.css
```
