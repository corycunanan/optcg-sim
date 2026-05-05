import {
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";

/**
 * Pointer-first collision detection for the scaled board (OPT-348).
 *
 * The board sits inside a CSS `zoom: boardScale` parent, and the dnd-kit
 * `<DragOverlay>` rect is measured against the inner card's layout box, not
 * its visually-scaled ghost. At small scales (~0.59 at the 1280×640 floor)
 * that mismatch desyncs the default `rectIntersection` enough that drops
 * the user clearly placed inside a droppable register as `over: null`.
 *
 * `pointerWithin` reads the live pointer in viewport pixels and is immune to
 * ancestor scaling; `rectIntersection` stays as the keyboard fallback
 * (no pointer coordinates).
 */
export const boardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};
