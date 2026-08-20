import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("joins conditional class values", () => {
    expect(cn("card", false && "hidden", { selected: true })).toBe(
      "card selected"
    );
  });

  it("keeps the last conflicting Tailwind class", () => {
    expect(cn("px-2 text-sm", "px-4 text-lg")).toBe("px-4 text-lg");
  });

  // `lift` is declared in globals.css, so tailwind-merge only resolves it
  // against `translate-y-*` because utils.ts registers it in that class group.
  // Without the registration both classes survive and stylesheet order — not
  // the call site — decides which lift wins.
  it("lets a later translate override drop the lift utility", () => {
    expect(cn("hover:lift", "hover:translate-y-0")).toBe("hover:translate-y-0");
    expect(cn("motion-safe:hover:lift", "motion-safe:hover:translate-y-0")).toBe(
      "motion-safe:hover:translate-y-0"
    );
  });

  it("lets the lift utility override an earlier translate", () => {
    expect(cn("hover:-translate-y-1", "hover:lift")).toBe("hover:lift");
  });

  it("does not let the lift collide with an unrelated axis or property", () => {
    expect(cn("hover:lift", "hover:translate-x-2")).toBe(
      "hover:lift hover:translate-x-2"
    );
    expect(cn("hover:lift", "hover:shadow-md")).toBe(
      "hover:lift hover:shadow-md"
    );
  });
});
