import React, { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DonInstance, PlayerState } from "@shared/game-types";
import { DON_ENTRY_STAGGER_SECONDS, DonZone, donFanSteps } from "./don-zone";

const motionState = vi.hoisted(() => ({ reduced: false }));

function MotionDiv({
  children,
  initial,
  transition,
  ...props
}: React.ComponentProps<"div"> & {
  initial?: false | { y?: number };
  transition?: { delay?: number };
}) {
  const [mountMotion] = useState(() => ({ initial, transition }));
  return (
    <div
      {...props}
      data-mount-initial-y={
        mountMotion.initial === false ? undefined : mountMotion.initial?.y
      }
      data-mount-delay={mountMotion.transition?.delay}
    >
      {children}
    </div>
  );
}

vi.mock("motion/react", () => ({
  motion: { div: MotionDiv },
  useReducedMotion: () => motionState.reduced,
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
  Card: () => <div data-testid="don-card" />,
}));

function don(instanceId: string, state: DonInstance["state"]): DonInstance {
  return { instanceId, state, attachedTo: null };
}

function player(...donCostArea: DonInstance[]): PlayerState {
  return { donCostArea } as PlayerState;
}

let renderer: ReactTestRenderer | null = null;

function renderZone(currentPlayer: PlayerState, enableDrag = false) {
  act(() => {
    const element = (
      <DonZone
        player={currentPlayer}
        enableDrag={enableDrag}
        zoneKey="p-don"
        style={{ position: "absolute", left: 0, top: 0 }}
      />
    );
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
  if (!renderer) throw new Error("DonZone renderer did not mount");
  return renderer.root;
}

function findDonWrapper(root: ReactTestRenderer["root"], instanceId: string) {
  const wrapper = root
    .findAllByType("div")
    .find((node) => node.props["data-don-instance-id"] === instanceId);
  if (!wrapper) throw new Error(`DON wrapper ${instanceId} was not rendered`);
  return wrapper;
}

beforeEach(() => {
  motionState.reduced = false;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("DonZone entry stagger", () => {
  it("stagger-treats only a newly-added DON while preserving motion.layout", () => {
    renderZone(player(don("active-1", "ACTIVE"), don("rested-1", "RESTED")));
    const root = renderZone(
      player(
        don("active-1", "ACTIVE"),
        don("active-2", "ACTIVE"),
        don("rested-1", "RESTED"),
      ),
    );
    const existingActive = findDonWrapper(root, "active-1");
    const arrivingActive = findDonWrapper(root, "active-2");
    const existingRested = findDonWrapper(root, "rested-1");

    expect(existingActive.props["data-mount-initial-y"]).toBeUndefined();
    expect(existingRested.props["data-mount-initial-y"]).toBeUndefined();
    expect(arrivingActive.props["data-mount-initial-y"]).toBe(4);
    expect(arrivingActive.props["data-mount-delay"]).toBe(
      DON_ENTRY_STAGGER_SECONDS,
    );
    expect(arrivingActive.props.layout).toBe(true);
  });

  it("applies the same mount-time stagger to newly-added draggable DON", () => {
    renderZone(player(don("active-1", "ACTIVE")), true);
    const root = renderZone(
      player(don("active-1", "ACTIVE"), don("active-2", "ACTIVE")),
      true,
    );

    expect(
      findDonWrapper(root, "active-1").props["data-mount-initial-y"],
    ).toBeUndefined();
    expect(
      findDonWrapper(root, "active-2").props["data-mount-delay"],
    ).toBe(DON_ENTRY_STAGGER_SECONDS);
  });

  it("removes entry transforms and delays for reduced motion", () => {
    renderZone(player(don("active-1", "ACTIVE")));
    motionState.reduced = true;
    const root = renderZone(
      player(don("active-1", "ACTIVE"), don("active-2", "ACTIVE")),
    );
    expect(
      findDonWrapper(root, "active-2").props["data-mount-initial-y"],
    ).toBeUndefined();
    expect(
      findDonWrapper(root, "active-2").props["data-mount-delay"],
    ).toBeUndefined();
  });
});

// The draggable wrapper shrink-wraps a fixed-size DON `<Card>`, so its focus
// ring hugs that card face and takes the card's corner (OPT-720,
// SHAPE-LANGUAGE.md §The card radius).
describe("DonZone card silhouette", () => {
  it("draws the drag focus ring on the card silhouette", () => {
    const root = renderZone(player(don("active-1", "ACTIVE")), true);
    const wrapper = findDonWrapper(root, "active-1");

    expect(wrapper.props.className).toContain("rounded-card");
    expect(wrapper.props.className).not.toMatch(
      /(?:^|\s)rounded(?:-md)?(?:\s|$)/
    );
    expect(wrapper.props.className).toContain("focus-visible:ring-4");
  });
});

describe("DonZone accessibility", () => {
  it("labels the zone counts and the state of draggable DON", () => {
    const root = renderZone(
      player(don("active-1", "ACTIVE"), don("rested-1", "RESTED")),
      true,
    );

    expect(
      root.findByProps({
        role: "group",
        "aria-label": "Your DON!! area, 1 active, 1 rested",
      }),
    ).toBeDefined();

    const activeDon = findDonWrapper(root, "active-1");
    expect(activeDon.props.role).toBe("button");
    expect(activeDon.props["aria-label"]).toBe("Active DON!!, draggable");
  });
});

describe("DonZone prompt-time fan-out (OPT-792)", () => {
  const ZONE = 234; // stgDonWidth: (CHAR_ROW_W - SQUARE - 2 * LEADER_GAP) / 2
  const INNER = ZONE - 2;
  const span = (n: number, card: number, step: number) =>
    n > 0 ? card + (n - 1) * step : 0;

  it("keeps the resting overlap when the prompt offers no DON!!", () => {
    expect(
      donFanSteps({
        activeCount: 6,
        restedCount: 4,
        activeOffered: false,
        restedOffered: false,
        zoneWidth: ZONE,
      }),
    ).toEqual({ active: 15, rested: 10 });
  });

  it.each([
    [10, 0, true, false, { active: 20, rested: 10 }],
    [0, 10, false, true, { active: 15, rested: 18 }],
    [4, 6, true, false, { active: 28, rested: 4 }],
    [2, 0, true, false, { active: 54, rested: 10 }],
  ])(
    "fans the offered group: %i active / %i rested",
    (activeCount, restedCount, activeOffered, restedOffered, expected) => {
      expect(
        donFanSteps({
          activeCount,
          restedCount,
          activeOffered,
          restedOffered,
          zoneWidth: ZONE,
        }),
      ).toEqual(expected);
    },
  );

  it("fits every count up to 10 DON!! and never overlaps more than at rest", () => {
    for (let active = 0; active <= 10; active++) {
      for (let rested = 0; active + rested <= 10; rested++) {
        for (const [activeOffered, restedOffered] of [
          [true, false],
          [false, true],
          [true, true],
        ] as const) {
          if ((activeOffered && !active) || (restedOffered && !rested)) continue;
          const steps = donFanSteps({
            activeCount: active,
            restedCount: rested,
            activeOffered,
            restedOffered,
            zoneWidth: ZONE,
          });
          const gap = active > 0 && rested > 0 ? 8 : 0;
          const used =
            span(active, 50, steps.active) + span(rested, 70, steps.rested) + gap;
          expect(used, `${active}/${rested}`).toBeLessThanOrEqual(INNER);
          // Never tighter than at rest whenever the resting layout itself
          // fits the zone (some resting mixes already overflow and clip).
          // A one-card group has no step to compare.
          const restingUsed = span(active, 50, 15) + span(rested, 70, 10) + gap;
          if (restingUsed <= INNER) {
            const label = `${active}/${rested} offered ${activeOffered}/${restedOffered}`;
            if (activeOffered && active > 1) expect(steps.active, label).toBeGreaterThanOrEqual(15);
            if (restedOffered && rested > 1) expect(steps.rested, label).toBeGreaterThanOrEqual(10);
          }
        }
      }
    }
  });

  it("spreads offered DON!! on the board only while the prompt offers them", () => {
    const dons = Array.from({ length: 6 }, (_, i) => don(`a-${i}`, "ACTIVE"));
    const selection = new Map(
      dons.map((d) => [
        d.instanceId,
        { selected: false, eligible: true, disabledReason: null },
      ]),
    );
    const render = (withPrompt: boolean) => {
      act(() => {
        const element = (
          <DonZone
            player={player(...dons)}
            zoneKey="opp-don"
            style={{ position: "absolute", left: 0, top: 0, width: ZONE }}
            targetSelectionById={withPrompt ? selection : undefined}
          />
        );
        if (renderer) renderer.update(element);
        else renderer = create(element);
      });
      return renderer!.root;
    };
    // Resting: -35 overlap (15px exposed).
    expect(findDonWrapper(render(false), "a-1").props.style.marginLeft).toBe(-35);
    // Prompt: (232 - 50) / 5 = 36px exposed → -14 margin.
    expect(findDonWrapper(render(true), "a-1").props.style.marginLeft).toBe(-14);
    expect(findDonWrapper(render(true), "a-0").props.style.marginLeft).toBe(0);
  });
});
