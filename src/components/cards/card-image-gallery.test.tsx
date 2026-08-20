import type { PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HoloEffect } from "@/types/cards";

vi.mock("@/components/ui/holo-card", () => ({
  // `className` is forwarded onto the element so the radius the main scan is
  // clipped at stays assertable through the mock.
  HoloCard: ({
    children,
    effect,
    className,
  }: PropsWithChildren<{ effect: HoloEffect; className?: string }>) => (
    <div data-testid="holo-card" data-effect={effect} className={className}>
      {children}
    </div>
  ),
}));

import { CardImageGallery } from "./card-image-gallery";

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

function currentEffect() {
  return renderer!.root.findByProps({ "data-testid": "holo-card" }).props[
    "data-effect"
  ];
}

describe("CardImageGallery holo rarity", () => {
  it("uses the selected artwork rarity instead of the base card rarity", () => {
    act(() => {
      renderer = create(
        <CardImageGallery
          cardName="Monkey.D.Luffy"
          baseImageUrl="/base.png"
          baseRarity="Common"
          artVariants={[
            {
              id: "variant-1",
              variantId: "OP01-001_p1",
              label: "Secret Rare",
              rarity: "SecretRare",
              imageUrl: "/secret.png",
              set: "PRB-01",
            },
          ]}
        />
      );
    });

    expect(currentEffect()).toBe("regular-holo");

    const artworkButtons = renderer!.root.findAllByType("button");
    act(() => artworkButtons[1].props.onClick());

    expect(currentEffect()).toBe("rainbow-holo");
  });
});

// The main scan and each variant thumbnail are raw card art, so both clip at
// the card radius (docs/design/SHAPE-LANGUAGE.md §The card radius). The
// thumbnail keeps it on the tile because the tile is what casts `shadow-sm`.
describe("CardImageGallery card silhouette (OPT-715)", () => {
  function renderGallery() {
    act(() => {
      renderer = create(
        <CardImageGallery
          cardName="Monkey.D.Luffy"
          baseImageUrl="/base.png"
          baseRarity="Common"
          artVariants={[
            {
              id: "variant-1",
              variantId: "OP01-001_p1",
              label: "Secret Rare",
              rarity: "SecretRare",
              imageUrl: "/secret.png",
              set: "PRB-01",
            },
          ]}
        />
      );
    });
  }

  it("clips the main scan at the card radius", () => {
    renderGallery();

    const className = renderer!.root.findByProps({
      "data-testid": "holo-card",
    }).props.className as string;

    expect(className).toContain("rounded-card");
    expect(className).not.toContain("rounded-lg");
  });

  it("clips every variant thumbnail at the card radius", () => {
    renderGallery();

    const buttons = renderer!.root.findAllByType("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.props.className).toContain("rounded-card");
      expect(button.props.className).not.toContain("rounded-md");
    }
  });
});
