import { describe, expect, it } from "vitest";
import { shouldFailForUnavailableDatabase } from "./global-setup";

describe("shouldFailForUnavailableDatabase", () => {
  it("fails when running in GitHub Actions", () => {
    expect(
      shouldFailForUnavailableDatabase({
        CI: "true",
        GITHUB_ACTIONS: "true",
      })
    ).toBe(true);
  });

  it("skips when only generic CI is set", () => {
    expect(shouldFailForUnavailableDatabase({ CI: "true" })).toBe(false);
  });

  it("skips when no CI signal is set", () => {
    expect(shouldFailForUnavailableDatabase({})).toBe(false);
  });

  it("skips when GitHub Actions is explicitly false", () => {
    expect(shouldFailForUnavailableDatabase({ GITHUB_ACTIONS: "false" })).toBe(
      false
    );
  });
});
