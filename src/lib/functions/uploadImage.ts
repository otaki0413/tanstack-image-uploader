import { createServerFn } from "@tanstack/react-start";

import { ensureSession } from "@/lib/auth.functions";
import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

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

// Server function wrapper - file will be passed as FormData from the route handler
// The API route handler will call this with the file from the request
export const uploadImage = createServerFn({ method: "POST" }).handler(async () => {
  const session = await ensureSession();
  const db = getDb();
  // This handler will be called from API routes that pass file data
  // For now, returning null as a placeholder
  void session;
  void db;
  return null;
});
