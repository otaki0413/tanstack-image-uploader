import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { authClient } from "@/lib/auth/auth-client";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Image Uploader" },
    ],
    links: [{ href: appCss, rel: "stylesheet" }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
  pendingComponent: PendingComponent,
});

function Header() {
  const { data: session } = authClient.useSession();

  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <Link to="/" className="text-xl font-bold">
        Image Uploader
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {session?.user ? (
          <>
            <Link to="/upload" className="hover:underline">
              Upload
            </Link>
            <span className="text-gray-600">{session.user.name}</span>
            <button
              type="button"
              onClick={() => authClient.signOut()}
              className="text-red-600 hover:underline"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: "/" })}
            className="hover:underline"
          >
            Sign in with Google
          </button>
        )}
      </nav>
    </header>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <Header />
        <main className="container mx-auto px-6 py-8">{children}</main>
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}

function NotFoundComponent() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">404</h1>
      <p>ページが見つかりませんでした。</p>
    </div>
  );
}

function ErrorComponent({ error }: { error: unknown }) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-red-600">エラー</h1>
      <p>{error instanceof Error ? error.message : "予期しないエラーが発生しました"}</p>
    </div>
  );
}

function PendingComponent() {
  return <p className="p-4">読み込み中...</p>;
}
