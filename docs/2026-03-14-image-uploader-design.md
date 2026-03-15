# Image Uploader 設計ドキュメント

**作成日:** 2026-03-14
**改訂日:** 2026-03-15
**ステータス:** 承認済み（POC スコープ）

## 概要

ユーザーが画像をアップロード・閲覧できる Web サービス。ログイン済みユーザーはアップロードと自分の画像の削除が可能。非ログインユーザーはギャラリーの閲覧のみ可能。

## 技術スタック

| 用途           | 技術                                 |
| -------------- | ------------------------------------ |
| フレームワーク | TanStack Start (React 19)            |
| デプロイ       | Cloudflare Workers                   |
| 認証           | BetterAuth（Google OAuth）           |
| データベース   | Cloudflare D1（SQLite）+ Drizzle ORM |
| 画像ストレージ | Cloudflare R2                        |
| スタイリング   | Tailwind CSS v4                      |
| テスト         | Vitest                               |

## アーキテクチャ

```
ブラウザ
  ├─ ギャラリー・詳細（誰でも）
  ├─ アップロード・削除（ログイン済みのみ）
  └─ Google OAuth ログイン

TanStack Start on Cloudflare Workers
  ├─ サーバー関数 (createServerFn)
  │    ├─ env 取得: import { env } from "cloudflare:workers"
  │    ├─ DB: getDb() → drizzle(env.DB)
  │    └─ ハンドラーに { db, bucket, userId } を注入
  ├─ 画像配信: GET /api/images/:imageId/file
  └─ BetterAuth: /api/auth/*

Cloudflare D1 ← Drizzle ORM
Cloudflare R2 ← env.IMAGES_BUCKET
```

### アップロードのデータフロー

1. ブラウザがサーバー関数に画像を POST
2. `ensureSession()` でセッションを確認（未認証なら例外）
3. ハンドラーがファイルサイズと MIME タイプを検証
4. R2 に保存（`images/{userId}/{uuid}.{ext}`）
5. D1 にメタデータを保存（Drizzle ORM 経由）
6. `{ id }` をレスポンスとして返す

### 画像配信フロー

1. ブラウザが `GET /api/images/:imageId/file` をリクエスト
2. D1 からメタデータを取得（存在しなければ 404）
3. R2 からバイナリを取得して `Content-Type` ヘッダー付きでレスポンス

## ルート構成

| パス                        | 説明                             | 認証要件                            |
| --------------------------- | -------------------------------- | ----------------------------------- |
| `/`                         | パブリックギャラリー（画像一覧） | 不要                                |
| `/images/$imageId`          | 画像詳細ページ                   | 不要                                |
| `/upload`                   | アップロードページ               | 必須（未認証は `/` へリダイレクト） |
| `/api/auth/*`               | BetterAuth エンドポイント        | -                                   |
| `/api/images/:imageId/file` | 画像バイナリ配信                 | 不要                                |

## データモデル

### images テーブル（Drizzle スキーマ）

`src/lib/drizzle/schema.ts` に追加。既存の `id`, `timestamps` ヘルパーを再利用。

```ts
export const images = sqliteTable(
  "images",
  {
    id,
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    r2Key: text("r2_key").notNull().unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    ...timestamps,
  },
  (table) => [index("images_createdAt_idx").on(table.createdAt)],
);
```

マイグレーションは `drizzle-kit generate` で生成し、`wrangler d1 migrations apply` で適用。

> **Note:** `timestamps` ヘルパーにより `updatedAt` カラムも自動付与される。画像はアップロード後に更新されないため `updatedAt` は実質未使用だが、既存ヘルパーとの一貫性を優先しそのまま含める。

### R2 キー構造

```
images/{userId}/{uuid}.{ext}
```

## env バインディング取得

Cloudflare 公式推奨の `cloudflare:workers` モジュールを使用。

```ts
import { env } from "cloudflare:workers";
// env.DB, env.IMAGES_BUCKET, env.GOOGLE_CLIENT_ID, etc.
```

## DB アクセス

`src/lib/drizzle/db.ts` で `getDb()` ヘルパーを提供。

```ts
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  return drizzle(env.DB, { schema });
}

export type Database = ReturnType<typeof getDb>;
```

サーバー関数のハンドラーは `db` を引数で受け取り、`cloudflare:workers` に直接依存しない。

## 認証

### BetterAuth 設定（`src/lib/auth.ts`）

ファクトリー関数として実装。Workers runtime でリクエストコンテキスト外での module-level I/O を避けるため。

```ts
import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getDb } from "@/lib/drizzle/db";
import * as schema from "@/lib/drizzle/schema";

export function createAuth() {
  const db = getDb();
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema, usePlural: true }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    plugins: [tanstackStartCookies()],
  });
}
```

### auth ルートハンドラー（`src/routes/api/auth.$.ts`）

BetterAuth 公式の TanStack Start パターンに準拠。

```ts
import { createAuth } from "@/lib/auth";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = createAuth();
        return auth.handler(request);
      },
      POST: async ({ request }) => {
        const auth = createAuth();
        return auth.handler(request);
      },
    },
  },
});
```

### セッション確認ヘルパー（`src/lib/auth.functions.ts`）

BetterAuth 公式推奨パターン。ルート保護やサーバー関数の認証に使用。

