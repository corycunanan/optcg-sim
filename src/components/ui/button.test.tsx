// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

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
});
