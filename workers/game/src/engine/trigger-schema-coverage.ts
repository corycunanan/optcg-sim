import type { EffectSchema } from "./effect-types.js";
import { derivePrintedKeywords } from "./printed-keywords.js";
import type { CardData } from "../types.js";

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

export function findDerivedTriggersWithoutSchemaBlocks(
  manifest: Readonly<CardTextManifest>,
  schemas: Readonly<Record<string, EffectSchema>>
): string[] {
  const cardIds = new Set([
    ...Object.keys(manifest),
    ...Object.keys(schemas),
  ]);

  return [...cardIds]
    .filter((cardId) => {
      const facts = manifest[cardId] ?? {
        hasRealEffectText: false,
        hasTriggerText: false,
      };
      const schema = schemas[cardId] ?? null;
      const cardData: CardData = {
        id: cardId,
        name: cardId,
        type: "Character",
        color: [],
        cost: null,
        power: null,
        counter: null,
        life: null,
        attribute: [],
        types: [],
        effectText: "",
        triggerText: facts.hasTriggerText ? "[Trigger]" : null,
        keywords: {
          rush: false,
          rushCharacter: false,
          doubleAttack: false,
          banish: false,
          blocker: false,
          trigger: false,
          unblockable: false,
        },
        effectSchema: schema,
        imageUrl: null,
      };
      return (
        derivePrintedKeywords(cardData, schema).trigger &&
        !schema?.effects.some(isDirectTriggerBlock)
      );
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
