import { describe, expect, it } from "vitest";

import {
  collectDeclaredShapeUtilities,
  findClassTokenViolations,
  findShapeVocabularyUsages,
  findTextViolations,
  firstBlurredShadowLayer,
} from "../../scripts/lint-design-system.mjs";

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
  { syntax: "rounded-sm", rule: "border-radius" },
  { syntax: "rounded-t-xl", rule: "border-radius" },
  { syntax: "rounded-[4px]", rule: "border-radius" },
  { syntax: "shadow-xl", rule: "shadow" },
  { syntax: "shadow-2xl", rule: "shadow" },
  { syntax: "shadow-xs", rule: "shadow" },
  { syntax: "shadow-2xs", rule: "shadow" },
  { syntax: "shadow-inner", rule: "shadow" },
  { syntax: "inset-shadow-xs", rule: "shadow" },
  { syntax: "inset-shadow-2xs", rule: "shadow" },
  { syntax: "inset-shadow-sm", rule: "shadow" },
  { syntax: "inset-shadow-md", rule: "shadow" },
  { syntax: "inset-shadow", rule: "shadow" },
  { syntax: "hover:shadow-xl", rule: "shadow" },
  { syntax: "hover:inset-shadow-sm", rule: "shadow" },
  { syntax: "drop-shadow", rule: "shadow" },
  { syntax: "drop-shadow-md", rule: "shadow" },
  { syntax: "drop-shadow-2xl", rule: "shadow" },
  { syntax: "hover:drop-shadow", rule: "shadow" },
  { syntax: "shadow-[0_4px_6px_var(--x)]", rule: "shadow" },
  { syntax: "shadow-[2px_2px_4px_var(--x)]", rule: "shadow" },
  { syntax: "shadow-[2PX_2PX_4PX_var(--x)]", rule: "shadow" },
  { syntax: "shadow-[2px_2px_calc(4px)_var(--x)]", rule: "shadow" },
  { syntax: "shadow-[2px_2px_var(--blur)_var(--x)]", rule: "shadow" },
  { syntax: "shadow-[inset_0_2px_4px_var(--x)]", rule: "shadow" },
  { syntax: "drop-shadow-[0_4px_6px_var(--x)]", rule: "shadow" },
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
  "rounded",
  "rounded-md",
  "rounded-lg",
  "rounded-none",
  "rounded-full",
  "shadow-sm",
  "shadow-md",
  "shadow-lg",
  "shadow-none",
  "shadow-don",
  "inset-shadow-none",
  "drop-shadow-none",
  "hover:shadow-md",
  "shadow-[var(--shadow-lg)]",
  "shadow-[0_0_0_1px_hsl(var(--sidebar-border))]",
  "shadow-[3px_3px_0_0_var(--x)]",
  "shadow-[2px_2px_var(--x)]",
  "shadow-[0_0_18px_var(--gb-signal-selected)]",
  "shadow-[0_0_calc(18px)_var(--x)]",
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

describe("elevation shadow analysis", () => {
  it.each([
    ["0_10px_15px_var(--x)", "straight-down blur"],
    ["3px_3px_6px_var(--x)", "offset blur"],
    ["inset_0_2px_4px_var(--x)", "inset blur"],
    ["0 4px 6px var(--x)", "space-separated blur"],
    ["0_1px_0_0_var(--x),0_4px_8px_var(--x)", "second layer blurs"],
    ["2PX_2PX_4PX_var(--x)", "uppercase units"],
    ["0_10PX_15Px_var(--x)", "mixed-case units"],
    ["2px_2px_calc(4px)_var(--x)", "calc() in the blur position"],
    ["2px_2px_var(--blur)_var(--x)", "var() in the blur position"],
    ["2px_2px_calc(var(--b)_*_2)_0_var(--x)", "nested calc() blur with spread"],
    ["3px_3px_4px", "blur with no color"],
    ["red_2px_2px_4px", "leading color then blur"],
  ])("reports %s as blurred (%s)", (value) => {
    expect(firstBlurredShadowLayer(value)).not.toBeNull();
  });

  it.each([
    ["var(--shadow-lg)", "token reference"],
    ["inset_var(--shadow-lg)", "inset token reference"],
    ["3px_3px_0_0_var(--x)", "hard offset"],
    ["2px_2px_var(--x)", "hard offset with a var() color and no blur slot"],
    ["0_0_0_1px_hsl(var(--x))", "hairline ring"],
    ["0_0_18px_var(--gb-signal-battle)", "zero-offset glow"],
    ["0_0_calc(18px)_var(--x)", "zero-offset glow with an unresolved blur"],
    ["0_0_18px_rgba(0,_0,_0,_0.5)", "glow with commas inside the color"],
    ["2px_2px_0_0_var(--x),4px_4px_0_0_var(--y)", "two hard layers"],
    ["2PX_2PX_0_0_var(--x)", "uppercase units on a hard offset"],
  ])("accepts %s (%s)", (value) => {
    expect(firstBlurredShadowLayer(value)).toBeNull();
  });

  it("names the offending layer so the message points at it", () => {
    expect(
      firstBlurredShadowLayer("2px_2px_0_0_var(--x),0_8px_16px_var(--y)")
    ).toBe("0_8px_16px_var(--y)");
  });
});

