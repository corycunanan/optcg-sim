import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import type { CardWithRelations } from "./card-browser";

import { CardGrid, CardGridSkeleton } from "./card-grid";

const CARD: CardWithRelations = {
  id: "OP01-001",
  originSet: "OP01",
  name: "Roronoa Zoro",
  color: ["Green"],
  type: "CHARACTER",
  cost: 3,
  power: 5000,
  counter: 1000,
  attribute: ["Slash"],
  traits: ["Supernovas", "Straw Hat Crew"],
  rarity: "SR",
  effectText: "",
  triggerText: null,
  imageUrl: "https://cdn.example.test/OP01-001.png",
  blockNumber: 1,
  banStatus: "LEGAL",
  isReprint: false,
  _count: { artVariants: 0 },
  cardSets: [{ setLabel: "OP01" }],
};

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

function renderGrid() {
  act(() => {
    renderer = create(<CardGrid cards={[CARD]} onCardClick={() => {}} />);
  });
  return renderer!.root.findByType("button").props as {
    className: string;
    whileHover?: unknown;
    transition?: unknown;
  };
}

describe("CardGrid tile hover (OPT-714)", () => {
  it("uses the documented CSS scale and shadow transition", () => {
    const props = renderGrid();

    expect(props.className).toContain("shadow-sm");
    expect(props.className).toContain("hover:shadow-md");
    expect(props.className).toContain("motion-safe:hover:scale-[1.03]");
    expect(props.className).toContain("transition-[scale,box-shadow]");
    expect(props.className).toContain("duration-200");
    expect(props.className).toContain("ease-out");
  });

  it("does not use Motion or add raise, rotation, or an inner image zoom", () => {
    const props = renderGrid();

    expect(props.whileHover).toBeUndefined();
    expect(props.transition).toBeUndefined();

    act(() => {
      renderer = create(<CardGrid cards={[CARD]} onCardClick={() => {}} />);
    });
    const html = JSON.stringify(renderer!.toJSON());

    expect(html).not.toContain("-translate-y-1");
    expect(html).not.toContain("group-hover:scale");
    expect(html).not.toContain("transition-all");
  });

  it("gates the hover transform behind motion-safe and keeps the shadow step", () => {
    const { className } = renderGrid();

    expect(className).toContain("motion-safe:hover:scale-[1.03]");
    expect(className).not.toContain("motion-reduce:hover:scale");
    expect(className).toContain("shadow-sm");
    expect(className).toContain("hover:shadow-md");
  });

  it("renders an empty state instead of tiles when there are no cards", () => {
    act(() => {
      renderer = create(<CardGrid cards={[]} onCardClick={() => {}} />);
    });

    expect(renderer!.root.findAllByType("button")).toHaveLength(0);
  });

  it("keeps the skeleton grid free of hover treatment", () => {
    act(() => {
      renderer = create(<CardGridSkeleton count={2} />);
    });
    const html = JSON.stringify(renderer!.toJSON());

    expect(html).not.toContain("hover:shadow-md");
  });
});

// The tile clips raw card art, and its hard cast is generated from that border
// box, so the corner the tile is clipped at is the corner the shadow traces
// (docs/design/SHAPE-LANGUAGE.md §The card radius).
describe("CardGrid card silhouette (OPT-715)", () => {
  it("clips the tile at the card radius, not the chrome radius", () => {
    const { className } = renderGrid();

    expect(className).toContain("rounded-card");
    expect(className).not.toContain("rounded-lg");
    expect(className).toContain("overflow-hidden");
  });

  it("gives the skeleton the same silhouette so the tile keeps its shape", () => {
    act(() => {
      renderer = create(<CardGridSkeleton count={2} />);
    });
    const html = JSON.stringify(renderer!.toJSON());

    expect(html).toContain("rounded-card");
    expect(html).not.toContain("rounded-lg");
  });
});
