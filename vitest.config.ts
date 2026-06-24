import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/__tests__/**/*.test.ts",
      "packages/**/__tests__/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@verix/sdk": path.resolve(__dirname, "./packages/sdk/src/index.ts"),
    },
  },
});
