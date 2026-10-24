import { CardInstance } from "./persisted-game-state.js";

type Raw = Record<string, unknown>;
const record = (value: unknown): value is Raw =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Validate every owner before the historical validation projection. This
 * includes transaction roots, parked queues and resumed result-ref carriers.
 * Old obligations remain absent: no category can be reconstructed losslessly.
 */
export function validateScheduledSourceSnapshots(
  raw: unknown,
  version: number,
  fail: (reason: string) => never,
  path = "",
): void {
  if (Array.isArray(raw)) {
    raw.forEach((child, i) => validateScheduledSourceSnapshots(child, version, fail, `${path}[${i}]`));
    return;
  }
  if (!record(raw)) return;
  if ("sourceCardSnapshot" in raw) {
    if ("sourceEffectId" in raw && version < 9) {
      fail(`${path}.sourceCardSnapshot requires schemaVersion 9`);
    }
    if (version >= 9) {
      const parsed = CardInstance.safeParse(raw.sourceCardSnapshot);
      if (!parsed.success) fail(`${path}.sourceCardSnapshot: ${parsed.error.message}`);
      if ("sourceEffectId" in raw && parsed.data.instanceId !== raw.sourceEffectId) {
        fail(`${path}.sourceCardSnapshot.instanceId must match sourceEffectId`);
      }
    }
  }
  for (const [key, child] of Object.entries(raw)) {
    validateScheduledSourceSnapshots(child, version, fail, path ? `${path}.${key}` : key);
  }
}
