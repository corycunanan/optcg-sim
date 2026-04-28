/**
 * Convert a viewport-pixel pointer delta into a design-pixel motion delta for
 * elements rendered inside a `<ScaledBoard>` subtree.
 *
 * Inside a transformed parent (`transform: scale(s)`), pointer events still
 * fire in viewport pixels but element transforms apply in the parent's local
 * (design-pixel) space. Dividing the viewport delta by `scale` keeps the
 * dragged element pinned under the pointer.
 *
 * Example: at scale 0.85, a 100 px viewport drag must set `x: ~117.6` for the
 * element to track the pointer.
 */
export function scaleDragDelta(
  viewportDelta: { x: number; y: number },
  scale: number,
): { x: number; y: number } {
  return {
    x: viewportDelta.x / scale,
    y: viewportDelta.y / scale,
  };
}
