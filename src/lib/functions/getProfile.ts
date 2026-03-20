import { createServerFn } from "@tanstack/react-start";
import { count, desc, eq, sum } from "drizzle-orm";

import { ensureSession } from "@/lib/auth.functions";
import { getDb, type Database } from "@/lib/drizzle/db";
import { images, users } from "@/lib/drizzle/schema";

export async function getProfileHandler({ db, userId }: { db: Database; userId: string }) {
  const userRows = await db.select().from(users).where(eq(users.id, userId));
  const user = userRows[0] ?? null;
  if (!user) return null;

  const [statsRow] = await db
    .select({
      uploadCount: count(),
      totalBytes: sum(images.size),
    })
    .from(images)
    .where(eq(images.userId, userId));

  const recentImages = await db
    .select({
      id: images.id,
      filename: images.filename,
      createdAt: images.createdAt,
    })
    .from(images)
    .where(eq(images.userId, userId))
    .orderBy(desc(images.createdAt))
    .limit(10);

  return {
    user,
    stats: {
      uploadCount: Number(statsRow?.uploadCount ?? 0),
      totalBytes: Number(statsRow?.totalBytes ?? 0),
    },
    recentImages,
  };
}

export const getProfile = createServerFn({ method: "GET" }).handler(async () => {
  const session = await ensureSession();
  const db = getDb();
  const profile = await getProfileHandler({ db, userId: session.user.id });
  if (!profile) throw new Error("User not found");
  return profile;
});
