import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { createAuth } from "@/lib/auth";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const auth = createAuth();
  const headers = getRequestHeaders();
  return auth.api.getSession({ headers });
});

/** `beforeLoad` 用。未ログインなら `/` へリダイレクト。 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) throw redirect({ to: "/" });
}

export const ensureSession = createServerFn({ method: "GET" }).handler(async () => {
  const auth = createAuth();
  const headers = getRequestHeaders();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error("Unauthorized");
  return session;
});
