import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      "cloudflare:workers": new URL("./src/test/mocks/cloudflare.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    passWithNoTests: true,
  },
});
