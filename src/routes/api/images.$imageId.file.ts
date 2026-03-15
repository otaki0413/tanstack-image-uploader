import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/drizzle/db";
import { images } from "@/lib/drizzle/schema";

export const Route = createFileRoute("/api/images/$imageId/file")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { imageId: string } }) => {
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
    },
  },
});
