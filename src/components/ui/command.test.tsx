// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CommandDialog } from "./command";

afterEach(cleanup);

describe("CommandDialog", () => {
  it("wires the dialog to its generated description", () => {
    render(
      <CommandDialog open description="Search the collection">
        Commands
      </CommandDialog>
    );

    const dialog = screen.getByRole("dialog");
    const description = screen.getByText("Search the collection");

    expect(dialog.getAttribute("aria-describedby")).toBe(description.id);
  });
});
