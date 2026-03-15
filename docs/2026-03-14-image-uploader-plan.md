# Image Uploader Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** POC image uploader on TanStack Start + Cloudflare Workers — ログイン済みユーザーが画像をアップロード・削除でき、誰でもギャラリーを閲覧できる。

**Architecture:** `createServerFn` ラッパーが `cloudflare:workers` から env を取得し、`getDb()` で Drizzle インスタンスを生成。ハンドラー関数は `{ db, bucket, userId }` を引数で受け取る依存注入パターン。認証は BetterAuth + Google OAuth。

**Tech Stack:** TanStack Start (React 19), Cloudflare Workers, BetterAuth, Cloudflare D1, Cloudflare R2, Drizzle ORM, Tailwind CSS v4, Vitest

**Path alias:** `@/` → `./src/`

**Spec:** `docs/2026-03-14-image-uploader-design.md`

---

## File Map

```
変更:
  src/lib/auth.ts                      # singleton → createAuth() ファクトリー
  src/lib/auth/auth-client.ts          # authClient を named export に追加
  src/lib/drizzle/db.ts                # placeholder → getDb() ヘルパー
  src/lib/drizzle/schema.ts            # images テーブル追加
  src/routes/__root.tsx                # Header コンポーネント追加
  src/routes/index.tsx                 # ギャラリー実装

新規:
  src/lib/auth.functions.ts            # getSession / ensureSession ヘルパー
  src/routes/api/auth.$.ts             # BetterAuth ルートハンドラー
  src/lib/functions/
    listImages.ts / listImages.test.ts
    getImage.ts / getImage.test.ts
    uploadImage.ts / uploadImage.test.ts
    deleteImage.ts / deleteImage.test.ts
  src/routes/upload.tsx                # アップロードページ
  src/routes/images/$imageId.tsx       # 画像詳細ページ
  src/routes/api/images.$imageId.file.ts  # 画像配信エンドポイント
```

---

## Chunk 1: 基盤セットアップ

> **Note:** Task 1 で `db.ts` の `export const db` を `getDb()` に置き換えるため、Task 2 が完了するまで `auth.ts` の import がビルドエラーになる。Task 1 と Task 2 は連続して実行すること。

### Task 1: DB ヘルパーと images スキーマ

**Files:**

- Modify: `src/lib/drizzle/db.ts`
- Modify: `src/lib/drizzle/schema.ts`

- [ ] **Step 1: `src/lib/drizzle/db.ts` を `getDb()` ヘルパーに変更**

```ts
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function getDb() {
  return drizzle(env.DB, { schema });
}

export type Database = ReturnType<typeof getDb>;
```

- [ ] **Step 2: `src/lib/drizzle/schema.ts` に images テーブルを追加**

既存の `users`, `sessions`, `accounts`, `verifications` は変更しない。ファイル末尾に追加:

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

`index` を import に追加すること（`sqliteTable, text, integer, index` は既に import 済みだが `index` の確認が必要）。

- [ ] **Step 3: マイグレーション生成**

```bash
pnpm db:generate
```

Expected: `src/lib/drizzle/migrations/` に新しいマイグレーション SQL が生成される。`images` テーブルの CREATE TABLE と index が含まれていることを確認する。

- [ ] **Step 4: ローカル D1 にマイグレーション適用**

```bash
pnpm db:push:local
```

Expected: `Migrations applied` と表示される。

- [ ] **Step 5: コミット**

```bash
git add src/lib/drizzle/db.ts src/lib/drizzle/schema.ts src/lib/drizzle/migrations/
git commit -m "feat: add getDb helper and images table schema"
```

---

### Task 2: 認証リファクタ + auth ルート

**Files:**

- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth/auth-client.ts`
- Create: `src/lib/auth.functions.ts`
- Create: `src/routes/api/auth.$.ts`

- [ ] **Step 1: `src/lib/auth.ts` を `createAuth()` ファクトリーに変更**

ファイル全体を以下に置き換え:

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
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
      usePlural: true,
    }),
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

- [ ] **Step 2: `src/lib/auth/auth-client.ts` に `authClient` を named export 追加**

ファイル全体を以下に置き換え:

```ts
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient();
export type Session = typeof authClient.$Infer.Session;
```

- [ ] **Step 3: `src/lib/auth.functions.ts` を作成**

```ts
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { createAuth } from "@/lib/auth";

export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const auth = createAuth();
    const headers = getRequestHeaders();
    return auth.api.getSession({ headers });
  },
);

