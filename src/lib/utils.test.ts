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
});
