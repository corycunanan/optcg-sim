import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardInstance, PlayerState } from "@shared/game-types";

vi.mock("./zone-ref", () => ({
  ZoneRef: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../card", () => ({
  Card: ({ className }: { className?: string }) => (
    <div data-testid="stage-card" data-class={className ?? ""} />
  ),
}));
vi.mock("./don-zone", () => ({ DonZone: () => null }));
vi.mock("./deck-pile", () => ({ DeckPile: () => null }));
vi.mock("./don-deck-pile", () => ({ DonDeckPile: () => null }));
vi.mock("./life-zone", () => ({ LifeZone: () => null }));
vi.mock("./trash-zone", () => ({ DroppableTrashZone: () => null }));
vi.mock("./empty-slot", () => ({ EmptySlot: () => null }));
vi.mock("./field-card", () => ({ OpponentFieldCard: () => null }));

import { OpponentField } from "./opponent-field";

const stage: CardInstance = {
  instanceId: "opp-stage-1",
  cardId: "OP01-120",
  zone: "STAGE",
  state: "ACTIVE",
  attachedDon: [],
  turnPlayed: null,
  controller: 1,
  owner: 1,
};

const opp = {
  playerId: "p1",
  leader: null,
  characters: [null, null, null, null, null],
  stage,
  donCostArea: [],
  hand: [],
  deck: [],
  trash: [],
  donDeck: [],
  life: [],
} as unknown as PlayerState;

let renderer: ReactTestRenderer | null = null;
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

function stageClass(arrivingInstanceIds?: ReadonlySet<string>) {
  const element = (
    <OpponentField
      opp={opp}
      playerIndex={1}
      bottomPlayerIndex={0}
      owner="opp"
      cardDb={{}}
      activeDragType={null}
      onPreviewZone={() => {}}
      arrivingInstanceIds={arrivingInstanceIds}
    />
  );
  act(() => {
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
  return renderer!.root.findByProps({ "data-testid": "stage-card" }).props[
    "data-class"
  ] as string;
}

describe("OpponentField stage arrival (OPT-1054)", () => {
  it("hides an arriving stage until its flight lands, then shows it", () => {
    expect(stageClass(new Set([stage.instanceId]))).toContain("invisible");
    expect(stageClass(new Set())).not.toContain("invisible");
  });
});
