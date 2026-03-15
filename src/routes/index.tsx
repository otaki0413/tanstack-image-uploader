import { Link, createFileRoute } from "@tanstack/react-router";

import { listImages } from "@/lib/functions/listImages";

import type { images } from "@/lib/drizzle/schema";

type Image = typeof images.$inferSelect;

export const Route = createFileRoute("/")({
  loader: () => listImages(),
  component: Gallery,
});

function Gallery() {
  const images = Route.useLoaderData();

  if (images.length === 0) {
    return (
      <p className="mt-20 text-center text-gray-500">
        まだ画像がありません。最初にアップロードしましょう！
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {images.map((image: Image) => (
        <Link key={image.id} to="/images/$imageId" params={{ imageId: image.id }}>
          <img
            src={`/api/images/${image.id}/file`}
            alt={image.filename}
            loading="lazy"
            className="aspect-square w-full rounded-lg object-cover transition-opacity hover:opacity-90"
          />
        </Link>
      ))}
    </div>
  );
}