export const ensureSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const auth = createAuth();
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });
    if (!session) throw new Error("Unauthorized");
    return session;
  },
);
```

- [ ] **Step 4: `src/routes/api/auth.$.ts` を作成**

BetterAuth 公式 TanStack Start パターンに準拠:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createAuth } from "@/lib/auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const auth = createAuth();
        return auth.handler(request);
      },
      POST: async ({ request }: { request: Request }) => {
        const auth = createAuth();
        return auth.handler(request);
      },
    },
  },
});
```

- [ ] **Step 5: 型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし。`cloudflare:workers` の型解決エラーが出る場合は、`tsconfig.json` の `types` に適切な型定義があることを確認する。

- [ ] **Step 6: コミット**

```bash
git add src/lib/auth.ts src/lib/auth/auth-client.ts src/lib/auth.functions.ts src/routes/api/auth.\$.ts
git commit -m "feat: refactor auth to factory pattern and add auth route"
```

---

## Chunk 2: サーバー関数（TDD）

> **テスト方針:** ハンドラー関数のみテスト。`createServerFn` ラッパーはテストしない。
> ハンドラーは `{ db, bucket, userId }` を引数で受け取る依存注入パターン。
> Drizzle ORM のチェインメソッドをモックする。

### Task 3: listImages サーバー関数

**Files:**

- Create: `src/lib/functions/listImages.ts`
- Create: `src/lib/functions/listImages.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/functions/listImages.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { listImagesHandler } from "./listImages";

const mockImage = {
  id: "img1",
  userId: "user1",
  r2Key: "images/user1/img1.jpg",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  size: 1024,
  createdAt: new Date("2026-03-14T12:00:00Z"),
  updatedAt: new Date("2026-03-14T12:00:00Z"),
};

describe("listImagesHandler", () => {
  it("returns images ordered by createdAt desc, limit 50", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockImage]),
          }),
        }),
      }),
    };

    const result = await listImagesHandler({ db: mockDb as any });
    expect(result).toEqual([mockImage]);
    expect(mockDb.select).toHaveBeenCalledOnce();
  });

  it("returns empty array when no images", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const result = await listImagesHandler({ db: mockDb as any });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
pnpm test src/lib/functions/listImages.test.ts
```

Expected: FAIL（`listImagesHandler` が未定義）

- [ ] **Step 3: `src/lib/functions/listImages.ts` を実装**

```ts
import { desc } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";

import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

export async function listImagesHandler({ db }: { db: Database }) {
  return db.select().from(images).orderBy(desc(images.createdAt)).limit(50);
}

export const listImages = createServerFn({ method: "GET" }).handler(
  async () => {
    const db = getDb();
    return listImagesHandler({ db });
  },
);
```

- [ ] **Step 4: テストを実行してパスを確認**

```bash
pnpm test src/lib/functions/listImages.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/functions/listImages.ts src/lib/functions/listImages.test.ts
git commit -m "feat: add listImages server function"
```

---

### Task 4: getImage サーバー関数

**Files:**

- Create: `src/lib/functions/getImage.ts`
- Create: `src/lib/functions/getImage.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/functions/getImage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { getImageHandler } from "./getImage";

const mockImage = {
  id: "img1",
  userId: "user1",
  r2Key: "images/user1/img1.jpg",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  size: 1024,
  createdAt: new Date("2026-03-14T12:00:00Z"),
  updatedAt: new Date("2026-03-14T12:00:00Z"),
};

describe("getImageHandler", () => {
  function createMockDb(result: unknown) {
    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(result),
        }),
      }),
    };
  }

  it("returns image when found", async () => {
    const mockDb = createMockDb([mockImage]);
    const result = await getImageHandler({ db: mockDb as any, imageId: "img1" });
    expect(result).toEqual(mockImage);
  });

  it("returns null when not found", async () => {
    const mockDb = createMockDb([]);
    const result = await getImageHandler({ db: mockDb as any, imageId: "nonexistent" });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
pnpm test src/lib/functions/getImage.test.ts
```

Expected: FAIL

- [ ] **Step 3: `src/lib/functions/getImage.ts` を実装**

```ts
import { eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";

import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

export async function getImageHandler({
  db,
  imageId,
}: {
  db: Database;
  imageId: string;
}) {
  const rows = await db.select().from(images).where(eq(images.id, imageId));
  return rows[0] ?? null;
}

export const getImage = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { imageId: string })
  .handler(async ({ data }) => {
    const db = getDb();
    return getImageHandler({ db, imageId: data.imageId });
  });
```

- [ ] **Step 4: テストを実行してパスを確認**

```bash
pnpm test src/lib/functions/getImage.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/functions/getImage.ts src/lib/functions/getImage.test.ts
git commit -m "feat: add getImage server function"
```

