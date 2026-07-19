import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DonInstance, PlayerState } from "@shared/game-types";
import { cardEntry } from "@/lib/motion";
import { DON_ENTRY_STAGGER_SECONDS, DonZone } from "./don-zone";

const motionState = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", () => ({
  motion: { div: "div" },
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

vi.mock("@/hooks/use-field-arrivals", () => ({
  useFieldArrivals: (ids: Iterable<string>) => new Set(ids),
}));

vi.mock("../card", () => ({
  Card: () => <div data-testid="don-card" />,
}));

function don(instanceId: string, state: DonInstance["state"]): DonInstance {
  return { instanceId, state, attachedTo: null };
}

const player = {
  donCostArea: [
    don("active-1", "ACTIVE"),
    don("active-2", "ACTIVE"),
    don("rested-1", "RESTED"),
  ],
} as PlayerState;

let renderer: ReactTestRenderer | null = null;

function renderZone(enableDrag = false) {
  act(() => {
    renderer = create(
      <DonZone
        player={player}
        enableDrag={enableDrag}
        style={{ position: "absolute", left: 0, top: 0 }}
      />
    );
  });
  if (!renderer) throw new Error("DonZone renderer did not mount");
  return renderer.root;
}

beforeEach(() => {
  motionState.reduced = false;
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("DonZone entry stagger", () => {
  it("stagger-delays the existing entry pop while preserving motion.layout", () => {
    const root = renderZone();
    const entryWrappers = root
      .findAllByType("div")
      .filter((node) => node.props.initial?.y === 4);

    expect(entryWrappers).toHaveLength(3);
    expect(entryWrappers.map((node) => node.props.transition)).toEqual([
      { ...cardEntry, delay: 0 },
      { ...cardEntry, delay: DON_ENTRY_STAGGER_SECONDS },
      { ...cardEntry, delay: DON_ENTRY_STAGGER_SECONDS * 2 },
    ]);
    expect(entryWrappers.every((node) => node.props.layout === true)).toBe(
      true
    );
  });

  it("applies the same stagger to draggable active DON", () => {
    const root = renderZone(true);
    const draggableWrappers = root
      .findAllByType("div")
      .filter((node) => node.props["aria-label"] === "Drag active DON");

    expect(
      draggableWrappers.map((node) => node.props.transition?.delay)
    ).toEqual([0, DON_ENTRY_STAGGER_SECONDS]);
  });

  it("removes entry transforms and delays for reduced motion", () => {
    motionState.reduced = true;
    const root = renderZone();
    const layoutWrappers = root
      .findAllByType("div")
      .filter((node) => node.props.layout === true);

    expect(layoutWrappers).toHaveLength(3);
    expect(layoutWrappers.every((node) => node.props.initial === false)).toBe(
      true
    );
    expect(
      layoutWrappers.every((node) => node.props.transition === undefined)
    ).toBe(true);
  });
});
