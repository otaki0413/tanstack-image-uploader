import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { ensureSession } from "@/lib/auth.functions";
import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

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

  const ext = MIME_TO_EXT[file.type] ?? "bin";
  const id = crypto.randomUUID();
  const r2Key = `images/${userId}/${id}.${ext}`;

  // D1 を先に書く（R2 孤児よりゴーストレコードの方が安全）
  await db.insert(images).values({
    id,
    userId,
    r2Key,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  });

  try {
    const buffer = await file.arrayBuffer();
    await bucket.put(r2Key, buffer, {
      httpMetadata: { contentType: file.type },
    });
  } catch (err) {
    // D1 レコードをロールバック
    await db.delete(images).where(eq(images.id, id));
    throw err;
  }

  return { id };
}

export const uploadImage = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
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
  });
