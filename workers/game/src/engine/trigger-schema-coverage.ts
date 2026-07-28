import type { EffectSchema } from "./effect-types.js";

export interface CanonicalCardTextFacts {
  hasRealEffectText: boolean;
  hasTriggerText: boolean;
}

export type CardTextManifest = Record<string, CanonicalCardTextFacts>;

function isDirectTriggerBlock(
  block: EffectSchema["effects"][number]
): boolean {
  return (
    block.trigger !== undefined &&
    "keyword" in block.trigger &&
    block.trigger.keyword === "TRIGGER"
  );
}

export function findMissingTriggerSchemas(
  manifest: Readonly<CardTextManifest>,
  schemas: Readonly<Record<string, EffectSchema>>
): string[] {
  return Object.entries(manifest)
    .filter(([, facts]) => facts.hasTriggerText)
    .map(([cardId]) => cardId)
    .filter((cardId) => {
      const schema = schemas[cardId];
      return !schema?.effects.some(isDirectTriggerBlock);
    })
    .sort();
}

export function findSchemasWithMultipleTriggerBlocks(
  schemas: Readonly<Record<string, EffectSchema>>
): string[] {
  return Object.entries(schemas)
    .filter(
      ([, schema]) => schema.effects.filter(isDirectTriggerBlock).length > 1
    )
    .map(([cardId]) => cardId)
    .sort();
}
