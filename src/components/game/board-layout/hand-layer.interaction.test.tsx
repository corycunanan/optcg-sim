import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CardDb, CardInstance } from "@shared/game-types";
import { InteractionModeProvider } from "./interaction-mode";

const { SortableContext, useSortable } = vi.hoisted(() => ({
  SortableContext: vi.fn(
    ({
      children,
    }: {
      children: React.ReactNode;
      items?: string[];
    }) => children,
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
  Card: ({
    data,
    faceDown,
  }: {
    data: { card?: CardInstance };
    faceDown?: boolean;
  }) => (
    <div
      data-testid={`card-${data.card?.instanceId ?? "unknown"}`}
      data-face-down={String(!!faceDown)}
    />
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

function makeHiddenCard(instanceId: string, controller: 0 | 1): CardInstance {
  return { ...makeCard(instanceId, controller), cardId: "hidden" };
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

  it("drives each spectator hand card face from its received cardId", () => {
    const hiddenCard = makeHiddenCard("top-hand-hidden", 1);

    act(() => {
      renderer = create(
        <InteractionModeProvider value="spectator">
          <HandLayer
            cards={[topCard, hiddenCard]}
            cardDb={{} as CardDb}
          />
        </InteractionModeProvider>
      );
    });

    expect(
      renderer!.root.findByProps({ "data-testid": "card-top-hand-1" }).props[
        "data-face-down"
      ]
    ).toBe("false");
    expect(
      renderer!.root.findByProps({ "data-testid": "card-top-hand-hidden" })
        .props["data-face-down"]
    ).toBe("true");
    expect(renderer!.root.findAllByProps({ role: "button" })).toHaveLength(0);
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

  it("keeps a defensive hidden card static in full mode", () => {
    const hiddenCard = makeHiddenCard("bottom-hand-hidden", 0);

    act(() => {
      renderer = create(
        <InteractionModeProvider value="full">
          <HandLayer cards={[hiddenCard]} cardDb={{} as CardDb} enableDrag />
        </InteractionModeProvider>
      );
    });

    expect(
      renderer!.root.findByProps({ "data-testid": "card-bottom-hand-hidden" })
        .props["data-face-down"],
    ).toBe("true");
    expect(renderer!.root.findAllByProps({ role: "button" })).toHaveLength(0);
    expect(SortableContext).not.toHaveBeenCalled();
    expect(useSortable).not.toHaveBeenCalled();
  });

  it("excludes a defensive hidden card from mixed-hand sorting", () => {
    const hiddenCard = makeHiddenCard("bottom-hand-hidden", 0);

    act(() => {
      renderer = create(
        <InteractionModeProvider value="full">
          <HandLayer
            cards={[bottomCard, hiddenCard]}
            cardDb={{} as CardDb}
            enableDrag
          />
        </InteractionModeProvider>
      );
    });

    expect(SortableContext).toHaveBeenCalledTimes(1);
    expect(SortableContext.mock.calls[0][0].items).toEqual([
      "hand-bottom-hand-1",
    ]);
    expect(useSortable).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByProps({ role: "button" })).toHaveLength(1);
  });
});
