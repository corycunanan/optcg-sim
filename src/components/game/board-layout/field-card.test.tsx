import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardInstance } from "@shared/game-types";
import { cardWinnerPulse } from "@/lib/motion";
import { OpponentFieldCard } from "./field-card";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  motion: { div: "div" },
  useReducedMotion: () => motionState.reduced,
}));

vi.mock("@dnd-kit/core", () => ({
  useDndMonitor: vi.fn(),
  useDraggable: () => ({
    attributes: {},
    listeners: undefined,
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

vi.mock("@/contexts/zone-position-context", () => ({
  useZonePosition: () => ({
    register: vi.fn(),
    unregister: vi.fn(),
    registerCard: vi.fn(),
    unregisterCard: vi.fn(),
  }),
}));

vi.mock("@/components/ui", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("../card", () => ({
  Card: () => <div data-testid="card" />,
}));

vi.mock("../card-action-menu", () => ({
  CardActionMenuContent: () => null,
}));

vi.mock("./drop-zones", () => ({
  DropOverlay: () => null,
}));

vi.mock("./don-zone", () => ({
  DonCard: () => null,
}));

const card: CardInstance = {
  instanceId: "winner-1",
  cardId: "OP01-001",
  zone: "CHARACTER",
  state: "ACTIVE",
  attachedDon: [],
  turnPlayed: null,
  controller: 0,
  owner: 0,
};

let renderer: ReactTestRenderer | null = null;

function renderOpponent() {
  act(() => {
    const element = (
      <OpponentFieldCard
        card={card}
        cardDb={{}}
        activeDragType={null}
        attackTargetEligible={false}
        winnerPulse
        style={{ position: "absolute", left: 0, top: 0 }}
      />
    );

    if (renderer) renderer.update(element);
    else renderer = create(element);
  });

  if (!renderer) throw new Error("OpponentFieldCard renderer did not mount");
  return renderer.root.findAllByType("div")[0];
}

beforeEach(() => {
  motionState.reduced = false;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("OpponentFieldCard winner recoil", () => {
  it("moves the field-card wrapper with the winner recoil", () => {
    const wrapper = renderOpponent();

    expect(wrapper.props.animate.x).toEqual(cardWinnerPulse.x);
    expect(wrapper.props.transition).toEqual(cardWinnerPulse.transition);
  });

  it("short-circuits wrapper recoil for reduced motion", () => {
    motionState.reduced = true;
    const wrapper = renderOpponent();

    expect(wrapper.props.animate.x).toBe(0);
    expect(wrapper.props.transition).toEqual({ duration: 0 });
  });
});
