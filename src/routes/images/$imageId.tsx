import { Link, createFileRoute, notFound, useRouter } from "@tanstack/react-router";

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
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="mb-4 block text-sm text-gray-500 hover:underline">
        ← ギャラリーに戻る
      </Link>
      <img
        src={`/api/images/${image.id}/file`}
        alt={image.filename}
        className="mb-4 w-full rounded-lg"
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
