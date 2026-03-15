import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

export async function getImageHandler({ db, imageId }: { db: Database; imageId: string }) {
  const rows = await db.select().from(images).where(eq(images.id, imageId));
  return rows[0] ?? null;
}

// Server function wrapper - imageId will be passed as a query parameter
// The API route handler will call this with the imageId from the URL
export const getImage = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  // This handler will be called from API routes that pass imageId as a query param
  // For now, returning null as a placeholder
  void db;
  return null;
});
