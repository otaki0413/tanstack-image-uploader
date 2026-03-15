import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { ensureSession } from "@/lib/auth.functions";
import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

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
  .inputValidator((data: { imageId: string }) => data)
  .handler(async ({ data }) => {
    const session = await ensureSession();
    const db = getDb();
    // R2 bucket is not accessible from server functions directly; only from API routes
    // Perform DB-only deletion and return for now; R2 cleanup handled separately
    const rows = await db.select().from(images).where(eq(images.id, data.imageId));
    const image = rows[0];
    if (!image) throw new Error("Not found");
    if (image.userId !== session.user.id) throw new Error("Forbidden");
    await db.delete(images).where(eq(images.id, image.id));
  });
