// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import type { CardFilterDraft } from "@/lib/cards/browser-params";
import { CardFiltersDialog } from "./card-filters-dialog";

beforeAll(() => {
  // cmdk measures its list with a ResizeObserver and scrolls the active item
  // into view; jsdom implements neither. These cases assert draft behavior, not
  // layout, so no-op shims are enough to let the list mount.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const sets = [
  { setLabel: "OP15", setName: "A Fist of Divine Speed", packId: "569115" },
  { setLabel: "OP16", setName: "Legacy of the Master", packId: "569116" },
];

const noFilters = {
  q: "",
  color: "",
  type: "",
  set: "OP16",
  block: "",
  originOnly: "",
};

function renderDialog(filters: Partial<typeof noFilters> = {}) {
  const onApply = vi.fn<(draft: CardFilterDraft) => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const view = render(
    <CardFiltersDialog
      open
      onOpenChange={onOpenChange}
      sets={sets}
      filters={{ ...noFilters, ...filters }}
      onApply={onApply}
    />
  );
  return { onApply, onOpenChange, view };
}

function chip(name: string) {
  return screen.getByRole("button", { name });
}

function pressed(name: string) {
  return chip(name).getAttribute("aria-pressed");
}

function section(label: string) {
  return screen.getByRole("region", { name: label });
}

describe("CardFiltersDialog", () => {
  it("wires the dialog to its generated description", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    const description = screen.getByText(
      "1 filter selected. Nothing changes until you apply."
    );

    expect(dialog.getAttribute("aria-describedby")).toBe(description.id);
  });

  it("seeds the draft from the applied filters", () => {
    renderDialog({ color: "Red", type: "Leader", originOnly: "true" });

    expect(pressed("Red")).toBe("true");
    expect(pressed("Blue")).toBe("false");
    expect(pressed("Leader")).toBe("true");
    expect(pressed("Origin printings only")).toBe("true");
    expect(
      within(section("Set")).getByRole("option", { name: /OP16/ })
    ).toBeDefined();
  });

  it("keeps chip toggles in the draft until Apply commits them once", async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog();

    await user.click(chip("Red"));
    await user.click(chip("Green"));
    await user.click(chip("Character"));
    await user.click(chip("3"));
    await user.click(chip("Origin printings only"));

    expect(pressed("Red")).toBe("true");
    expect(onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Apply Filters" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith({
      colors: ["Red", "Green"],
      types: ["Character"],
      blocks: ["3"],
      sets: ["OP16"],
      originOnly: true,
    });
  });

  it("toggles a chip back off without committing", async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog({ color: "Red" });

    await user.click(chip("Red"));
    expect(pressed("Red")).toBe("false");

    await user.click(screen.getByRole("button", { name: "Apply Filters" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ colors: [] })
    );
  });

  it("counts every value in the draft, sets included", async () => {
    const user = userEvent.setup();
    renderDialog({ set: "" });

    expect(
      screen.getByText("Nothing selected — the whole database is in view.")
    ).toBeDefined();

    await user.click(chip("Red"));
    expect(
      screen.getByText("1 filter selected. Nothing changes until you apply.")
    ).toBeDefined();

    await user.click(
      within(section("Set")).getByRole("option", { name: /OP16/ })
    );
    expect(
      screen.getByText("2 filters selected. Nothing changes until you apply.")
    ).toBeDefined();
  });

  it("selects and clears sets inside the same draft", async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog();
    const setSection = section("Set");

    expect(within(setSection).getByText("1 selected")).toBeDefined();

    await user.click(within(setSection).getByRole("option", { name: /OP15/ }));
    expect(within(setSection).getByText("2 selected")).toBeDefined();

    await user.click(
      within(setSection).getByRole("button", { name: "Clear sets" })
    );
    expect(within(setSection).getByText("All sets")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Apply Filters" }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ sets: [] })
    );
  });

  it("keeps option rows free of nested controls and names their state", () => {
    renderDialog({ set: "OP16" });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(sets.length);
    for (const option of options) {
      // A control inside an option row lands in the tab order between the
      // list and the footer, and gives AT conflicting semantics.
      expect(
        option.querySelectorAll(
          'a[href], button, input, select, textarea, [contenteditable], [tabindex]:not([tabindex="-1"])'
        )
      ).toHaveLength(0);
    }

    // The check mark is decorative, so selection is carried by the row's name.
    expect(screen.getByRole("option", { name: /OP16.*selected/ })).toBeDefined();
    expect(screen.queryByRole("option", { name: /OP15.*selected/ })).toBeNull();
  });

  it("filters the set list and explains an empty search", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(
      screen.getByPlaceholderText("Search sets..."),
      "Divine Speed"
    );

    expect(screen.getByRole("option", { name: /OP15/ })).toBeDefined();
    expect(screen.queryByRole("option", { name: /OP16/ })).toBeNull();

    await user.clear(screen.getByPlaceholderText("Search sets..."));
    await user.type(screen.getByPlaceholderText("Search sets..."), "zzz");

    expect(screen.getByText("No sets match that search.")).toBeDefined();
  });

  it("clears every filter in the draft without navigating", async () => {
    const user = userEvent.setup();
    const { onApply } = renderDialog({
      color: "Red",
      type: "Leader",
      block: "1",
      originOnly: "true",
    });

    const clearAll = screen.getByRole<HTMLButtonElement>("button", {
      name: "Clear all",
    });
    expect(clearAll.disabled).toBe(false);

    await user.click(clearAll);

    expect(pressed("Red")).toBe("false");
    expect(pressed("Leader")).toBe("false");
    expect(pressed("Origin printings only")).toBe("false");
    expect(within(section("Set")).getByText("All sets")).toBeDefined();
    expect(clearAll.disabled).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });

  it("discards the draft on cancel", async () => {
    const user = userEvent.setup();
    const { onApply, onOpenChange } = renderDialog();

    await user.click(chip("Red"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("discards the draft on Escape", async () => {
    const user = userEvent.setup();
    const { onApply, onOpenChange } = renderDialog();

    await user.click(chip("Red"));
    await user.keyboard("{Escape}");

    expect(onApply).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("starts from the applied filters again on the next open", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    const props = {
      sets,
      filters: noFilters,
      onApply,
      onOpenChange,
    };
    const { rerender } = render(<CardFiltersDialog open {...props} />);

    await user.click(chip("Red"));
    expect(pressed("Red")).toBe("true");

    rerender(<CardFiltersDialog open={false} {...props} />);
    rerender(<CardFiltersDialog open {...props} />);

    expect(pressed("Red")).toBe("false");
  });
});
