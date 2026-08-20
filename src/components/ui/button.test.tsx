// @vitest-environment jsdom

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

  it.each(["default", "outline", "destructive", "gold"] as const)(
    "casts and lifts on the %s variant",
    (variant) => {
      render(<Button variant={variant}>{variant}</Button>);

      const button = screen.getByRole("button", { name: variant });
      for (const className of RAISED_CLASSES) {
        expect(button.classList.contains(className)).toBe(true);
      }
    }
  );

  it.each(["ghost", "link"] as const)(
    "keeps the %s variant flat",
    (variant) => {
      render(<Button variant={variant}>{variant}</Button>);

      const button = screen.getByRole("button", { name: variant });
      for (const className of RAISED_CLASSES) {
        expect(button.classList.contains(className)).toBe(false);
      }
    }
  );

  it.each(["icon", "icon-sm"] as const)(
    "keeps the %s size flat even on a raised variant",
    (size) => {
      render(
        <Button variant="gold" size={size}>
          {size}
        </Button>
      );

      const button = screen.getByRole("button", { name: size });
      for (const className of RAISED_CLASSES) {
        expect(button.classList.contains(className)).toBe(false);
      }
    }
  );

  it("transitions the lift and the cast alongside the color properties", () => {
    render(<Button>transition</Button>);

    const button = screen.getByRole("button", { name: "transition" });
    expect(
      button.classList.contains(
        "transition-[color,background-color,border-color,translate,box-shadow]"
      )
    ).toBe(true);
  });

  it("drops the cast when elevation is flat", () => {
    render(<Button elevation="flat">flat</Button>);

    const button = screen.getByRole("button", { name: "flat" });
    expect(button.dataset.elevation).toBe("flat");
    for (const className of RAISED_CLASSES) {
      expect(button.classList.contains(className)).toBe(false);
    }
  });
});
