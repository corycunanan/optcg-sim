import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["pipeline/**/*.test.ts"],
  },
});
