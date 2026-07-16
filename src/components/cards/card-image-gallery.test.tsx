import type { PropsWithChildren } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HoloEffect } from "@/types/cards";

vi.mock("@/components/ui/holo-card", () => ({
  HoloCard: ({
    children,
    effect,
  }: PropsWithChildren<{ effect: HoloEffect }>) => (
    <div data-testid="holo-card" data-effect={effect}>
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
