import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData, CardDb, CardInstance } from "@shared/game-types";
import { InteractionModeProvider } from "./interaction-mode";

vi.mock("@dnd-kit/sortable", () => ({
  horizontalListSortingStrategy: {},
  SortableContext: ({ children }: { children: React.ReactNode }) => children,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));
vi.mock("motion/react", async () => {
  const ReactModule = await import("react");
  const MotionDiv = ReactModule.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
  >(function MotionDiv({ children, className, style }, ref) {
    return (
      <div ref={ref} className={className} style={style}>
        {children}
      </div>
    );
  });

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { div: MotionDiv },
    useMotionValue: (initial: number) => ({
      get: () => initial,
      set: vi.fn(),
    }),
    useReducedMotion: () => true,
    useSpring: <Value,>(value: Value) => value,
  };
});
vi.mock("@/contexts/active-effects-context", () => ({
  useActiveEffects: () => [],
}));
vi.mock("@/contexts/zone-position-context", () => ({
  useZonePosition: () => ({ register: vi.fn(), unregister: vi.fn() }),
}));
vi.mock("../use-card-tooltip", () => ({
  CardTooltip: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./action-feedback", () => ({
  useCardRejection: () => null,
}));

import { HandLayer } from "./hand-layer";

function makeCard(instanceId: string, cardId: string, owner: 0 | 1): CardInstance {
  return {
    instanceId,
    cardId,
    zone: "HAND",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller: owner,
    owner,
  };
}

function makeCardData(id: string, name: string, imageUrl: string): CardData {
  return {
    id,
    name,
    type: "Character",
    color: ["Red"],
    cost: 1,
    power: 1000,
    counter: 1000,
    life: null,
    attribute: ["Strike"],
    types: ["Test"],
    effectText: "",
    triggerText: null,
    keywords: {
      rush: false,
      rushCharacter: false,
      doubleAttack: false,
      banish: false,
      blocker: false,
      trigger: false,
      unblockable: false,
    },
    effectSchema: null,
    imageUrl,
  };
}

const bottomCard = makeCard("bottom-real", "OP01-001", 0);
const topCard = makeCard("top-real", "OP02-001", 1);
const cardDb: CardDb = {
  [bottomCard.cardId]: makeCardData(
    bottomCard.cardId,
    "Bottom Hand Card",
    "https://cards.example/bottom.png",
  ),
  [topCard.cardId]: makeCardData(
    topCard.cardId,
    "Top Hand Card",
    "https://cards.example/top.png",
  ),
};

let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

describe("HandLayer real card art", () => {
  it("renders the received image source for both spectator hands", () => {
    act(() => {
      renderer = create(
        <InteractionModeProvider value="spectator">
          <>
            <HandLayer cards={[bottomCard]} cardDb={cardDb} />
            <HandLayer cards={[topCard]} cardDb={cardDb} />
          </>
        </InteractionModeProvider>,
      );
    });

    const artByAlt = new Map(
      renderer!.root
        .findAllByType("img")
        .filter((image) => image.props.alt)
        .map((image) => [image.props.alt, image.props.src]),
    );

    expect(artByAlt.get("Bottom Hand Card")).toBe(
      "https://cards.example/bottom.png",
    );
    expect(artByAlt.get("Top Hand Card")).toBe(
      "https://cards.example/top.png",
    );
    expect(artByAlt.size).toBe(2);
  });
});
