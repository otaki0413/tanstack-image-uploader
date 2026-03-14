import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: ["**/routeTree.gen.ts"],
  plugins: ["react", "react-perf", "import", "jsx-a11y", "promise"],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  env: {
    node: true,
    browser: true,
  },
  overrides: [
    {
      files: ["src/router.tsx", "*.config.ts"],
      rules: {
        "no-default-export": "off",
      },
    },
  ],
});
