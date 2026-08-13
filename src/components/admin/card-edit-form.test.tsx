// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiPatch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
    back: mocks.back,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    status = 500;
  },
  apiPatch: mocks.apiPatch,
}));

import { CardEditForm } from "./card-edit-form";

const CARD = {
  id: "OP16-001",
  originSet: "OP16",
  name: "Monkey D. Luffy",
  color: ["Red"],
  type: "Leader",
  cost: null,
  power: 5000,
  counter: null,
  life: 5,
  attribute: ["Strike"],
  traits: ["Straw Hat Crew"],
  rarity: "L",
  effectText: "",
  triggerText: null,
  imageUrl: "https://cdn.example/op16-001.png",
  blockNumber: 4,
  banStatus: "LEGAL",
  isReprint: false,
};

function colorChip(color: string) {
  return screen.getByRole("button", { name: color });
}

beforeAll(() => {
  // The reprint Checkbox measures itself with a ResizeObserver, which jsdom
  // does not implement. These cases assert form state, not layout.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  mocks.apiPatch.mockReset();
  mocks.apiPatch.mockResolvedValue({});
});

afterEach(cleanup);

describe("CardEditForm color selector", () => {
  it("seeds the shared color chips from the card and names their state", () => {
    render(<CardEditForm card={CARD} />);

    expect(colorChip("Red").getAttribute("aria-pressed")).toBe("true");
    expect(colorChip("Blue").getAttribute("aria-pressed")).toBe("false");
    // Selection never rests on the fill alone: the leading 12px slot carries a
    // check when pressed and a swatch when not.
    expect(
      colorChip("Blue").querySelector('span[aria-hidden="true"].size-3')
    ).not.toBeNull();
    expect(
      colorChip("Red").querySelector('span[aria-hidden="true"].size-3')
    ).toBeNull();
  });

  it("toggles a color on and off in the submitted payload", async () => {
    const user = userEvent.setup();
    render(<CardEditForm card={CARD} />);

    await user.click(colorChip("Blue"));
    expect(colorChip("Blue").getAttribute("aria-pressed")).toBe("true");

    await user.click(colorChip("Red"));
    expect(colorChip("Red").getAttribute("aria-pressed")).toBe("false");

    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(mocks.apiPatch).toHaveBeenCalledTimes(1);
    expect(mocks.apiPatch.mock.calls[0][0]).toBe("/api/cards/OP16-001");
    expect(mocks.apiPatch.mock.calls[0][1]).toMatchObject({
      name: "Monkey D. Luffy",
      type: "Leader",
      color: ["Blue"],
      blockNumber: 4,
    });
  });

  it("still refuses a save with no color selected", async () => {
    const user = userEvent.setup();
    render(<CardEditForm card={CARD} />);

    await user.click(colorChip("Red"));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(mocks.apiPatch).not.toHaveBeenCalled();
    expect(
      screen.getByText("Name, type, and at least one color are required.")
    ).toBeDefined();
  });
});
