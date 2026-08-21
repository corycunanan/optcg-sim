export function shouldReplaceStubImage(
  existingImageUrl: string,
  incoming: { imageUrl: string; imageIsVariantFallback: boolean }
): boolean {
  if (incoming.imageIsVariantFallback) return false;

  const path = existingImageUrl.split(/[?#]/, 1)[0];
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const stem = filename.replace(/\.(?:png|webp)$/i, "");

  // Migrated stubs use cards/<cardId>.webp, which loses the _p marker and is
  // therefore not detectable from its URL. Replacing those stubs is out of scope.
  return /_p\d+$/.test(stem);
}
