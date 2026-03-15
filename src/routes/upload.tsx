import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { getSession } from "@/lib/auth.functions";
import { uploadImage } from "@/lib/functions/uploadImage";

export const Route = createFileRoute("/upload")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/" });
  },
  component: UploadPage,
});

function UploadPage() {
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setStatus("uploading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      await uploadImage({ data: formData });
      router.navigate({ to: "/" });
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-bold">画像をアップロード</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          required
          className="rounded border p-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={status === "uploading"}
          className="rounded bg-blue-600 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {status === "uploading" ? "アップロード中..." : "アップロード"}
        </button>
      </form>
    </div>
  );
}
