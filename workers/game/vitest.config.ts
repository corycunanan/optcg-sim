import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/engine/**/*.ts"],
      exclude: [
        "src/engine/schemas/**",
        "src/**/*.test.ts",
        "src/**/__tests__/**",
      ],
      reportsDirectory: "./coverage",
    },
  },
});
