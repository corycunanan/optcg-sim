import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDb, CardInstance } from "@shared/game-types";
import { InteractionModeProvider } from "./interaction-mode";

const { SortableContext, useSortable } = vi.hoisted(() => ({
  SortableContext: vi.fn(
    ({ children }: { children: React.ReactNode }) => children,
  ),
  useSortable: vi.fn(() => ({
    attributes: { tabIndex: 0, "aria-describedby": "dnd-help" },
    listeners: { onKeyDown: vi.fn() },
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}));

vi.mock("@dnd-kit/sortable", () => ({
  horizontalListSortingStrategy: {},
  SortableContext,
  useSortable,
}));
vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));
vi.mock("@/contexts/active-effects-context", () => ({
  useActiveEffects: () => [],
}));
vi.mock("@/contexts/zone-position-context", () => ({
  useZonePosition: () => ({ register: vi.fn(), unregister: vi.fn() }),
}));
vi.mock("../card", () => ({
  Card: ({ data }: { data: { card?: CardInstance } }) => (
    <div data-testid={`card-${data.card?.instanceId ?? "unknown"}`} />
  ),
}));
vi.mock("./action-feedback", () => ({
  useCardRejection: () => null,
}));

import { HandLayer } from "./hand-layer";

function makeCard(instanceId: string, controller: 0 | 1): CardInstance {
  return {
    instanceId,
    cardId: `TEST-${controller}`,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller,
    owner: controller,
  } as CardInstance;
}

const bottomCard = makeCard("bottom-hand-1", 0);
const topCard = makeCard("top-hand-1", 1);

let renderer: ReactTestRenderer | null = null;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  SortableContext.mockClear();
  useSortable.mockClear();
});

describe("HandLayer spectator interaction", () => {
  it("renders both face-up spectator hands without pointer or keyboard affordances", () => {
    act(() => {
      renderer = create(
        <InteractionModeProvider value="spectator">
          <>
            <HandLayer cards={[bottomCard]} cardDb={{} as CardDb} />
            <HandLayer cards={[topCard]} cardDb={{} as CardDb} />
          </>
        </InteractionModeProvider>
      );
    });

    expect(
      renderer!.root.findByProps({ "data-testid": "card-bottom-hand-1" })
    ).toBeDefined();
    expect(
      renderer!.root.findByProps({ "data-testid": "card-top-hand-1" })
    ).toBeDefined();
    expect(renderer!.root.findAllByProps({ role: "button" })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ tabIndex: 0 })).toHaveLength(0);
    expect(SortableContext).not.toHaveBeenCalled();
    expect(useSortable).not.toHaveBeenCalled();
  });

  it("preserves sortable keyboard affordances for both hands in full mode", () => {
    act(() => {
      renderer = create(
        <InteractionModeProvider value="full">
          <>
            <HandLayer cards={[bottomCard]} cardDb={{} as CardDb} enableDrag />
            <HandLayer cards={[topCard]} cardDb={{} as CardDb} enableDrag />
          </>
        </InteractionModeProvider>
      );
    });

    expect(renderer!.root.findAllByProps({ role: "button" })).toHaveLength(2);
    expect(renderer!.root.findAllByProps({ tabIndex: 0 })).toHaveLength(2);
    expect(SortableContext).toHaveBeenCalledTimes(2);
    expect(useSortable).toHaveBeenCalledTimes(2);
  });
});
