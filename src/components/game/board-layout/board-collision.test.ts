// OPT-348: At the 1280×640 floor the board renders at scale ~0.59. The
// dnd-kit `<DragOverlay>` rect is measured against the inner card's layout
// box, not its visually-scaled ghost — drops the user clearly placed inside
// a droppable register as `over: null` under the default `rectIntersection`.
// `boardCollisionDetection` prefers `pointerWithin` (immune to ancestor
// transforms) and falls back to `rectIntersection` when there are no pointer
// coordinates (keyboard activation).

import { describe, expect, it } from "vitest";
import type { ClientRect, UniqueIdentifier } from "@dnd-kit/core";
import { boardCollisionDetection } from "./board-collision";

interface FakeContainer {
  id: UniqueIdentifier;
}

function makeRect(top: number, left: number, width: number, height: number): ClientRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function makeContainer(id: UniqueIdentifier): FakeContainer {
  return { id };
}

// Minimal arg shape that exercises the strategy. Casts cover the dnd-kit
// internal types we don't construct here (active draggable instance,
// DroppableContainer methods); the strategy only reads `id` off containers
// and rect data off the maps.
function makeArgs(opts: {
  pointer: { x: number; y: number } | null;
  collisionRect: ClientRect;
  droppables: Array<{ id: UniqueIdentifier; rect: ClientRect }>;
}) {
  const droppableRects = new Map<UniqueIdentifier, ClientRect>();
  const containers = opts.droppables.map((d) => {
    droppableRects.set(d.id, d.rect);
    return makeContainer(d.id);
  });
  return {
    active: { id: "drag" } as never,
    collisionRect: opts.collisionRect,
    droppableRects,
    droppableContainers: containers as never,
    pointerCoordinates: opts.pointer,
  };
}

describe("boardCollisionDetection", () => {
  it("returns the droppable under the pointer even when the collision rect overshoots", () => {
    // Reproduces the OPT-348 1280×640 scenario: the pointer is over slot 0,
    // but the dragOverlay-measured collision rect is wider/taller than the
    // visual ghost and overlaps both slot 0 and slot 1 by similar amounts.
    // `rectIntersection` would tie-break by intersection area; `pointerWithin`
    // unambiguously names the slot the user is hovering.
    const result = boardCollisionDetection(
      makeArgs({
        pointer: { x: 467, y: 373 },
        collisionRect: makeRect(333, 427, 84, 118),
        droppables: [
          { id: "char-slot-0", rect: makeRect(333, 427, 80, 80) },
          { id: "char-slot-1", rect: makeRect(333, 510, 80, 80) },
        ],
      }),
    );

    expect(result).not.toHaveLength(0);
    expect(result[0]?.id).toBe("char-slot-0");
  });

  it("falls back to rect intersection when there is no pointer (keyboard drag)", () => {
    const result = boardCollisionDetection(
      makeArgs({
        pointer: null,
        collisionRect: makeRect(330, 425, 84, 90),
        droppables: [
          { id: "char-slot-0", rect: makeRect(333, 427, 80, 80) },
          { id: "char-slot-far", rect: makeRect(0, 0, 50, 50) },
        ],
      }),
    );

    expect(result).not.toHaveLength(0);
    expect(result[0]?.id).toBe("char-slot-0");
  });

  it("returns an empty list when neither pointer nor rect intersects any droppable", () => {
    const result = boardCollisionDetection(
      makeArgs({
        pointer: { x: 50, y: 50 },
        collisionRect: makeRect(0, 0, 10, 10),
        droppables: [{ id: "char-slot-0", rect: makeRect(333, 427, 80, 80) }],
      }),
    );

    expect(result).toHaveLength(0);
  });
});
