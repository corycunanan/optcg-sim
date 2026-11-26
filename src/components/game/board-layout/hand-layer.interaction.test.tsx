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
const zoneRegistry = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
}));
vi.mock("@/contexts/zone-position-context", () => ({
  useZonePosition: () => zoneRegistry,
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
  zoneRegistry.register.mockClear();
  zoneRegistry.unregister.mockClear();
});

describe("HandLayer spectator interaction", () => {
  it("renders a false-gated SET_COST hand card playable from its broadcast cost", () => {
    const handCard = { ...bottomCard, effectiveCost: 3 };
    const cardDb = {
      [handCard.cardId]: { name: "Conditional Setter", cost: 5, type: "Character" },
    } as CardDb;

    act(() => {
      renderer = create(
        <InteractionModeProvider value="full">
          <HandLayer
            cards={[handCard]}
            cardDb={cardDb}
            enableDrag
            availableDon={3}
          />
        </InteractionModeProvider>
      );
    });

    expect(renderer!.root.findByProps({ role: "button" }).props["aria-disabled"])
      .toBe(false);
  });

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

  // The sortable wrapper shrink-wraps a fixed-size hand `<Card>`, so its drag
  // focus ring hugs the card face and must trace the card's corner rather than
  // a chrome one (OPT-720, SHAPE-LANGUAGE.md §The card radius).
  it("draws the drag focus ring on the card silhouette", () => {
    act(() => {
      renderer = create(
        <InteractionModeProvider value="full">
          <HandLayer cards={[bottomCard]} cardDb={{} as CardDb} enableDrag />
        </InteractionModeProvider>
      );
    });

    const wrapper = renderer!.root
      .findAllByType("div")
      .find((node) =>
        String(node.props.className ?? "").includes("focus-visible:ring-4")
      );

    expect(wrapper?.props.className).toContain("rounded-card");
    expect(wrapper?.props.className).not.toMatch(/(?:^|\s)rounded(?:-md)?(?:\s|$)/);
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

  it("keeps a seated opponent sleeve visible while its draw flight runs", () => {
    const hiddenCard = makeHiddenCard("opponent-draw-in-flight", 1);

    act(() => {
      renderer = create(
        <InteractionModeProvider value="full">
          <HandLayer
            cards={[hiddenCard]}
            cardDb={{} as CardDb}
            inFlightInstanceIds={new Set([hiddenCard.instanceId])}
          />
        </InteractionModeProvider>
      );
    });

    expect(
      renderer!.root.findByProps({
        "data-testid": "card-opponent-draw-in-flight",
      }),
    ).toBeDefined();
    expect(renderer!.root.findAllByProps({ className: "invisible" })).toHaveLength(
      0,
    );
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

  it("registers every card's slot so flights land in it (OPT-1054)", () => {
    const hiddenCard = makeHiddenCard("top-hand-hidden", 1);
    act(() => {
      renderer = create(
        <InteractionModeProvider value="full">
          <HandLayer
            cards={[bottomCard, hiddenCard]}
            cardDb={{} as CardDb}
            zoneKey="p-hand"
          />
        </InteractionModeProvider>,
        { createNodeMock: () => ({}) },
      );
    });

    const keys = zoneRegistry.register.mock.calls.map(([key]) => key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "p-hand",
        "p-hand/bottom-hand-1",
        "p-hand/top-hand-hidden",
      ]),
    );

    act(() => renderer?.unmount());
    renderer = null;
    const removed = zoneRegistry.unregister.mock.calls.map(([key]) => key);
    expect(removed).toEqual(
      expect.arrayContaining(["p-hand/bottom-hand-1", "p-hand/top-hand-hidden"]),
    );
  });

  it("keeps an arriving card's slot closed until its flight departs (OPT-1054)", () => {
    vi.useFakeTimers();
    try {
      const arriving = makeCard("drawn-1", 0);
      const departures = new Map([[arriving.instanceId, Date.now() + 300]]);
      const element = (
        <InteractionModeProvider value="full">
          <HandLayer
            cards={[bottomCard, arriving]}
            cardDb={{} as CardDb}
            inFlightInstanceIds={new Set([arriving.instanceId])}
            departures={departures}
          />
        </InteractionModeProvider>
      );
      act(() => {
        renderer = create(element);
      });
      // The second card's slot is the only one carrying a margin.
      const slotStyle = () =>
        renderer!.root.findAll(
          (node) =>
            typeof node.type === "string" &&
            node.props.style?.marginLeft !== undefined,
        )[0].props.style;

      // Still flipping on the deck: the slot takes no room.
      expect(slotStyle()).toMatchObject({ width: 0, minWidth: 0, marginLeft: 0 });

      // The flight departs: the slot opens and the hand re-fans with it.
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(slotStyle()).toEqual({ marginLeft: 12 });
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps a just-added card's slot closed until its flight can register (OPT-1054)", () => {
    vi.useFakeTimers();
    try {
      const arriving = makeCard("drawn-1", 0);
      const hand = (cards: CardInstance[]) => (
        <InteractionModeProvider value="full">
          <HandLayer cards={cards} cardDb={{} as CardDb} />
        </InteractionModeProvider>
      );
      act(() => {
        renderer = create(hand([bottomCard]));
      });
      // The card arrives; its transition has not registered yet.
      act(() => {
        renderer!.update(hand([bottomCard, arriving]));
      });
      const slotStyle = () =>
        renderer!.root.findAll(
          (node) =>
            typeof node.type === "string" &&
            node.props.style?.marginLeft !== undefined,
        )[0].props.style;

      // Past the seen-ids reconcile, the gap still has not opened.
      expect(slotStyle()).toMatchObject({ width: 0, minWidth: 0, marginLeft: 0 });

      // No flight claimed it within the grace window: the slot opens.
      act(() => {
        vi.advanceTimersByTime(120);
      });
      expect(slotStyle()).toEqual({ marginLeft: 12 });
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps a remounted slot's ref stable across renders (OPT-1054)", () => {
    const flipping = makeHiddenCard("drawn-ref", 0);
    const hand = (cards: CardInstance[]) => (
      <InteractionModeProvider value="full">
        <HandLayer cards={cards} cardDb={{} as CardDb} zoneKey="p-hand" />
      </InteractionModeProvider>
    );
    act(() => {
      renderer = create(hand([bottomCard, flipping]), {
        createNodeMock: () => ({}),
      });
    });
    // The card turns face-up: it moves from the sleeve branch to the
    // sortable branch, so its slot element remounts.
    const revealed = { ...flipping, cardId: "OP01-001" };
    act(() => renderer!.update(hand([bottomCard, revealed])));
    const slotKey = "p-hand/drawn-ref";
    const registrations = () =>
      zoneRegistry.register.mock.calls.filter(([key]) => key === slotKey)
        .length;
    const unregistrations = () =>
      zoneRegistry.unregister.mock.calls.filter(([key]) => key === slotKey)
        .length;
    const settled = [registrations(), unregistrations()];

    // Plain re-renders must not detach and re-attach the slot.
    act(() => renderer!.update(hand([bottomCard, revealed])));
    act(() => renderer!.update(hand([bottomCard, revealed])));
    expect([registrations(), unregistrations()]).toEqual(settled);
    // The live registration is the remounted slot, not removed.
    expect(registrations()).toBeGreaterThan(unregistrations());
  });

  it("holds a returning card's slot again for its new flight (OPT-1054)", () => {
    vi.useFakeTimers();
    try {
      const arriving = makeCard("drawn-back", 0);
      const hand = (
        cards: CardInstance[],
        departures?: ReadonlyMap<string, number>,
      ) => (
        <InteractionModeProvider value="full">
          <HandLayer
            cards={cards}
            cardDb={{} as CardDb}
            inFlightInstanceIds={new Set(departures?.keys() ?? [])}
            departures={departures}
          />
        </InteractionModeProvider>
      );
      const slotStyle = () =>
        renderer!.root.findAll(
          (node) =>
            typeof node.type === "string" &&
            node.props.style?.marginLeft !== undefined,
        )[0].props.style;

      act(() => {
        renderer = create(
          hand([bottomCard, arriving], new Map([[arriving.instanceId, Date.now() + 300]])),
        );
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(slotStyle()).toEqual({ marginLeft: 12 });

      // Bounced back to the deck, then drawn again by a new flight.
      act(() => renderer!.update(hand([bottomCard])));
      act(() => {
        vi.advanceTimersByTime(500);
      });
      act(() => {
        renderer!.update(
          hand([bottomCard, arriving], new Map([[arriving.instanceId, Date.now() + 300]])),
        );
      });
      expect(slotStyle()).toMatchObject({ width: 0, minWidth: 0, marginLeft: 0 });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(slotStyle()).toEqual({ marginLeft: 12 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears its arrival grace timer on unmount (OPT-1054)", () => {
    vi.useFakeTimers();
    try {
      const hand = (cards: CardInstance[]) => (
        <InteractionModeProvider value="full">
          <HandLayer cards={cards} cardDb={{} as CardDb} />
        </InteractionModeProvider>
      );
      act(() => {
        renderer = create(hand([bottomCard]));
      });
      act(() => renderer!.update(hand([bottomCard, makeCard("drawn-2", 0)])));
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      act(() => renderer!.unmount());
      renderer = null;
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
