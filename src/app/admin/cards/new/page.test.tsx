// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));

vi.mock("@/lib/api-client", () => ({
  apiPost: mocks.apiPost,
}));

import NewCardPage from "./page";

function colorChip(color: string) {
  return screen.getByRole("button", { name: color });
}

beforeEach(() => {
  mocks.apiPost.mockReset();
  mocks.apiPost.mockResolvedValue({ id: "OP16-002" });
});

afterEach(cleanup);

describe("NewCardPage color selector", () => {
  it("exposes selection state to assistive tech", () => {
    render(<NewCardPage />);

    for (const color of ["Red", "Blue", "Green", "Purple", "Black", "Yellow"]) {
      expect(colorChip(color).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("toggles a color on and back off", async () => {
    const user = userEvent.setup();
    render(<NewCardPage />);

    await user.click(colorChip("Yellow"));
    expect(colorChip("Yellow").getAttribute("aria-pressed")).toBe("true");
    // The pressed chip swaps its swatch for a check rather than relying on fill.
    expect(
      colorChip("Yellow").querySelector('span[aria-hidden="true"].size-3')
    ).toBeNull();

    await user.click(colorChip("Yellow"));
    expect(colorChip("Yellow").getAttribute("aria-pressed")).toBe("false");
    expect(
      colorChip("Yellow").querySelector('span[aria-hidden="true"].size-3')
    ).not.toBeNull();
  });

  it("sends the selected colors and keeps the required-color guard", async () => {
    const user = userEvent.setup();
    render(<NewCardPage />);

    await user.click(screen.getByRole("button", { name: "Create Card" }));
    expect(mocks.apiPost).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Card ID, name, type, and at least one color are required."
      )
    ).toBeDefined();

    await user.type(screen.getByLabelText(/Card ID/), "OP16-002");
    await user.type(screen.getByLabelText(/^Name/), "Nami");
    await user.click(colorChip("Blue"));
    await user.click(colorChip("Green"));
    await user.type(screen.getByLabelText(/Block/), "4");

    await user.click(screen.getByRole("button", { name: "Create Card" }));

    expect(mocks.apiPost).toHaveBeenCalledTimes(1);
    expect(mocks.apiPost.mock.calls[0][1]).toMatchObject({
      id: "OP16-002",
      name: "Nami",
      color: ["Blue", "Green"],
    });
  });
});
