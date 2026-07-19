import React, { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DonInstance, PlayerState } from "@shared/game-types";
import { DON_ENTRY_STAGGER_SECONDS, DonZone } from "./don-zone";

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
