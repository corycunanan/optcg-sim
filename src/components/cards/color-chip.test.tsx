// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorChip, ColorChipToggle } from "./color-chip";

afterEach(cleanup);

function swatch(chip: HTMLElement) {
  return chip.querySelector<HTMLElement>('span[aria-hidden="true"].size-3');
}

describe("ColorChip", () => {
  it("names the color once and keeps the swatch decorative", () => {
    render(<ColorChip color="Black" />);

    const chip = screen.getByRole("img", { name: "Black" });
    expect(chip.textContent).toBe("Black");
    expect(swatch(chip)!.className).toContain("bg-card-black");
  });

  it("rings every swatch with the same-hue keyline", () => {
    render(
      <>
        <ColorChip color="Red" />
        <ColorChip color="Yellow" />
      </>
    );

    for (const [color, keyline] of [
      ["Red", "border-card-red-border"],
      ["Yellow", "border-card-yellow-border"],
    ]) {
      const chip = screen.getByRole("img", { name: color });
      expect(swatch(chip)!.className).toContain(keyline);
    }
  });

  it("takes a fuller accessible name where context needs one", () => {
    render(<ColorChip color="Green" accessibleLabel="Green deck color" />);

    expect(screen.getByRole("img", { name: "Green deck color" })).toBeDefined();
    expect(screen.queryByRole("img", { name: "Green" })).toBeNull();
  });

  it("falls back to a neutral swatch for a color outside the palette", () => {
    render(<ColorChip color="Rainbow" />);

    const chip = screen.getByRole("img", { name: "Rainbow" });
    expect(swatch(chip)!.className).toContain("bg-surface-3");
  });
});

describe("ColorChipToggle", () => {
  it("reports selection through aria-pressed and the next value", async () => {
    const user = userEvent.setup();
    const onPressedChange = vi.fn();
    render(
      <ColorChipToggle
        color="Blue"
        pressed={false}
        onPressedChange={onPressedChange}
      />
    );

    const chip = screen.getByRole("button", { name: "Blue" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    await user.click(chip);
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it("swaps the swatch for a check without reflowing the chip", () => {
    const { rerender } = render(
      <ColorChipToggle color="Purple" pressed={false} onPressedChange={vi.fn()} />
    );

    const resting = screen.getByRole("button", { name: "Purple" });
    expect(swatch(resting)).not.toBeNull();
    const restingLeading = resting.firstElementChild!.className;

    rerender(
      <ColorChipToggle color="Purple" pressed onPressedChange={vi.fn()} />
    );

    const pressed = screen.getByRole("button", { name: "Purple" });
    // Both states lead with a 12px slot, so the row width never jumps.
    expect(restingLeading).toContain("size-3");
    expect(pressed.firstElementChild!.getAttribute("class")).toContain("size-3");
    expect(swatch(pressed)).toBeNull();
    // Selection is carried by the check, not by the fill alone.
    expect(pressed.className).toContain("bg-card-purple");
  });
});