---

### Task 5: uploadImage サーバー関数

**Files:**

- Create: `src/lib/functions/uploadImage.ts`
- Create: `src/lib/functions/uploadImage.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/functions/uploadImage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { uploadImageHandler } from "./uploadImage";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

describe("uploadImageHandler", () => {
  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
  const mockDb = { insert: mockInsert };
  const mockPut = vi.fn().mockResolvedValue(undefined);
  const mockBucket = { put: mockPut } as any;

  function createFile(name: string, type: string, size?: number) {
    const content = size ? new Uint8Array(size) : new Uint8Array([0x89]);
    return new File([content], name, { type });
  }

  it("throws for invalid mime type", async () => {
    const file = createFile("a.txt", "text/plain");
    await expect(
      uploadImageHandler({ db: mockDb as any, bucket: mockBucket, userId: "u1", file }),
    ).rejects.toThrow("Invalid file type");
  });

  it("throws when file exceeds 10MB", async () => {
    const file = createFile("big.jpg", "image/jpeg", 11 * 1024 * 1024);
    await expect(
      uploadImageHandler({ db: mockDb as any, bucket: mockBucket, userId: "u1", file }),
    ).rejects.toThrow("File too large");
  });

  it.each(ALLOWED_TYPES)("saves %s to R2 and D1", async (mimeType) => {
    mockPut.mockClear();
    mockInsert.mockClear().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const file = createFile("photo.jpg", mimeType);
    const result = await uploadImageHandler({
      db: mockDb as any,
      bucket: mockBucket,
      userId: "u1",
      file,
    });

    expect(mockPut).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("string");
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
pnpm test src/lib/functions/uploadImage.test.ts
```

Expected: FAIL

- [ ] **Step 3: `src/lib/functions/uploadImage.ts` を実装**

```ts
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";

import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";
import { ensureSession } from "@/lib/auth.functions";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024;

export async function uploadImageHandler({
  db,
  bucket,
  userId,
  file,
}: {
  db: Database;
  bucket: R2Bucket;
  userId: string;
  file: File;
}): Promise<{ id: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Invalid file type");
  }
  if (file.size > MAX_SIZE) {
    throw new Error("File too large");
  }

  const ext = file.name.split(".").pop() ?? "bin";
  const id = crypto.randomUUID();
  const r2Key = `images/${userId}/${id}.${ext}`;

  const buffer = await file.arrayBuffer();
  await bucket.put(r2Key, buffer, {
    httpMetadata: { contentType: file.type },
  });

  await db.insert(images).values({
    id,
    userId,
    r2Key,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  });

  return { id };
}

export const uploadImage = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: FormData }) => {
    const session = await ensureSession();
    const db = getDb();
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("No file provided");
    return uploadImageHandler({
      db,
      bucket: env.IMAGES_BUCKET,
      userId: session.user.id,
      file,
    });
  },
);
```

> **NOTE:** TanStack Start が `createServerFn` で FormData をサポートしているか事前に確認すること。動作しない場合は `createAPIFileRoute` を使った API エンドポイント（`POST /api/images/upload`）として実装し直すこと。

- [ ] **Step 4: テストを実行してパスを確認**

```bash
pnpm test src/lib/functions/uploadImage.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/functions/uploadImage.ts src/lib/functions/uploadImage.test.ts
git commit -m "feat: add uploadImage server function"
```

---

### Task 6: deleteImage サーバー関数

**Files:**

- Create: `src/lib/functions/deleteImage.ts`
- Create: `src/lib/functions/deleteImage.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/functions/deleteImage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { deleteImageHandler } from "./deleteImage";

const existingImage = {
  id: "img1",
  userId: "user1",
  r2Key: "images/user1/img1.jpg",
  filename: "photo.jpg",
  mimeType: "image/jpeg",
  size: 1024,
  createdAt: new Date("2026-03-14T12:00:00Z"),
  updatedAt: new Date("2026-03-14T12:00:00Z"),
};

describe("deleteImageHandler", () => {
  const mockDelete = vi.fn().mockResolvedValue(undefined);
  const mockBucket = { delete: mockDelete } as any;

  function createMockDb(selectResult: unknown[]) {
    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(selectResult),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };
  }

  it("throws when image not found", async () => {
    const mockDb = createMockDb([]);
    await expect(
      deleteImageHandler({ db: mockDb as any, bucket: mockBucket, userId: "user1", imageId: "nonexistent" }),
    ).rejects.toThrow("Not found");
  });

  it("throws when user does not own the image", async () => {
    const mockDb = createMockDb([existingImage]);
    await expect(
      deleteImageHandler({ db: mockDb as any, bucket: mockBucket, userId: "other-user", imageId: "img1" }),
    ).rejects.toThrow("Forbidden");
  });

  it("deletes D1 record first, then R2 object", async () => {
    const callOrder: string[] = [];
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingImage]),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(async () => {
          callOrder.push("d1");
        }),
      }),
    };
    mockDelete.mockClear().mockImplementation(async () => {
      callOrder.push("r2");
    });

    await deleteImageHandler({ db: mockDb as any, bucket: mockBucket, userId: "user1", imageId: "img1" });

    expect(callOrder).toEqual(["d1", "r2"]);
    expect(mockDelete).toHaveBeenCalledWith(existingImage.r2Key);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
pnpm test src/lib/functions/deleteImage.test.ts
```

