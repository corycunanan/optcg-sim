// @vitest-environment jsdom
/**
 * OPT-792: in-place SELECT_TARGET over a mixed "Characters or DON!!" pool.
 * The real hook drives the real DonZone; eligibility is the server's
 * validTargets, and one shared count/confirm spans Characters and DON!!.
 */
import React, { useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CardDb,
  CardInstance,
  DonInstance,
  GameAction,
  PlayerState,
  SelectTargetPrompt,
} from "@shared/game-types";
import { DonZone } from "./don-zone";
import { useInPlaceTargetSelection } from "./use-in-place-target-selection";

type MotionOnlyProps = {
  initial?: unknown;
  animate?: { opacity?: number };
  transition?: unknown;
  layout?: boolean;
};

const MOTION_ONLY_KEYS = new Set(["initial", "animate", "transition", "layout"]);

function MotionDiv({
  children,
  ...props
}: React.ComponentProps<"div"> & MotionOnlyProps) {
  const domProps = Object.fromEntries(
    Object.entries(props).filter(([key]) => !MOTION_ONLY_KEYS.has(key))
  );
  return (
    <div {...domProps} data-opacity={props.animate?.opacity}>
      {children}
    </div>
  );
}

vi.mock("motion/react", () => ({
  motion: { div: MotionDiv },
  useReducedMotion: () => false,
}));

vi.mock("@dnd-kit/core", () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: undefined,
    setNodeRef: vi.fn(),
    isDragging: false,
  }),
}));

vi.mock("@/contexts/zone-position-context", () => ({
  useZonePosition: () => ({ register: vi.fn(), unregister: vi.fn() }),
}));

vi.mock("../card", () => ({
  Card: ({ overlays }: { overlays?: { highlightRing?: string } }) => (
    <div data-testid="don-card" data-ring={overlays?.highlightRing} />
  ),
}));

function don(instanceId: string, state: DonInstance["state"]): DonInstance {
  return { instanceId, state, attachedTo: null };
}

function character(instanceId: string, controller: 0 | 1): CardInstance {
  return {
    instanceId,
    cardId: "CHAR",
    zone: "CHARACTER",
    state: "ACTIVE",
    attachedDon: [],
    turnPlayed: null,
    controller,
    owner: controller,
  };
}

function player(
  index: 0 | 1,
  characters: CardInstance[],
  donCostArea: DonInstance[]
): PlayerState {
  return {
    leader: { ...character(`leader-${index}`, index), zone: "LEADER" },
    characters,
    stage: null,
    donCostArea,
  } as unknown as PlayerState;
}

const oppChar = character("opp-char", 1);
const oppChar2 = character("opp-char-2", 1);
const me = player(0, [character("my-char", 0)], [don("my-don", "ACTIVE")]);
const opp = player(
  1,
  [oppChar, oppChar2],
  [don("opp-don-1", "ACTIVE"), don("opp-don-2", "ACTIVE"), don("opp-don-r", "RESTED")]
);

// OP06-035 shape: "Rest up to a total of 2 of your opponent's Characters or
// DON!! cards." The server sends Characters in `cards` and DON!! only by id.
const mixedPrompt: SelectTargetPrompt = {
  promptType: "SELECT_TARGET",
  cards: [oppChar, oppChar2],
  validTargets: ["opp-char", "opp-char-2", "opp-don-1", "opp-don-2"],
  effectDescription:
    "Rest up to a total of 2 of your opponent's Characters or DON!! cards.",
  countMin: 0,
  countMax: 2,
  ctaLabel: "Confirm",
};

const cardDb = {} as CardDb;
let renderer: ReactTestRenderer | null = null;
const captured: {
  current: ReturnType<typeof useInPlaceTargetSelection> | null;
} = { current: null };

function Harness({
  prompt,
  onAction,
}: {
  prompt: SelectTargetPrompt;
  onAction: (action: GameAction) => void;
}) {
  const [players] = useState({ me, opp });
  const selection = useInPlaceTargetSelection({
    prompt,
    me: players.me,
    opp: players.opp,
    cardDb,
    onAction,
  });
  useEffect(() => {
    captured.current = selection;
  });
  return (
    <>
      <DonZone
        player={players.opp}
        zoneKey="opp-don"
        style={{ position: "absolute", left: 0, top: 0 }}
        targetSelectionById={selection.model?.byId}
        onTargetToggle={selection.toggle}
      />
      <DonZone
        player={players.me}
        zoneKey="my-don"
        enableDrag
        style={{ position: "absolute", left: 0, top: 0 }}
        targetSelectionById={selection.model?.byId}
        onTargetToggle={selection.toggle}
      />
    </>
  );
}

function render(prompt: SelectTargetPrompt = mixedPrompt) {
  const onAction = vi.fn();
  act(() => {
    renderer = create(<Harness prompt={prompt} onAction={onAction} />);
  });
  return onAction;
}

