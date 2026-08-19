// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CardInfoPanel } from "./card-info-panel";

// The suite has no global setup file, so unmount between cases by hand —
// otherwise a later `queryByText(...)` sees the previous case's markup.
afterEach(cleanup);

/** The stat's value is the sibling that follows its wide-tracked label. */
function statValue(label: string): HTMLElement {
  const labelNode = screen.getByText(label);
  const value = labelNode.nextElementSibling;
  if (!(value instanceof HTMLElement)) {
    throw new Error(`No value rendered for stat "${label}"`);
  }
  return value;
}

describe("CardInfoPanel", () => {
  it("renders the Tier-5 information surface on its own root", () => {
    const { container } = render(
      <CardInfoPanel name="Roronoa Zoro" cardType="Character" cardId="OP01-025" />
    );

    const panel = container.querySelector<HTMLElement>("[data-tier5-surface]");
    expect(panel).not.toBeNull();

    const classes = panel!.className.split(/\s+/);
    // Flat, opaque, square, unglowing — Tier 5 opts out of panel treatment.
    expect(classes).toContain("bg-surface-info");
    expect(classes).toContain("edge-info");
    expect(classes).toContain("rounded-md");
    expect(classes).toContain("shadow-none");
    // Exactly one perimeter: the border utility, and no internal rules.
    expect(classes).toContain("border");
    expect(panel!.innerHTML).not.toContain("border-t");
    // No blur or translucency dressing on the information surface.
    expect(panel!.className).not.toContain("backdrop");
  });

  it("leads with a semibold uppercase name over the type and card id", () => {
    render(
      <CardInfoPanel name="Roronoa Zoro" cardType="Character" cardId="OP01-025" />
    );

    const name = screen.getByText("Roronoa Zoro");
    const classes = name.className.split(/\s+/);
    expect(classes).toContain("text-sm");
    expect(classes).toContain("font-semibold");
    expect(classes).toContain("tracking-widest");
    expect(classes).toContain("uppercase");
    expect(classes).toContain("text-content-primary");
    expect(classes).not.toContain("font-bold");
    expect(classes).not.toContain("tracking-wide");

    const meta = screen.getByText(/Character/);
    expect(meta.textContent).toContain("OP01-025");
    expect(meta.className).toContain("text-content-secondary");
  });

  it("shows cost, power and counter for a character, all in white", () => {
    render(
      <CardInfoPanel
        name="Roronoa Zoro"
        cardType="Character"
        cardId="OP01-025"
        cost={3}
        power={5000}
        counter={1000}
      />
    );

    expect(statValue("Cost").textContent).toBe("3");
    expect(statValue("Power").textContent).toBe("5,000");
    expect(statValue("Counter").textContent).toBe("+1000");

    for (const label of ["Cost", "Power", "Counter"]) {
      expect(statValue(label).className).toContain("text-content-primary");
      expect(screen.getByText(label).className).toContain("uppercase");
    }
  });

  it("swaps cost for life on a leader and drops the counter stat", () => {
    render(
      <CardInfoPanel
        name="Monkey.D.Luffy"
        cardType="Leader"
        cardId="OP01-001"
        life={5}
        power={5000}
        counter={1000}
      />
    );

    expect(statValue("Life").textContent).toBe("5");
    expect(statValue("Power").textContent).toBe("5,000");
    expect(screen.queryByText("Counter")).toBeNull();
    expect(screen.queryByText("Cost")).toBeNull();
  });

  it("renders an em dash when a character has no counter value", () => {
    render(
      <CardInfoPanel
        name="Nami"
        cardType="Character"
        cardId="OP01-016"
        cost={1}
        power={1000}
        counter={null}
      />
    );

    expect(statValue("Counter").textContent).toBe("—");
  });

  it("shows only cost for a non-field card", () => {
    render(
      <CardInfoPanel
        name="Guard Point"
        cardType="Event"
        cardId="OP01-030"
        cost={1}
        power={null}
        counter={null}
      />
    );

    expect(statValue("Cost").textContent).toBe("1");
    expect(screen.queryByText("Power")).toBeNull();
    expect(screen.queryByText("Counter")).toBeNull();
  });

  it("joins colours, traits and attribute into one descriptor row", () => {
    render(
      <CardInfoPanel
        name="Roronoa Zoro"
        cardType="Character"
        cardId="OP01-025"
        colors={["Red"]}
        traits={["Supernovas", "Straw Hat Crew"]}
        attribute={["Slash"]}
      />
    );

    expect(
      screen.getByText("Red · Supernovas / Straw Hat Crew · Slash")
    ).toBeTruthy();
  });

  it("omits the descriptor row when no descriptors are supplied", () => {
    const { container } = render(
      <CardInfoPanel
        name="Roronoa Zoro"
        cardType="Character"
        cardId="OP01-025"
        traits={[]}
        attribute={null}
      />
    );

    const panel = container.querySelector<HTMLElement>("[data-tier5-surface]")!;
    // Header block holds the name and the type/id line, and nothing else.
    expect(panel.firstElementChild?.children).toHaveLength(2);
    expect(within(panel).queryByText(/Slash/)).toBeNull();
  });

  it("renders effect lines with notation chips and keyword hexagons", () => {
    render(
      <CardInfoPanel
        name="Roronoa Zoro"
        cardType="Character"
        cardId="OP01-025"
        effectText={"[Main] Draw 1 card.\nThen, trash 1 card.\n\n[Rush]"}
      />
    );

    const paragraphs = Array.from(document.querySelectorAll("p"));
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0].textContent).toBe("Main Draw 1 card.");
    expect(paragraphs[0].className).toContain("whitespace-pre-wrap");
    expect(paragraphs[1].textContent).toBe("Then, trash 1 card.");

    const mainChip = document.querySelector<HTMLElement>(
      '[data-effect-notation="timing"]'
    );
    expect(mainChip?.textContent).toBe("Main");
    expect(mainChip?.className).toContain("bg-effect-timing");

    const keyword = document.querySelector<HTMLElement>(
      '[data-effect-notation="keyword"]'
    );
    expect(keyword?.textContent).toBe("Rush");
    expect(keyword?.className).toContain("effect-hex");
    expect(keyword?.firstElementChild?.className).toContain("bg-effect-keyword");
  });

  it("renders trigger text under its own label", () => {
    render(
      <CardInfoPanel
        name="Roronoa Zoro"
        cardType="Character"
        cardId="OP01-025"
        triggerText="Play this card."
      />
    );

    const label = screen.getByText("Trigger");
    expect(label.className).toContain("uppercase");
    expect(screen.getByText("Play this card.")).toBeTruthy();
  });

  it("uses a leading trigger chip as the trigger label", () => {
    render(
      <CardInfoPanel
        name="Roronoa Zoro"
        cardType="Character"
        cardId="OP01-025"
        triggerText="[Trigger] Play this card."
      />
    );

    const labels = screen.getAllByText("Trigger");
    expect(labels).toHaveLength(1);
    expect(labels[0].dataset.effectNotation).toBe("trigger");
    expect(labels[0].className).toContain("bg-effect-trigger");
  });

  it("omits the effect and trigger sections when the card has neither", () => {
    render(
      <CardInfoPanel
        name="Roronoa Zoro"
        cardType="Character"
        cardId="OP01-025"
        effectText=""
        triggerText={null}
      />
    );

    expect(screen.queryByText("Trigger")).toBeNull();
    expect(document.querySelectorAll("p")).toHaveLength(0);
  });
});
