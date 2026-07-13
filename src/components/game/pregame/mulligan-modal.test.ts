import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("MulliganModal accessibility contract", () => {
  it("uses the focus-trapping Dialog primitive and cannot be dismissed", () => {
    const source = readFileSync(
      new URL("./mulligan-modal.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain("<Dialog open>");
    expect(source).toContain(
      "onEscapeKeyDown={(event) => event.preventDefault()}"
    );
    expect(source).toContain(
      "onInteractOutside={(event) => event.preventDefault()}"
    );
    expect(source).not.toContain('aria-modal="true"');
  });
});
