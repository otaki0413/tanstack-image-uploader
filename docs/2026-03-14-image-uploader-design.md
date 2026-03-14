# Image Uploader 設計ドキュメント

**作成日:** 2026-03-14
**ステータス:** 承認済み

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
  └─ BetterAuth: 認証・セッション管理

Cloudflare D1（SQLite）
  ├─ BetterAuth テーブル（user / session / account / verification）
  └─ images テーブル（メタデータ）

Cloudflare R2
  └─ 実際の画像ファイル（images/{userId}/{uuid}.{ext}）
```

### アップロードのデータフロー

1. ブラウザがサーバー関数に画像を POST
2. サーバーがセッションを確認（未認証なら 401）
3. R2 に保存（`images/{userId}/{uuid}.{ext}`）
4. D1 にメタデータを保存
5. imageId をレスポンスとして返す

## ルート構成

| パス | 説明 | 認証要件 |
|------|------|---------|
| `/` | パブリックギャラリー（画像一覧） | 不要 |
| `/images/$imageId` | 画像詳細ページ | 不要 |
| `/upload` | アップロードページ | 必須（未認証は `/` へリダイレクト） |
| `/api/auth/...` | BetterAuth エンドポイント | - |

## データモデル

### D1 スキーマ

```sql
-- BetterAuth が自動生成
-- user, session, account, verification テーブル

-- 独自テーブル
CREATE TABLE images (
  id          TEXT PRIMARY KEY,   -- UUID v4
  user_id     TEXT NOT NULL REFERENCES user(id),
  r2_key      TEXT NOT NULL,      -- R2 オブジェクトキー
  filename    TEXT NOT NULL,      -- オリジナルファイル名
  mime_type   TEXT NOT NULL,      -- image/jpeg など
  size        INTEGER NOT NULL,   -- バイト数
  created_at  TEXT NOT NULL       -- ISO 8601
);
```

### R2 キー構造

```
images/{userId}/{uuid}.{ext}
```

## サーバー関数

| 関数名 | 処理 | 認証 |
|--------|------|------|
| `uploadImage(formData)` | 認証確認 → R2保存 → D1保存 → imageId返却 | 必須 |
| `deleteImage(imageId)` | 認証確認 → 所有者確認 → R2削除 → D1削除 | 必須（所有者のみ） |
| `listImages(cursor?)` | ページネーション付き一覧取得 | 不要 |
| `getImage(imageId)` | 画像メタデータ取得 | 不要 |

## 認証フロー

- BetterAuth の `auth.api.getSession()` でセッション取得
- `/upload` ルートはサーバーサイドでセッション確認し、未認証なら `/` にリダイレクト
- `uploadImage` / `deleteImage` はサーバー関数内でも再チェック（二重防衛）

## バリデーション

**アップロード時:**
- 許可 MIME タイプ: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- ファイルサイズ上限: 10MB

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
- アップロード時の MIME タイプ検証はサーバーサイドで行う

## ファイル構成（予定）

```
src/
├─ routes/
│   ├─ __root.tsx          # レイアウト
│   ├─ index.tsx           # ギャラリー
│   ├─ upload.tsx          # アップロードページ
│   └─ images/
│       └─ $imageId.tsx    # 画像詳細
├─ server/
│   ├─ auth.ts             # BetterAuth 設定
│   ├─ db.ts               # D1 クライアント
│   └─ functions/
│       ├─ uploadImage.ts
│       ├─ deleteImage.ts
│       ├─ listImages.ts
│       └─ getImage.ts
└─ styles.css
```
