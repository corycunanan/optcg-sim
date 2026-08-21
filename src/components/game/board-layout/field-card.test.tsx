import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardInstance } from "@shared/game-types";
import { cardWinnerPulse } from "@/lib/motion";
import type { CardOverlays } from "../card";
import type { TargetCardSelectionState } from "@/lib/game/target-selection";
import { SQUARE } from "./constants";
import { DroppableStageZone } from "./drop-zones";
import { OpponentFieldCard, PlayerFieldCard } from "./field-card";
import {
  InteractionModeProvider,
  type InteractionMode,
} from "./interaction-mode";

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

vi.mock("./drop-zones", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./drop-zones")>()),
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

const eligibleTarget: TargetCardSelectionState = {
  selected: false,
  eligible: true,
  disabledReason: null,
};

function renderTargetSelection(
  kind: "field" | "stage",
  interactionMode: InteractionMode,
  onTargetToggle: () => void,
) {
  const component =
    kind === "field" ? (
      <PlayerFieldCard
        card={card}
        cardDb={{}}
        activeDragType={null}
        canAttack={false}
        targetSelection={eligibleTarget}
        onTargetToggle={onTargetToggle}
        style={{ position: "absolute", left: 0, top: 0 }}
      />
    ) : (
      <DroppableStageZone
        card={card}
        cardDb={{}}
        activeDragType={null}
        targetSelection={eligibleTarget}
        onTargetToggle={onTargetToggle}
        zoneKey="player-stage"
        style={{ position: "absolute", left: 0, top: 0 }}
      />
    );

  act(() => {
    renderer = create(
      <InteractionModeProvider value={interactionMode}>
        {component}
      </InteractionModeProvider>,
    );
  });

  if (!renderer) throw new Error("Target-selection renderer did not mount");
  return renderer.root.findByProps({ "data-target-selection": "" });
}

function renderBlockerSelection(
  interactionMode: InteractionMode,
  onSelect: () => void,
) {
  act(() => {
    renderer = create(
      <InteractionModeProvider value={interactionMode}>
        <PlayerFieldCard
          card={card}
          cardDb={{}}
          activeDragType={null}
          canAttack={false}
          blockerSelectable
          onSelect={onSelect}
          style={{ position: "absolute", left: 0, top: 0 }}
        />
      </InteractionModeProvider>,
    );
  });

  if (!renderer) throw new Error("Blocker-selection renderer did not mount");
  return renderer.root.findByProps({ "data-blocker-selection": "" });
}

// OPT-720 splits these two deliberately, so pin both halves — a later sweep
// that "fixes the inconsistency" either way should fail here.
//
// The stage wrapper shrink-wraps a fixed-size `<Card>`, so its targeting ring
// hugs the card face and takes the card corner. The field-card wrapper
// reserves a 112×112 square (SQUARE × SQUARE) so a rested card can rotate
// inside it — the ring there bounds a square, not a card, and stays chrome.
describe("field vs stage ring silhouette", () => {
  const CHROME_RADIUS = /(?:^|\s)rounded(?:-md)?(?:\s|$)/;

  it("draws the stage targeting ring on the card silhouette", () => {
    const wrapper = renderTargetSelection("stage", "full", vi.fn());

    expect(wrapper.props.className).toContain("rounded-card");
    expect(wrapper.props.className).not.toMatch(CHROME_RADIUS);
  });

  it("keeps the square field-card wrapper on the chrome radius", () => {
    const wrapper = renderTargetSelection("field", "full", vi.fn());

    expect(wrapper.props.className).toContain("rounded-md");
    expect(wrapper.props.className).not.toContain("rounded-card");
    expect(wrapper.props.style).toMatchObject({ width: SQUARE, height: SQUARE });
  });

  // The attached-DON drag handle shrink-wraps a DON `<Card>`, so its ring
  // traces that card even though it sits inside the square wrapper above.
  it("draws the attached-DON drag ring on the card silhouette", () => {
    act(() => {
      renderer = create(
        <PlayerFieldCard
          card={{
            ...card,
            attachedDon: [
              { instanceId: "don-1", state: "ACTIVE", attachedTo: card.instanceId },
            ],
          }}
          cardDb={{}}
          activeDragType={null}
          canAttack={false}
          redistributeSource
          style={{ position: "absolute", left: 0, top: 0 }}
        />,
      );
    });

    const handle = renderer!.root.findByProps({
      "aria-label": "Drag attached DON",
    });

    expect(handle.props.className).toContain("rounded-card");
    expect(handle.props.className).not.toMatch(CHROME_RADIUS);
  });
});

describe("target-selection response-only keyboard contract", () => {
  it.each(["Enter", " "])(
    "keeps field-card target activation usable with %j",
    (key) => {
      const onTargetToggle = vi.fn();
      const target = renderTargetSelection(
        "field",
        "responseOnly",
        onTargetToggle,
      );

      act(() => target.props.onKeyDown({ key, preventDefault: vi.fn() }));

      expect(onTargetToggle).toHaveBeenCalledOnce();
      expect(target.props.role).toBe("button");
    },
  );

  it.each(["Enter", " "])(
    "keeps stage target activation usable with %j",
    (key) => {
      const onTargetToggle = vi.fn();
      const target = renderTargetSelection(
        "stage",
        "responseOnly",
        onTargetToggle,
      );

      act(() => target.props.onKeyDown({ key, preventDefault: vi.fn() }));

      expect(onTargetToggle).toHaveBeenCalledOnce();
      expect(target.props.role).toBe("button");
    },
  );

  it.each(["Enter", " "])(
    "keeps blocker response activation usable with %j",
    (key) => {
      const onSelect = vi.fn();
      const target = renderBlockerSelection("responseOnly", onSelect);

      act(() => target.props.onKeyDown({ key, preventDefault: vi.fn() }));

      expect(onSelect).toHaveBeenCalledOnce();
      expect(target.props.role).toBe("button");
    },
  );
});

describe("read-only viewer target-selection boundary", () => {
  it.each(["Enter", " "])(
    "blocks field-card target activation with %j and removes action semantics",
    (key) => {
      const onTargetToggle = vi.fn();
      const target = renderTargetSelection(
        "field",
        "spectator",
        onTargetToggle,
      );

      act(() => target.props.onKeyDown({ key, preventDefault: vi.fn() }));

      expect(onTargetToggle).not.toHaveBeenCalled();
      expect(target.props.role).toBe("img");
      expect(target.props["aria-pressed"]).toBeUndefined();
      expect(target.props["aria-label"]).not.toContain(
        "eligible for selection",
      );
      expect(target.props.onClick).toBeUndefined();
    },
  );

  it.each(["Enter", " "])(
    "blocks blocker activation with %j and removes action semantics",
    (key) => {
      const onSelect = vi.fn();
      const target = renderBlockerSelection("spectator", onSelect);

      act(() => target.props.onKeyDown({ key, preventDefault: vi.fn() }));

      expect(onSelect).not.toHaveBeenCalled();
      expect(target.props.role).toBe("img");
      expect(target.props["aria-pressed"]).toBeUndefined();
      expect(target.props.onClick).toBeUndefined();
    },
  );

  it.each(["Enter", " "])(
    "blocks stage target activation with %j and removes action semantics",
    (key) => {
      const onTargetToggle = vi.fn();
      const target = renderTargetSelection(
        "stage",
        "spectator",
        onTargetToggle,
      );

      act(() => target.props.onKeyDown({ key, preventDefault: vi.fn() }));

      expect(onTargetToggle).not.toHaveBeenCalled();
      expect(target.props.role).toBe("img");
      expect(target.props["aria-pressed"]).toBeUndefined();
      expect(target.props["aria-label"]).not.toContain(
        "eligible for selection",
      );
      expect(target.props.onClick).toBeUndefined();
    },
  );
});
