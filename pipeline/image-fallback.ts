export function shouldReplaceStubImage(
  existing: { imageUrl: string; imageIsVariantFallback: boolean },
  incoming: { imageUrl: string; imageIsVariantFallback: boolean }
): boolean {
  if (incoming.imageIsVariantFallback) return false;

  const path = existing.imageUrl.split(/[?#]/, 1)[0];
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const stem = filename.replace(/\.(?:png|webp)$/i, "");

  // Keep URL detection as a secondary signal for legacy, unflagged stubs.
  return existing.imageIsVariantFallback || /_p\d+$/i.test(stem);
}
