import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

export async function getImageHandler({ db, imageId }: { db: Database; imageId: string }) {
  const rows = await db.select().from(images).where(eq(images.id, imageId));
  return rows[0] ?? null;
}

export const getImage = createServerFn({ method: "GET" })
  .inputValidator((data: { imageId: string }) => {
    if (!data.imageId || typeof data.imageId !== "string") {
      throw new Error("imageId is required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const db = getDb();
    return getImageHandler({ db, imageId: data.imageId });
  });
