export function computeBoardScale(
  containerWidth: number,
  containerHeight: number,
  designWidth: number,
  designHeight: number,
): number {
  return Math.min(containerWidth / designWidth, containerHeight / designHeight);
}
