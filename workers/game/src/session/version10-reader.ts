import { CardInstance, ActivatedSourceIdentity } from "./persisted-game-state.js";

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
  if ("sourceIdentity" in raw && (version >= 10 || "sourceEffectId" in raw)) {
    if ("sourceEffectId" in raw && version < 10) fail(`${path}.sourceIdentity requires schemaVersion 10`);
    const identity = ActivatedSourceIdentity.safeParse(raw.sourceIdentity);
    if (!identity.success) fail(`${path}.sourceIdentity: ${identity.error.message}`);
    if ("sourceEffectId" in raw && identity.data.instanceId !== raw.sourceEffectId) {
      fail(`${path}.sourceIdentity.instanceId must match sourceEffectId`);
    }
  }
  if ("sourceCardSnapshot" in raw) {
    if ("sourceEffectId" in raw && version < 10) {
      fail(`${path}.sourceCardSnapshot requires schemaVersion 10`);
    }
    if (version >= 10) {
      const parsed = CardInstance.safeParse(raw.sourceCardSnapshot);
      if (!parsed.success) fail(`${path}.sourceCardSnapshot: ${parsed.error.message}`);
      if ("sourceIdentity" in raw) {
        const identity = raw.sourceIdentity;
        if (!record(identity) || (["instanceId", "cardId", "controller"] as const).some(key =>
          identity[key] !== parsed.data[key])) {
          fail(`${path}.sourceCardSnapshot disagrees with sourceIdentity`);
        }
      }
      if ("sourceEffectId" in raw && parsed.data.instanceId !== raw.sourceEffectId) {
        fail(`${path}.sourceCardSnapshot.instanceId must match sourceEffectId`);
      }
    }
  }
  const owner = typeof raw.sourceCardInstanceId === "string" ? raw.sourceCardInstanceId : raw.effectSourceInstanceId;
  if (version >= 10 && typeof owner === "string") {
    const simultaneous = record(raw.simultaneousGroup) ? raw.simultaneousGroup.resultRefs : undefined;
    for (const carrier of [raw.resultRefs, raw.costResultRefs, simultaneous]) {
      if (!Array.isArray(carrier)) continue;
      for (const entry of carrier) {
        const value = Array.isArray(entry) ? entry[1] : undefined;
        if (!record(value)) continue;
        if (record(value.sourceIdentity) && record(value.sourceCardSnapshot) &&
            (["instanceId", "cardId", "controller"] as const).some(key => (value.sourceIdentity as Raw)[key] !== (value.sourceCardSnapshot as Raw)[key])) {
          fail(`${path}.resultRefs sourceCardSnapshot disagrees with sourceIdentity`);
        }
        for (const origin of [value.sourceIdentity, value.sourceCardSnapshot]) {
          if (record(origin) && origin.instanceId !== owner) fail(`${path}.resultRefs sourceIdentity disagrees with its effect frame owner`);
        }
        // Only an authored COST owner proves this block relationship. Generic
        // ACTION and scheduled frames retain the original activation block ID.
        if (raw.kind === "COST" && record(raw.effectBlock) && raw.effectBlock.id !== "__engine_continuation__" &&
            Array.isArray(raw.effectBlock.costs) && record(value.sourceIdentity) &&
            value.sourceIdentity.effectBlockId !== raw.effectBlock.id) {
          fail(`${path}.resultRefs sourceIdentity disagrees with its authored COST owner`);
        }
      }
    }
  }
  for (const [key, child] of Object.entries(raw)) {
    validateScheduledSourceSnapshots(child, version, fail, path ? `${path}.${key}` : key);
  }
}
