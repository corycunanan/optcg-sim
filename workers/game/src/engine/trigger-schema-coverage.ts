import type { EffectSchema } from "./effect-types.js";

export interface CanonicalCardTextFacts {
  hasRealEffectText: boolean;
  hasTriggerText: boolean;
}

export type CardTextManifest = Record<string, CanonicalCardTextFacts>;

export function findMissingTriggerSchemas(
  manifest: Readonly<CardTextManifest>,
  schemas: Readonly<Record<string, EffectSchema>>
): string[] {
  return Object.entries(manifest)
    .filter(([, facts]) => facts.hasTriggerText)
    .map(([cardId]) => cardId)
    .filter((cardId) => {
      const schema = schemas[cardId];
      return !schema?.effects.some(
        (block) =>
          block.trigger &&
          "keyword" in block.trigger &&
          block.trigger.keyword === "TRIGGER"
      );
    })
    .sort();
}
