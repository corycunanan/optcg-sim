// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckFiltersDialog } from "./deck-filters-dialog";

afterEach(cleanup);

describe("DeckFiltersDialog", () => {
  it("wires the dialog to its generated description", () => {
    render(
      <DeckFiltersDialog
        open
        onOpenChange={vi.fn()}
        selectedColors={[]}
        onApply={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    const description = screen.getByText(
      "Nothing selected — every deck is in view."
    );

    expect(dialog.getAttribute("aria-describedby")).toBe(description.id);
  });
});
