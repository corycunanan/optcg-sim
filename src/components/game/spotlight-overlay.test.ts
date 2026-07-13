import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("SpotlightOverlay accessibility contract", () => {
  it("uses the focus-trapping Dialog primitive for the spotlight view", () => {
    const source = readFileSync(
      new URL("./spotlight-overlay.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain("<Dialog");
    expect(source).toContain("<DialogContent");
    expect(source).toContain("<DialogTitle");
    expect(source).not.toContain('aria-modal="true"');
  });
});
