/**
 * OPT-953 schema-lint rule: permanent modifiers must be ones the value-layer
 * evaluator reads.
 *
 * `ModifierType` admits every action type, so a permanent block can author a
 * modifier that no engine code reads. OP15-070 Fuza and OP15-071 Holly carried
 * `SET_BASE_POWER` with `params.amount`; `getEffectiveBasePower` reads only
 * `SET_POWER` with `params.value`, so their "[Opponent's Turn] base power
 * becomes 6000" never applied. The allowed types and the param each reads come
 * from `PERMANENT_MODIFIER_PARAM` in `modifiers.ts`, the module that reads them.
 */
import type { EffectSchema } from "./effect-types.js";
import { PERMANENT_MODIFIER_PARAM } from "./modifiers.js";

export function findPermanentModifierTypeViolations(
  schemas: Record<string, EffectSchema>,
): string[] {
  const violations: string[] = [];
  for (const [cardId, schema] of Object.entries(schemas)) {
    for (const block of schema.effects) {
      if (block.category !== "permanent") continue;
      for (const [index, modifier] of (block.modifiers ?? []).entries()) {
        const where = `${cardId}: ${block.id}.modifiers[${index}]`;
        if (!Object.hasOwn(PERMANENT_MODIFIER_PARAM, modifier.type)) {
          violations.push(
            `${where} type ${modifier.type} is not read by the value-layer evaluator; use one of ${Object.keys(PERMANENT_MODIFIER_PARAM).join(", ")}`,
          );
          continue;
        }
        const param = PERMANENT_MODIFIER_PARAM[modifier.type];
        if (param && modifier.params?.[param] === undefined) {
          violations.push(`${where} ${modifier.type} needs params.${param}`);
        }
      }
    }
  }
  return violations;
}
