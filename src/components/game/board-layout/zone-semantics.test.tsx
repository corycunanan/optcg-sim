import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardInstance } from "@shared/game-types";
import { DeckPile } from "./deck-pile";
import { DroppableTrashZone } from "./trash-zone";

vi.mock("@/contexts/zone-position-context", () => ({
  useZonePosition: () => ({ register: vi.fn(), unregister: vi.fn() }),
}));

vi.mock("../card", () => ({
  Card: ({ ariaLabel }: { ariaLabel?: string }) => (
    <div data-testid="card" aria-label={ariaLabel} />
  ),
}));

vi.mock("./pile-receipt", () => ({
  PileReceipt: ({ children }: { children: React.ReactNode }) => children,
}));

const trashCard = (instanceId: string): CardInstance =>
  ({
    instanceId,
    cardId: "OP01-001",
    zone: "TRASH",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: 0,
    owner: 0,
  }) as CardInstance;

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("pile zone semantics", () => {
  it("labels the deck group with its owner and visible count", () => {
    act(() => {
      renderer = create(
        <DeckPile
          count={3}
          arrivingCount={1}
          cardDb={{}}
          zoneKey="p-deck"
          style={{ position: "absolute" }}
        />
      );
    });

    expect(
      renderer?.root.findByProps({
        role: "group",
        "aria-label": "Your deck area, 2 cards",
      })
    ).toBeDefined();
  });

  it("labels the trash group with its owner and visible count", () => {
    act(() => {
      renderer = create(
        <DroppableTrashZone
          trash={[trashCard("trash-1"), trashCard("trash-2")]}
          arrivingCount={1}
          cardDb={{}}
          zoneKey="o-trash"
        />
      );
    });

    expect(
      renderer?.root.findByProps({
        role: "group",
        "aria-label": "Opponent's trash area, 1 card",
      })
    ).toBeDefined();
  });
});
