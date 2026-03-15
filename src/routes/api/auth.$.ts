import { createFileRoute } from "@tanstack/react-router";

import { createAuth } from "@/lib/auth";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const auth = createAuth();
        return auth.handler(request);
      },
      POST: async ({ request }: { request: Request }) => {
        const auth = createAuth();
        return auth.handler(request);
      },
    },
  },
});
