import {
  KeyboardCode,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";

type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DirectionalDropCandidate = {
  id: string | number;
  rect: RectLike;
};

const DIRECTION_KEYS = new Set<string>([
  KeyboardCode.Down,
  KeyboardCode.Left,
  KeyboardCode.Right,
  KeyboardCode.Up,
]);

function center(rect: RectLike) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/** Pick the closest legal drop target in the requested board direction.
 * Primary-axis distance wins, with cross-axis distance breaking ties so arrow
 * movement follows the visual rows and columns of the tabletop. */
export function findDirectionalDropTarget(
  key: string,
  source: RectLike,
  candidates: readonly DirectionalDropCandidate[],
): DirectionalDropCandidate | null {
  if (!DIRECTION_KEYS.has(key)) return null;

  const sourceCenter = center(source);
  let best: { candidate: DirectionalDropCandidate; score: number } | null = null;
  let fallback: { candidate: DirectionalDropCandidate; score: number } | null = null;

  for (const candidate of candidates) {
    const candidateCenter = center(candidate.rect);
    const dx = candidateCenter.x - sourceCenter.x;
    const dy = candidateCenter.y - sourceCenter.y;
    const inDirection =
      (key === KeyboardCode.Down && dy > 0) ||
      (key === KeyboardCode.Up && dy < 0) ||
      (key === KeyboardCode.Right && dx > 0) ||
      (key === KeyboardCode.Left && dx < 0);
    if (!inDirection) continue;

    const primary =
      key === KeyboardCode.Down || key === KeyboardCode.Up
        ? Math.abs(dy)
        : Math.abs(dx);
    const cross =
      key === KeyboardCode.Down || key === KeyboardCode.Up
        ? Math.abs(dx)
        : Math.abs(dy);
    const score = primary + cross * 0.5;
    if (!fallback || score < fallback.score) fallback = { candidate, score };
    // Prefer targets inside the arrow's 90-degree directional cone. If a
    // sparse layout has none, the half-plane fallback still permits progress.
    if (primary >= cross && (!best || score < best.score)) {
      best = { candidate, score };
    }
  }

  return best?.candidate ?? fallback?.candidate ?? null;
}

/** Coordinate getter for the scaled tabletop. Unlike sortable's getter, this
 * supports arbitrary draggables (DON and attackers are not sortable items)
 * and moves the active card's center directly onto the next enabled target. */
export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { active, currentCoordinates, context },
) => {
  if (!DIRECTION_KEYS.has(event.code) || !context.collisionRect) return;
  event.preventDefault();

  const candidates = context.droppableContainers
    .getEnabled()
    .flatMap((container) => {
      if (container.id === active) return [];
      // Targets can become enabled only after keyboard pickup (for example,
      // character slots after a hand-card drag begins). Their ref already has
      // geometry even if dnd-kit's current measured-rect map has not caught up
      // with that state change yet.
      const rect =
        context.droppableRects.get(container.id) ?? container.rect.current;
      return rect ? [{ id: container.id, rect }] : [];
    });
  const next = findDirectionalDropTarget(
    event.code,
    context.collisionRect,
    candidates,
  );
  if (!next) return;

  const sourceCenter = center(context.collisionRect);
  const targetCenter = center(next.rect);
  return {
    x: currentCoordinates.x + targetCenter.x - sourceCenter.x,
    y: currentCoordinates.y + targetCenter.y - sourceCenter.y,
  };
};
