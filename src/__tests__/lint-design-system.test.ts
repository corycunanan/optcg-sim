import { describe, expect, it } from "vitest";

import { findTextViolations } from "../../scripts/lint-design-system.mjs";

const SHOULD_FLAG = [
  { syntax: "text-[10px]", rule: "font-size" },
  { syntax: "text-[length:10px]", rule: "font-size" },
  { syntax: "[font-size:10px]", rule: "font-size" },
  { syntax: "text-[#fff]", rule: "raw-color" },
  { syntax: "text-[color:#fff]", rule: "raw-color" },
  { syntax: "bg-[oklch(55%_0.2_25)]", rule: "raw-color" },
  { syntax: "text-[color:oklch(55%_0.2_25)]", rule: "raw-color" },
  { syntax: "[color:#fff]", rule: "raw-color" },
  { syntax: "[border-color:oklch(55%_0.2_25)]", rule: "raw-color" },
  { syntax: "p-2.5", rule: "spacing" },
  { syntax: "p-[7px]", rule: "spacing" },
  { syntax: "gap-x-0.5", rule: "spacing" },
  { syntax: "space-y-[7px]", rule: "spacing" },
  { syntax: "m-[calc(100%-1rem)]", rule: "spacing" },
  { syntax: "top-1.5", rule: "spacing" },
  { syntax: "right-[7px]", rule: "spacing" },
  { syntax: "bottom-2.5", rule: "spacing" },
  { syntax: "left-[var(--offset)]", rule: "spacing" },
  { syntax: "inset-1.5", rule: "spacing" },
  { syntax: "inset-x-[7px]", rule: "spacing" },
  { syntax: "inset-y-0.5", rule: "spacing" },
  { syntax: "start-2.5", rule: "spacing" },
  { syntax: "end-[7px]", rule: "spacing" },
  { syntax: "translate-x-0.5", rule: "spacing" },
  { syntax: "hover:-translate-y-[7px]", rule: "spacing" },
] as const;

const SHOULD_PASS = [
  "text-xs",
  "text-[var(--text-brand)]",
  "text-[color:var(--text-brand)]",
  "[color:var(--text-brand)]",
  "w-[42px]",
  "h-[42px]",
  "size-[42px]",
  "grid-cols-[1fr_2fr]",
  "bg-[var(--x)]",
  "p-1",
  "top-16",
  "inset-y-0",
  "-translate-x-2",
] as const;

describe("design-system text rules", () => {
  it.each(SHOULD_FLAG)("flags $syntax as $rule", ({ syntax, rule }) => {
    expect(findTextViolations(`className=\"${syntax}\"`)).toEqual([
      expect.objectContaining({ rule }),
    ]);
  });

  it.each(SHOULD_PASS)("allows %s", (syntax) => {
    expect(findTextViolations(`className=\"${syntax}\"`)).toEqual([]);
  });

  it("honors the spacing path exemption without disabling other rules", () => {
    expect(
      findTextViolations('className="p-[7px] text-[10px]"', {
        includeSpacing: false,
      })
    ).toEqual([expect.objectContaining({ rule: "font-size" })]);
  });

  it.each([
    '// className="p-[7px] text-[10px] text-[#fff]"',
    '/* className="top-1.5 text-[length:10px] [color:#fff]" */',
  ])("ignores commented source: %s", (source) => {
    expect(findTextViolations(source)).toEqual([]);
  });
});