Expected: FAIL

- [ ] **Step 3: `src/lib/functions/deleteImage.ts` を実装**

```ts
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";

import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";
import { ensureSession } from "@/lib/auth.functions";

export async function deleteImageHandler({
  db,
  bucket,
  userId,
  imageId,
}: {
  db: Database;
  bucket: R2Bucket;
  userId: string;
  imageId: string;
}): Promise<void> {
  const rows = await db.select().from(images).where(eq(images.id, imageId));
  const image = rows[0];

  if (!image) throw new Error("Not found");
  if (image.userId !== userId) throw new Error("Forbidden");

  // D1 を先に削除（ゴーストレコード防止）
  await db.delete(images).where(eq(images.id, image.id));

  // R2 を削除（失敗してもログのみ）
  try {
    await bucket.delete(image.r2Key);
  } catch (err) {
    console.error("[deleteImage] R2 delete failed:", image.r2Key, err);
  }
}

export const deleteImage = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { imageId: string })
  .handler(async ({ data }) => {
    const session = await ensureSession();
    const db = getDb();
    return deleteImageHandler({
      db,
      bucket: env.IMAGES_BUCKET,
      userId: session.user.id,
      imageId: data.imageId,
    });
  });
```

- [ ] **Step 4: テストを実行してパスを確認**

```bash
pnpm test src/lib/functions/deleteImage.test.ts
```

Expected: PASS

- [ ] **Step 5: 全テストを実行**

```bash
pnpm test
```

Expected: 全 PASS

- [ ] **Step 6: コミット**

```bash
git add src/lib/functions/deleteImage.ts src/lib/functions/deleteImage.test.ts
git commit -m "feat: add deleteImage server function"
```

---

## Chunk 3: API ルートと UI

### Task 7: 画像配信エンドポイント

**Files:**

- Create: `src/routes/api/images.$imageId.file.ts`

- [ ] **Step 1: `src/routes/api/images.$imageId.file.ts` を作成**

```ts
import { createAPIFileRoute } from "@tanstack/react-start/api";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

export const APIRoute = createAPIFileRoute("/api/images/$imageId/file")({
  GET: async ({ params }) => {
    const db = getDb();

    const rows = await db
      .select({ r2Key: images.r2Key, mimeType: images.mimeType })
      .from(images)
      .where(eq(images.id, params.imageId));

    const image = rows[0];
    if (!image) {
      return new Response("Not Found", { status: 404 });
    }

    const object = await env.IMAGES_BUCKET.get(image.r2Key);
    if (!object) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
});
```

- [ ] **Step 2: コミット**

```bash
git add "src/routes/api/images.\$imageId.file.ts"
git commit -m "feat: add image delivery endpoint"
```

---

### Task 8: ルートレイアウト（認証ヘッダー追加）

**Files:**

- Modify: `src/routes/__root.tsx`

- [ ] **Step 1: `src/routes/__root.tsx` をファイル全体を以下に置き換える**

```tsx
import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { authClient } from "@/lib/auth/auth-client";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Image Uploader" },
    ],
    links: [{ href: appCss, rel: "stylesheet" }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
  pendingComponent: PendingComponent,
});

function Header() {
  const { data: session } = authClient.useSession();

  return (
    <header className="border-b px-6 py-4 flex items-center justify-between">
      <Link to="/" className="text-xl font-bold">
        Image Uploader
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {session?.user ? (
          <>
            <Link to="/upload" className="hover:underline">
              Upload
            </Link>
            <span className="text-gray-600">{session.user.name}</span>
            <button
              type="button"
              onClick={() => authClient.signOut()}
              className="text-red-600 hover:underline"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() =>
              authClient.signIn.social({ provider: "google", callbackURL: "/" })
            }
            className="hover:underline"
          >
            Sign in with Google
          </button>
        )}
      </nav>
    </header>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <Header />
        <main className="container mx-auto px-6 py-8">{children}</main>
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundComponent() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">404</h1>
      <p>ページが見つかりませんでした。</p>
    </div>
  );
}

function ErrorComponent({ error }: { error: Error }) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-red-600">エラー</h1>
      <p>{error.message}</p>
    </div>
  );
}

function PendingComponent() {
  return <p className="p-4">読み込み中...</p>;
}
```

