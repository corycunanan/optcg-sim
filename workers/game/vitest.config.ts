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
        "src/engine/*-cli.ts",
        "src/**/*.test.ts",
        "src/**/__tests__/**",
      ],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 75,
        branches: 65,
        functions: 79,
        lines: 80,
        "src/engine/effect-resolver/actions/effects.ts": {
          statements: 90,
          branches: 60,
          functions: 100,
          lines: 90,
        },
        "src/engine/effect-resolver/target-resolver.ts": {
          statements: 45,
          branches: 38,
          functions: 40,
          lines: 52,
        },
        "src/engine/effect-resolver/resume/choice.ts": {
          statements: 55,
          branches: 55,
          functions: 70,
          lines: 55,
        },
      },
    },
  },
});
