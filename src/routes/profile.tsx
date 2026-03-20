import { Link, createFileRoute } from "@tanstack/react-router";

import { requireAuth } from "@/lib/auth.functions";
import { getProfile } from "@/lib/functions/getProfile";

export const Route = createFileRoute("/profile")({
  beforeLoad: requireAuth,
  loader: async () => getProfile(),
  component: ProfilePage,
});

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ProfilePage() {
  const { user, stats, recentImages } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">プロフィール</h1>

      <div className="mb-8 flex flex-col gap-4 rounded-lg border p-6">
        <div className="flex items-center gap-4">
          {user.image ? (
            <img src={user.image} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-xl text-gray-500">
              {(user.name || user.email).slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-gray-600">{user.email}</p>
          </div>
        </div>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">メール確認</dt>
            <dd>{user.emailVerified ? "済み" : "未確認"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">登録日</dt>
            <dd>{user.createdAt.toLocaleDateString("ja-JP")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">アップロード数</dt>
            <dd>{stats.uploadCount}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-gray-500">アップロード合計サイズ</dt>
            <dd>{formatBytes(stats.totalBytes)}</dd>
          </div>
        </dl>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">最近のアップロード</h2>
        {recentImages.length === 0 ? (
          <p className="text-sm text-gray-500">まだありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentImages.map((img) => (
              <li key={img.id}>
                <Link
                  to="/images/$imageId"
                  params={{ imageId: img.id }}
                  className="text-sm hover:underline"
                >
                  {img.filename}
                </Link>
                <span className="ml-2 text-xs text-gray-400">
                  {img.createdAt.toLocaleString("ja-JP")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
