// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardHeaderBadgeRow } from "./card-header-badge-row";

afterEach(cleanup);

describe("CardHeaderBadgeRow", () => {
  it("renders a non-LEGAL ban status at the end of the metadata row", () => {
    const { container } = render(
      <CardHeaderBadgeRow
        id="OP16-006"
        type="Character"
        colors={["Red", "Green"]}
        rarity="Super Rare"
        banStatus="BANNED"
      />
    );

    const row = container.firstElementChild as HTMLElement;
    const labels = Array.from(row.children).map((element) =>
      element.getAttribute("role") === "img"
        ? element.getAttribute("aria-label")
        : element.textContent
    );

    expect(labels).toEqual([
      "OP16-006",
      "Character",
      "Red card color",
      "Green card color",
      "Super Rare",
      "BANNED",
    ]);
    expect(row.lastElementChild?.getAttribute("data-variant")).toBe("error");
  });
});
