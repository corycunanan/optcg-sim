import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardInstance } from "@shared/game-types";
import { cardWinnerPulse } from "@/lib/motion";
import type { CardOverlays } from "../card";
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
  Card: ({ overlays }: { overlays?: CardOverlays }) => (
    <div
      data-testid="card"
      data-highlight-ring={overlays?.highlightRing}
      data-highlight-nonce={overlays?.highlightRingNonce}
      data-power-kind={overlays?.powerMod?.kind}
      data-power-value={overlays?.powerMod?.value}
    />
  ),
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

function renderOpponent(
  feedback: {
    winnerPulse?: boolean;
    attackRedirectedPulseNonce?: number;
    effectsNegatedPulseNonce?: string;
    counterPulse?: boolean;
    isAttacker?: boolean;
    isDefender?: boolean;
    powerMod?: {
      kind: "delta" | "absolute";
      value: number;
      nonce: number;
    };
  } = { winnerPulse: true },
) {
  act(() => {
    const element = (
      <OpponentFieldCard
        card={card}
        cardDb={{}}
        activeDragType={null}
        attackTargetEligible={false}
        {...feedback}
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

describe("OpponentFieldCard indicator precedence", () => {
  it("keeps winner above redirected, negated, and sustained battle rings", () => {
    renderOpponent({
      winnerPulse: true,
      attackRedirectedPulseNonce: 3,
      effectsNegatedPulseNonce: "negated:2",
      isAttacker: true,
      isDefender: true,
    });
    const renderedCard = renderer?.root.findByProps({ "data-testid": "card" });

    expect(renderedCard?.props["data-highlight-ring"]).toBe("winner");
    expect(renderedCard?.props["data-highlight-nonce"]).toBeUndefined();
  });

  it("places redirected above negated and threads power overlays", () => {
    renderOpponent({
      attackRedirectedPulseNonce: 3,
      effectsNegatedPulseNonce: "negated:2",
      powerMod: { kind: "delta", value: -2000, nonce: 1 },
    });
    const renderedCard = renderer?.root.findByProps({ "data-testid": "card" });

    expect(renderedCard?.props["data-highlight-ring"]).toBe("redirected");
    expect(renderedCard?.props["data-highlight-nonce"]).toBe(3);
    expect(renderedCard?.props["data-power-kind"]).toBe("delta");
    expect(renderedCard?.props["data-power-value"]).toBe(-2000);
  });

  it("places negated above counter, attacker, and defender", () => {
    renderOpponent({
      effectsNegatedPulseNonce: "negated:2",
      counterPulse: true,
      isAttacker: true,
      isDefender: true,
    });
    const renderedCard = renderer?.root.findByProps({ "data-testid": "card" });

    expect(renderedCard?.props["data-highlight-ring"]).toBe("negated");
    expect(renderedCard?.props["data-highlight-nonce"]).toBe("negated:2");
  });
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