- [ ] **Step 2: コミット**

```bash
git add src/routes/__root.tsx
git commit -m "feat: add auth header to root layout"
```

---

### Task 9: ギャラリーページ

**Files:**

- Modify: `src/routes/index.tsx`

- [ ] **Step 1: `src/routes/index.tsx` を更新**

ファイル全体を以下に置き換え:

```tsx
import { Link, createFileRoute } from "@tanstack/react-router";

import { listImages } from "@/lib/functions/listImages";

export const Route = createFileRoute("/")({
  loader: () => listImages(),
  component: Gallery,
});

function Gallery() {
  const images = Route.useLoaderData();

  if (images.length === 0) {
    return (
      <p className="text-center text-gray-500 mt-20">
        まだ画像がありません。最初にアップロードしましょう！
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {images.map((image) => (
        <Link
          key={image.id}
          to="/images/$imageId"
          params={{ imageId: image.id }}
        >
          <img
            src={`/api/images/${image.id}/file`}
            alt={image.filename}
            className="w-full aspect-square object-cover rounded-lg hover:opacity-90 transition-opacity"
          />
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/routes/index.tsx
git commit -m "feat: implement gallery page"
```

---

### Task 10: アップロードページ

**Files:**

- Create: `src/routes/upload.tsx`

- [ ] **Step 1: `src/routes/upload.tsx` を作成**

```tsx
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { getSession } from "@/lib/auth.functions";
import { uploadImage } from "@/lib/functions/uploadImage";

export const Route = createFileRoute("/upload")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/" });
  },
  component: UploadPage,
});

function UploadPage() {
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem(
      "file",
    ) as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      await uploadImage({ data: formData });
      router.navigate({ to: "/" });
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "アップロードに失敗しました",
      );
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">画像をアップロード</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          required
          className="border rounded p-2"
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={status === "uploading"}
          className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {status === "uploading" ? "アップロード中..." : "アップロード"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/routes/upload.tsx
git commit -m "feat: add upload page with auth guard"
```

---

### Task 11: 画像詳細ページ

**Files:**

- Create: `src/routes/images/$imageId.tsx`

- [ ] **Step 1: `src/routes/images/$imageId.tsx` を作成**

```tsx
import {
  Link,
  createFileRoute,
  notFound,
  useRouter,
} from "@tanstack/react-router";

import { authClient } from "@/lib/auth/auth-client";
import { deleteImage } from "@/lib/functions/deleteImage";
import { getImage } from "@/lib/functions/getImage";

export const Route = createFileRoute("/images/$imageId")({
  loader: async ({ params }) => {
    const image = await getImage({ data: { imageId: params.imageId } });
    if (!image) throw notFound();
    return image;
  },
  component: ImageDetail,
});

function ImageDetail() {
  const image = Route.useLoaderData();
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const isOwner = session?.user?.id === image.userId;

  async function handleDelete() {
    if (!confirm("この画像を削除しますか？")) return;
    try {
      await deleteImage({ data: { imageId: image.id } });
      router.navigate({ to: "/" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/" className="text-sm text-gray-500 hover:underline mb-4 block">
        ← ギャラリーに戻る
      </Link>
      <img
        src={`/api/images/${image.id}/file`}
        alt={image.filename}
        className="w-full rounded-lg mb-4"
      />
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <p className="font-medium">{image.filename}</p>
          <p>
            {(image.size / 1024).toFixed(1)} KB · {image.mimeType}
          </p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm text-red-600 hover:underline"
          >
            削除
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add "src/routes/images/\$imageId.tsx"
git commit -m "feat: add image detail page"
```

---

## 最終確認

- [ ] **型チェック**

```bash
npx tsc --noEmit
```

Expected: エラーなし

- [ ] **全テストを実行**

```bash
pnpm test
```

Expected: 全 PASS

- [ ] **ローカル開発サーバーで動作確認**

```bash
pnpm dev
```

確認項目:

- `/` でギャラリーが表示される
- Google でログインできる
- `/upload` が未認証時に `/` にリダイレクトされる
- 画像をアップロードしてギャラリーに表示される
- 画像をクリックして詳細ページが開く
- 自分の画像が削除できる
- 他人の画像には削除ボタンが表示されない
