import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";

import { getDb, type Database } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

export async function listImagesHandler({ db }: { db: Database }) {
  return db.select().from(images).orderBy(desc(images.createdAt)).limit(50);
}

export const listImages = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  return listImagesHandler({ db });
});
