// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "./button";

// Vitest runs without globals here, so testing-library's auto-cleanup never
// registers and renders would otherwise pile up under one document.
afterEach(cleanup);

describe("Button", () => {
  it.each(["default", "lg"] as const)(
    "uses semibold text for the %s size",
    (size) => {
      render(<Button size={size}>{size}</Button>);

      const button = screen.getByRole("button", { name: size });
      expect(button.classList.contains("font-semibold")).toBe(true);
      expect(button.classList.contains("font-medium")).toBe(false);
    }
  );

  it.each(["sm", "icon", "icon-sm"] as const)(
    "keeps medium text for the %s size",
    (size) => {
      render(<Button size={size}>{size}</Button>);

      const button = screen.getByRole("button", { name: size });
      expect(button.classList.contains("font-medium")).toBe(true);
      expect(button.classList.contains("font-semibold")).toBe(false);
    }
  );

  const RAISED_CLASSES = [
    "shadow-sm",
    "hover:shadow-md",
    "motion-safe:hover:lift",
  ];

  const RAISED_VARIANTS = ["default", "outline", "destructive", "gold"] as const;
  const FLAT_VARIANTS = ["ghost", "link"] as const;
  const RAISED_SIZES = ["default", "sm", "lg"] as const;
  const ICON_SIZES = ["icon", "icon-sm"] as const;

  function elevationOf(name: string) {
    const button = screen.getByRole("button", { name });
    return RAISED_CLASSES.every((c) => button.classList.contains(c))
      ? "raised"
      : RAISED_CLASSES.every((c) => !button.classList.contains(c))
        ? "flat"
        : "mixed";
  }

  // The register is a compound of variant AND size, so the matrix is pinned in
  // full rather than one axis at a time: a regression that drops the size half
  // of the compound key passes any variant-only assertion.
  describe("elevation matrix", () => {
    const raisedCases = RAISED_VARIANTS.flatMap((variant) =>
      RAISED_SIZES.map((size) => [variant, size] as const)
    );

    it.each(raisedCases)(
      "casts and lifts on variant=%s size=%s",
      (variant, size) => {
        const name = `${variant}-${size}`;
        render(
          <Button variant={variant} size={size}>
            {name}
          </Button>
        );

        expect(elevationOf(name)).toBe("raised");
      }
    );

    const flatVariantCases = FLAT_VARIANTS.flatMap((variant) =>
      RAISED_SIZES.map((size) => [variant, size] as const)
    );

    it.each(flatVariantCases)(
      "stays flat on variant=%s size=%s",
      (variant, size) => {
        const name = `${variant}-${size}`;
        render(
          <Button variant={variant} size={size}>
            {name}
          </Button>
        );

        expect(elevationOf(name)).toBe("flat");
      }
    );

    // Icon exclusion is by size, so it must hold across variants that are
    // otherwise on the register — not just the one variant a spot check picks.
    const iconCases = [...RAISED_VARIANTS, ...FLAT_VARIANTS].flatMap((variant) =>
      ICON_SIZES.map((size) => [variant, size] as const)
    );

    it.each(iconCases)(
      "stays flat on variant=%s size=%s regardless of variant",
      (variant, size) => {
        const name = `${variant}-${size}`;
        render(
          <Button variant={variant} size={size}>
            {name}
          </Button>
        );

        expect(elevationOf(name)).toBe("flat");
      }
    );

    it.each(raisedCases)(
      "drops the cast for variant=%s size=%s when elevation is flat",
      (variant, size) => {
        const name = `${variant}-${size}-flat`;
        render(
          <Button variant={variant} size={size} elevation="flat">
            {name}
          </Button>
        );

        expect(screen.getByRole("button", { name }).dataset.elevation).toBe(
          "flat"
        );
        expect(elevationOf(name)).toBe("flat");
      }
    );
  });

  it("marks a raised button with data-elevation", () => {
    render(<Button>raised</Button>);

    expect(screen.getByRole("button", { name: "raised" }).dataset.elevation).toBe(
      "raised"
    );
  });

  it("transitions the lift and the cast alongside the color properties", () => {
    render(<Button>transition</Button>);

    const button = screen.getByRole("button", { name: "transition" });
    expect(
      button.classList.contains(
        "transition-[color,background-color,border-color,translate,box-shadow]"
      )
    ).toBe(true);
  });
});

// The lift distance lives in CSS, so it is asserted at its source: jsdom never
// loads globals.css, and a class-name assertion alone would still pass if the
// token were retuned to some other value.
describe("the lift token", () => {
  const GLOBALS_CSS = readFileSync(
    resolve(process.cwd(), "src/app/globals.css"),
    "utf8"
  );

  it("declares the primitive at -2px", () => {
    expect(GLOBALS_CSS).toMatch(/--lift-elevation-hover:\s*-2px;/);
  });

  it("matches the resting shadow offset it leaves behind", () => {
    const lift = GLOBALS_CSS.match(/--lift-elevation-hover:\s*(-?\d+)px;/)?.[1];
    const restOffset = GLOBALS_CSS.match(
      /--shadow-elevation-offset-sm:\s*(\d+)px;/
    )?.[1];

    expect(lift).toBeDefined();
    expect(restOffset).toBeDefined();
    expect(Math.abs(Number(lift))).toBe(Number(restOffset));
  });

  it("routes the primitive through the semantic role into the utility", () => {
    expect(GLOBALS_CSS).toMatch(
      /--lift-hover:\s*var\(--lift-elevation-hover\);/
    );
    expect(GLOBALS_CSS).toMatch(
      /@utility lift \{\s*translate:\s*0 var\(--lift-hover\);\s*\}/
    );
  });
});