function donNode(instanceId: string) {
  const node = renderer!.root
    .findAllByType("div")
    .find((n) => n.props["data-don-instance-id"] === instanceId);
  if (!node) throw new Error(`DON ${instanceId} not rendered`);
  return node;
}

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  captured.current = null;
});

describe("mixed in-place target selection (OPT-792)", () => {
  it("routes a mixed Character + DON!! prompt in place and marks server-valid DON!! eligible", () => {
    render();
    expect(captured.current?.prompt).toBe(mixedPrompt);
    const eligible = donNode("opp-don-1");
    expect(eligible.props.role).toBe("button");
    expect(eligible.props["aria-pressed"]).toBe(false);
    expect(eligible.props["aria-label"]).toBe(
      "DON!!. active. eligible for selection"
    );
    expect(eligible.props["data-target-selection"]).toBe("");
    expect(eligible.findByProps({ "data-testid": "don-card" }).props["data-ring"]).toBe(
      "eligible"
    );

    // Rested and own DON!! are not in validTargets: dimmed and inert.
    for (const id of ["opp-don-r", "my-don"]) {
      const node = donNode(id);
      expect(node.props["aria-disabled"]).toBe(true);
      expect(node.props["data-opacity"]).toBe(0.35);
      expect(node.props.onClick).toBeUndefined();
      expect(node.props["aria-label"]).toContain("Not a valid target");
    }
  });

  it("toggles DON!! by click and Enter/Space and shares one count with Characters", () => {
    const onAction = render();
    act(() => donNode("opp-don-1").props.onClick());
    expect(donNode("opp-don-1").props["aria-pressed"]).toBe(true);
    expect(captured.current?.model?.selectedCount).toBe(1);
    expect(captured.current?.model?.countLabel).toBe("Select up to 2");

    act(() => captured.current!.toggle("opp-char"));
    expect(captured.current?.model?.selectedCount).toBe(2);
    // Shared maximum reached: the other DON!! and Character are disabled.
    expect(donNode("opp-don-2").props["aria-disabled"]).toBe(true);
    expect(donNode("opp-don-2").props["aria-label"]).toContain(
      "Selection limit reached"
    );
    expect(captured.current?.model?.byId.get("opp-char-2")?.disabledReason).toBe(
      "Selection limit reached"
    );

    // Keyboard deselect/reselect on the DON!! token.
    const preventDefault = vi.fn();
    act(() => donNode("opp-don-1").props.onKeyDown({ key: "Enter", preventDefault }));
    expect(donNode("opp-don-1").props["aria-pressed"]).toBe(false);
    act(() => donNode("opp-don-2").props.onKeyDown({ key: " ", preventDefault }));
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(donNode("opp-don-2").props["aria-pressed"]).toBe(true);

    expect(captured.current?.model?.canConfirm).toBe(true);
    act(() => captured.current!.confirm());
    expect(onAction).toHaveBeenCalledWith({
      type: "SELECT_TARGET",
      selectedInstanceIds: ["opp-char", "opp-don-2"],
    });
  });

  it("confirms 2 DON!! with no Character", () => {
    const onAction = render();
    act(() => donNode("opp-don-1").props.onClick());
    act(() => donNode("opp-don-2").props.onClick());
    act(() => captured.current!.confirm());
    expect(onAction).toHaveBeenCalledWith({
      type: "SELECT_TARGET",
      selectedInstanceIds: ["opp-don-1", "opp-don-2"],
    });
  });

  it("keeps zero selection confirmable for an up-to prompt", () => {
    const onAction = render();
    expect(captured.current?.model?.selectedCount).toBe(0);
    expect(captured.current?.model?.canConfirm).toBe(true);
    act(() => captured.current!.confirm());
    expect(onAction).toHaveBeenLastCalledWith({
      type: "SELECT_TARGET",
      selectedInstanceIds: [],
    });
    act(() => captured.current!.skip());
    expect(onAction).toHaveBeenLastCalledWith({
      type: "SELECT_TARGET",
      selectedInstanceIds: [],
    });
  });

  it("routes a DON!!-only prompt in place (no cards in the payload)", () => {
    render({
      ...mixedPrompt,
      cards: [],
      validTargets: ["opp-don-1"],
      countMax: 1,
    });
    expect(captured.current?.prompt).not.toBeNull();
    expect(donNode("opp-don-1").props["aria-pressed"]).toBe(false);
  });

  it("leaves DON!! untouched for a Character-only prompt", () => {
    render({ ...mixedPrompt, validTargets: ["opp-char", "opp-char-2"] });
    expect(captured.current?.model?.byId.has("opp-don-1")).toBe(false);
    const plain = donNode("opp-don-1");
    expect(plain.props.role).toBeUndefined();
    expect(plain.props["aria-pressed"]).toBeUndefined();
  });
});
