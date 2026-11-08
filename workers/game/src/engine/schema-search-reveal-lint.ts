/**
 * OPT-916 schema-lint rule for SEARCH_AND_PLAY `reveal`.
 *
 * "Reveal N card(s) from the top of your deck … play up to 1 …" shows the
 * group to both players; "look at N cards … play up to 1 …" does not. The
 * engine encodes the difference with `SEARCH_AND_PLAY.params.reveal: true`
 * (executeSearchAndPlay emits a public CARDS_REVEALED). Rule 11-3-1 keeps a
 * look private to its player, so the param must follow the printed verb:
 *
 * - canonical "reveal … from the top of your deck" on a card whose schema
 *   plays from the top through SEARCH_AND_PLAY needs `reveal: true` (or an
 *   explicit deck-top REVEAL action) in that schema;
 * - `reveal: true` on a card whose canonical text never says "reveal" would
 *   publish a private look and is rejected.
 *
 * Kept out of `validateEffectSchema` on purpose: that validator also gates
 * DB-loaded card data at runtime, and this is an authoring rule over the
 * canonical text, not a wire-shape contract.
 */
import type { EffectSchema } from "./effect-types.js";

export interface CanonicalCardBlock {
  cardId: string;
  text: string;
}

const REVEAL_FROM_DECK_TOP = /\breveal (?:up to )?\d+ cards? from the top of your deck\b/i;

interface SearchRevealFacts {
  searchAndPlay: number;
  searchAndPlayRevealed: number;
  deckTopRevealAction: boolean;
}

function collectFacts(node: unknown, facts: SearchRevealFacts): void {
  if (Array.isArray(node)) {
    for (const child of node) collectFacts(child, facts);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const params = (record.params && typeof record.params === "object"
    ? record.params
    : {}) as Record<string, unknown>;
  if (record.type === "SEARCH_AND_PLAY" && params.search_full_deck !== true) {
    facts.searchAndPlay++;
    if (params.reveal === true) facts.searchAndPlayRevealed++;
  }
  if (
    record.type === "REVEAL" &&
    (params.source === undefined || params.source === "DECK" || params.source === "DECK_TOP") &&
    params.visibility !== "CONTROLLER_ONLY" &&
    [undefined, "CARD_ON_TOP_OF_DECK"].includes(
      (record.target as { type?: unknown } | undefined)?.type as string | undefined,
    )
  ) {
    facts.deckTopRevealAction = true;
  }
  for (const value of Object.values(record)) collectFacts(value, facts);
}

export function findSearchAndPlayRevealIntentViolations(
  blocks: readonly CanonicalCardBlock[],
  schemas: Record<string, EffectSchema>,
): string[] {
  const textByCard = new Map(blocks.map((block) => [block.cardId, block.text]));
  const violations: string[] = [];
  for (const [cardId, schema] of Object.entries(schemas)) {
    const facts: SearchRevealFacts = {
      searchAndPlay: 0,
      searchAndPlayRevealed: 0,
      deckTopRevealAction: false,
    };
    collectFacts(schema.effects, facts);
    if (facts.searchAndPlay === 0) continue;
    const text = (textByCard.get(cardId) ?? "").replace(/\s+/g, " ");
    if (
      REVEAL_FROM_DECK_TOP.test(text) &&
      facts.searchAndPlayRevealed === 0 &&
      !facts.deckTopRevealAction
    ) {
      violations.push(
        `${cardId}: canonical "reveal … from the top of your deck" requires SEARCH_AND_PLAY params.reveal: true so both players see the revealed card`,
      );
    }
    if (facts.searchAndPlayRevealed > 0 && !/\breveal/i.test(text)) {
      violations.push(
        `${cardId}: SEARCH_AND_PLAY params.reveal: true publishes a private "look at"; the canonical text never says reveal`,
      );
    }
  }
  return violations;
}
