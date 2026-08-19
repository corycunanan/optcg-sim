// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { toast } from "sonner";

import { Toaster } from "./sonner";

afterEach(() => {
  toast.dismiss();
  cleanup();
});

describe("Toaster", () => {
  it("applies the hard medium shadow to rendered toasts", async () => {
    render(<Toaster />);

    act(() => {
      toast("Hard-shadow toast");
    });

    const toastElement = (await screen.findByText("Hard-shadow toast")).closest(
      "[data-sonner-toast]"
    );

    expect(toastElement).not.toBeNull();
    expect(toastElement?.classList.contains("shadow-[var(--shadow-md)]!")).toBe(
      true
    );
    expect(toastElement?.classList.contains("focus-visible:ring-2")).toBe(true);
    expect(
      toastElement?.classList.contains("focus-visible:ring-border-focus")
    ).toBe(true);
  });
});
