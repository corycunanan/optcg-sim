import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readComponent(name: string) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

describe("modal chrome contracts", () => {
  it("uses one overlay treatment without backdrop blur", () => {
    for (const name of ["dialog.tsx", "alert-dialog.tsx", "sheet.tsx"]) {
      const source = readComponent(name);

      expect(source).toContain("bg-overlay");
      expect(source).not.toContain("backdrop-blur");
    }
  });

  it("keeps modal surfaces on the shared perimeter family", () => {
    for (const name of ["dialog.tsx", "alert-dialog.tsx", "sheet.tsx"]) {
      const source = readComponent(name);

      expect(source).toContain("border border-border bg-popover");
      expect(source).toContain("shadow-lg");
    }
  });

  it("keeps command radii on scale without important overrides", () => {
    const source = readComponent("command.tsx");

    expect(source).not.toContain(["rounded", "xl"].join("-"));
    expect(source).not.toMatch(new RegExp("rounded-" + "[^\\s\\\"]+!"));
  });
});
