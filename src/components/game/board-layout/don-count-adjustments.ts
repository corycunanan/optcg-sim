/** Merge optimistic redistribution previews with animation holdbacks. */
export function mergeDonCountAdjustments(
  redistribution: ReadonlyMap<string, number> | null | undefined,
  inFlight: ReadonlyMap<string, number> | null | undefined
): Map<string, number> | undefined {
  if (!redistribution && !inFlight) return undefined;

  const merged = new Map<string, number>();
  if (redistribution) {
    for (const [instanceId, adjustment] of redistribution) {
      merged.set(instanceId, adjustment);
    }
  }
  if (inFlight) {
    for (const [instanceId, adjustment] of inFlight) {
      merged.set(instanceId, (merged.get(instanceId) ?? 0) + adjustment);
    }
  }

  return merged.size > 0 ? merged : undefined;
}
