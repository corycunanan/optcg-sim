import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "shared/**/*.test.ts",
      "pipeline/**/*.test.ts",
    ],
    environment: "node",
    globalSetup: ["src/test/database/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@shared": resolve(__dirname, "shared"),
      "@engine": resolve(__dirname, "workers/game/src"),
    },
  },
});