describe("bare shadow class token", () => {
  it.each([
    ['<div className="shadow" />', "className attribute"],
    ['<div className="border shadow rounded-md" />', "among other classes"],
    ['<div className="hover:shadow" />', "behind a variant"],
    ['<div className="shadow!" />', "with the important suffix"],
    ['cn("shadow")', "class helper argument"],
    ['cn(open && "shadow")', "logical class expression"],
    ['clsx({ "shadow": on })', "clsx object key"],
  ])("flags %s (%s)", (source) => {
    expect(findClassTokenViolations(source)).toEqual([
      expect.objectContaining({ rule: "shadow" }),
    ]);
  });

  it.each([
    ['<div className="shadow-md" />', "token-backed step"],
    ['<div className="shadow-none" />', "reset"],
    ['<div className="shadow-[var(--shadow-lg)]" />', "arbitrary token value"],
    ['expect(classes).not.toContain("shadow");', "class-name string fixture"],
    ['const painted = ["shadow", "ring-1"];', "plain array of class names"],
    ["/^(ring|shadow|rounded)/.test(name);", "regular expression literal"],
    ['<div data-slot="shadow" />', "non-class JSX attribute"],
  ])("leaves %s alone (%s)", (source) => {
    expect(findClassTokenViolations(source)).toEqual([]);
  });

  it("is not double-reported by the text rules", () => {
    expect(findTextViolations('<div className="shadow" />')).toEqual([]);
  });
});

describe("shape-language allowance", () => {
  it("does not flag the chamfer vocabulary under the existing rules", () => {
    expect(
      findTextViolations(
        'className="chamfer-cut-lg chamfer-all chamfer-edge-lighting p-4"'
      )
    ).toEqual([]);
  });

  it("leaves the chrome radius vocabulary untouched", () => {
    expect(findTextViolations('className="rounded-md border p-4"')).toEqual([]);
  });

  it("collects chamfer utilities declared as @utility or class rules", () => {
    const declared = collectDeclaredShapeUtilities(
      "@utility chamfer-outer { clip-path: polygon(0 0); }\n" +
        ".chamfer-focus-layer { opacity: 0; }\n" +
        ".rounded-lg { border-radius: 2px; }"
    );

    expect([...declared].sort()).toEqual([
      "chamfer-focus-layer",
      "chamfer-outer",
    ]);
  });

  it("reports chamfer class usages so undeclared names can be resolved", () => {
    expect(
      findShapeVocabularyUsages(
        '<div className="chamfer-cut-md chamfer-outer" />'
      )
    ).toEqual([
      expect.objectContaining({ utility: "chamfer-cut-md", kind: "class" }),
      expect.objectContaining({ utility: "chamfer-outer", kind: "class" }),
    ]);
  });

  it("reads through Tailwind variant and important prefixes", () => {
    expect(
      findShapeVocabularyUsages(
        '<div className="hover:chamfer-outer !chamfer-cut-lg" />'
      )
    ).toEqual([
      expect.objectContaining({ utility: "chamfer-outer" }),
      expect.objectContaining({ utility: "chamfer-cut-lg" }),
    ]);
  });

  it.each([
    ['cn("chamfer-outer", extra)', "cn argument"],
    ['clsx({ "chamfer-outer": on })', "clsx object key"],
    ['cva("base", { variants: { c: { a: "chamfer-outer" } } })', "cva variant"],
    ['cn(on ? "chamfer-outer" : null)', "conditional"],
    ['cn(on && "chamfer-outer")', "logical"],
    ['cn(["chamfer-outer"])', "array"],
    ['<div className={cn("chamfer-outer")} />', "nested in className"],
  ])("reads a static class out of %s (%s)", (source) => {
    expect(findShapeVocabularyUsages(source)).toEqual([
      expect.objectContaining({ utility: "chamfer-outer", kind: "class" }),
    ]);
  });

  it.each([
    ["<div className={`chamfer-cut-${cut}`} />", "template substitution"],
    ['<div className={"chamfer-cut-" + cut} />', "binary concatenation"],
    ['<div className={["chamfer-cut-", cut].join("")} />', "array join"],
    ["<div className={`chamfer-outer ${extra}`} />", "interpolated class list"],
    ["cn(`chamfer-cut-${cut}`)", "inside a class helper"],
  ])("flags %s as dynamic composition (%s)", (source) => {
    expect(findShapeVocabularyUsages(source)).toEqual([
      expect.objectContaining({ kind: "dynamic" }),
    ]);
  });

  it.each([
    ['<div data-slot="chamfer-frame" />', "data-slot JSX attribute"],
    ["<div data-slot={`chamfer-${kind}`} />", "dynamic data-slot value"],
    ['const p = { "data-slot": "chamfer-surface" };', "data-slot object key"],
    ['<div data-testid="chamfer-example" />', "non-class JSX attribute"],
    ['const status = "chamfer-example";', "plain string constant"],
    ['root.querySelector("chamfer-example");', "selector argument"],
    [
      "root.querySelector('[data-slot=\"chamfer-frame\"]');",
      "CSS selector string",
    ],
    ['import { ChamferFrame } from "./chamfer-frame";', "module specifier"],
  ])("does not treat %s as a class reference (%s)", (source) => {
    expect(findShapeVocabularyUsages(source)).toEqual([]);
  });
});
