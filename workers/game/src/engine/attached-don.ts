import type { CardInstance } from "../types.js";
import type { Trigger } from "./effect-types.js";

/** Rules 8-3-2-3: [DON!! xN] counts DON!! given to this source at activation. */
export function meetsAttachedDonRequirement(
  source: CardInstance,
  trigger: Trigger | undefined
): boolean {
  const requirement =
    trigger && "don_requirement" in trigger
      ? (trigger.don_requirement ?? 0)
      : 0;
  return source.attachedDon.length >= requirement;
}