```ts
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createAuth } from "@/lib/auth";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const auth = createAuth();
  const headers = getRequestHeaders();
  return auth.api.getSession({ headers });
});

export const ensureSession = createServerFn({ method: "GET" }).handler(async () => {
  const auth = createAuth();
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error("Unauthorized");
  return session;
});
```

### クライアント SDK（`src/lib/auth/auth-client.ts`）

```ts
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient();
export type Session = typeof authClient.$Infer.Session;
```

## サーバー関数

### 設計パターン: 2 層分離

各サーバー関数は **ラッパー** と **ハンドラー** に分離する。

- **ラッパー（`createServerFn`）:** env 取得・認証・依存の組み立て
- **ハンドラー（テスト対象）:** ビジネスロジックのみ。フレームワーク非依存。

```
createServerFn wrapper
  ├─ getDb() → db
  ├─ env.IMAGES_BUCKET → bucket（必要な場合）
  ├─ ensureSession() → userId（認証が必要な場合）
  └─ handler({ db, bucket?, userId?, ... })
```

### 関数一覧

| 関数          | ハンドラーの型                                    | 認証               |
| ------------- | ------------------------------------------------- | ------------------ |
| `listImages`  | `({ db }) => ImageRecord[]`（最大 50 件、新着順） | 不要               |
| `getImage`    | `({ db, imageId }) => ImageRecord \| null`        | 不要               |
| `uploadImage` | `({ db, bucket, userId, file }) => { id }`        | 必須               |
| `deleteImage` | `({ db, bucket, userId, imageId }) => void`       | 必須（所有者のみ） |

### バリデーション（アップロード時）

- ファイルサイズ上限: 10 MB
- 許可 MIME タイプ: `image/jpeg`, `image/png`, `image/webp`, `image/gif`

### 削除時の順序

1. D1 レコードを先に削除（ゴーストレコード防止）
2. R2 オブジェクトを削除（失敗時はログ記録のみ）

## テスト戦略

### テスト対象

ハンドラー関数のみ。`createServerFn` ラッパー・auth ルート・UI コンポーネントはテストしない。

### 依存注入パターン

ハンドラーは `{ db, bucket, userId }` を引数で受け取るため、テストでは `cloudflare:workers` や BetterAuth に一切依存しない。

```ts
// テスト例
const mockDb = { select: vi.fn().mockReturnThis() /* ... */ };
const result = await listImagesHandler({ db: mockDb as any });
```

### テストファイルの配置

実装ファイルと同じディレクトリにコロケーション。

```
src/lib/functions/
  ├─ listImages.ts
  ├─ listImages.test.ts
  ├─ ...
```

### vitest 設定

現在の `vitest.config.ts` は `resolve.tsconfigPaths: true` で `@/` エイリアスを解決しており、変更不要。

## セキュリティ考慮事項

- サーバー関数は `ensureSession()` でセッション検証（クライアント側のみに依存しない）
- 削除時は所有者確認を必ず行う（他ユーザーの画像を削除できないこと）
- R2 オブジェクトへの直接アクセスは Worker 経由のみ（バケットをパブリック公開しない）
- アップロード時のファイルサイズ・MIME タイプ検証

## ファイル構成

```
src/
├─ lib/
│   ├─ auth.ts                       # createAuth() ファクトリー
│   ├─ auth.functions.ts             # getSession / ensureSession ヘルパー
│   ├─ auth/
│   │   └─ auth-client.ts            # authClient エクスポート
│   ├─ drizzle/
│   │   ├─ db.ts                     # getDb() ヘルパー
│   │   ├─ schema.ts                 # テーブル定義（images 追加）
│   │   ├─ helper.ts                 # 共通カラムヘルパー
│   │   └─ migrations/               # drizzle-kit generate の出力先
│   └─ functions/
│       ├─ listImages.ts
│       ├─ listImages.test.ts
│       ├─ getImage.ts
│       ├─ getImage.test.ts
│       ├─ uploadImage.ts
│       ├─ uploadImage.test.ts
│       ├─ deleteImage.ts
│       └─ deleteImage.test.ts
├─ routes/
│   ├─ __root.tsx                    # レイアウト + Header
│   ├─ index.tsx                     # ギャラリー
│   ├─ upload.tsx                    # アップロードページ
│   ├─ images/
│   │   └─ $imageId.tsx              # 画像詳細
│   └─ api/
│       ├─ auth.$.ts                 # BetterAuth ルートハンドラー
│       └─ images.$imageId.file.ts   # 画像配信
```

### 変更対象ファイル（既存）

| ファイル                      | 変更内容                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/auth.ts`             | singleton → `createAuth()` ファクトリー + `tanstackStartCookies` + Google OAuth |
| `src/lib/auth/auth-client.ts` | `authClient` を named export に追加                                             |
| `src/lib/drizzle/db.ts`       | placeholder → `getDb()` ヘルパー                                                |
| `src/lib/drizzle/schema.ts`   | `images` テーブル追加                                                           |
| `src/routes/__root.tsx`       | Header コンポーネント追加（認証 UI）                                            |
| `src/routes/index.tsx`        | ギャラリー実装                                                                  |

## Cloudflare バインディング（wrangler.jsonc）

既に設定済み:

```jsonc
{
  "d1_databases": [
    { "binding": "DB", "database_name": "tanstack-image-uploader", "database_id": "..." },
  ],
  "r2_buckets": [{ "binding": "IMAGES_BUCKET", "bucket_name": "tanstack-image-uploader-images" }],
}
```
