import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: ["**/routeTree.gen.ts", "**/drizzle/migrations/**", "worker-configuration.d.ts"],
  sortImports: {
    groups: [
      ["side_effect"],
      ["builtin"],
      ["external"],
      ["internal"],
      ["parent"],
      ["sibling"],
      ["index"],
      ["type"],
    ],
  },
  sortTailwindcss: {
    stylesheet: "./src/styles.css",
    attributes: ["className"],
  },
  sortPackageJson: {
    sortScripts: true,
  },
});
