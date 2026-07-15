/**
 * Step 2: Transform vegapull raw data to our internal schema.
 *
 * - Decode HTML entities in names and effect text
 * - Sanitize effect text (<br> → newlines, strip HTML)
 * - Map category → CardType
 * - Derive originSet from card ID prefix
 * - Normalize fields
 */

import type { RawVegapullCard, PackMap } from "./load";
import {
  cardIdToOriginSet,
  decodeHtmlEntities,
  detectVariantType,
  stripVariantSuffix,
} from "@shared/card-parsing";

export interface TransformedCard {
  /** Full vegapull ID including suffix (e.g. "OP01-001_p1") */
  vegapullId: string;
  /** Base card ID without suffix (e.g. "OP01-001") */
  baseId: string;
  /** Variant type: "base", "parallel", or "reprint" */
  variantType: "base" | "parallel" | "reprint";
  /** Pack ID from vegapull (e.g. "569101") */
  packId: string;
  /** Origin set derived from card ID prefix (e.g. "OP-01") */
  originSet: string;
  /** Card name with HTML entities decoded */
  name: string;
  /** Card type enum */
  type: "Leader" | "Character" | "Event" | "Stage";
  /** Card colors */
  color: string[];
  /** Mana cost (null for Leaders) */
  cost: number | null;
  /** Life value (Leaders only — sourced from vegapull `cost` field) */
  life: number | null;
  /** Power value */
  power: number | null;
  /** Counter value */
  counter: number | null;
  /** Attributes (Strike, Slash, Ranged, Special, Wisdom) */
  attribute: string[];
  /** Traits (e.g. ["Straw Hat Crew"]) */
  traits: string[];
  /** Card rarity */
  rarity: string;
  /** Sanitized effect text */
  effectText: string;
  /** Trigger text */
  triggerText: string | null;
  /** Full image URL from vegapull */
  imageUrl: string;
  /** Block number for rotation */
  blockNumber: number;
}

// ─── Effect text sanitization ───────────────────────────────

// The five card attributes are rendered as bracketed tokens in effect text,
// either HTML-encoded (`&lt;Slash&gt;`) or with fullwidth brackets (`＜Slash＞`).
// Once entities are decoded, `<Slash>` looks like an HTML tag, so it must be
// unwrapped to the bare name BEFORE tag stripping — otherwise the attribute
// name is silently deleted (e.g. "has the <Slash> attribute" → "has the  attribute").
const ATTRIBUTE_TOKEN = /[<＜](Slash|Strike|Ranged|Special|Wisdom)[>＞]/g;

// Real HTML tags in vegapull text are lowercase (<br>, <i>, <span>); a leftover
// capitalized bracket token after ATTRIBUTE_TOKEN unwrapping means content the
// generic tag-strip below would silently delete (a new/variant attribute token).
// Warn loudly instead of letting the whitespace collapse erase the evidence.
const SUSPICIOUS_TOKEN = /<[A-Z][^>]*>/g;

export function sanitizeEffectText(text: string, warnContext?: string): string {
  if (!text || text === "-") return "";
  const unwrapped = decodeHtmlEntities(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(ATTRIBUTE_TOKEN, "$1");
  const suspicious = unwrapped.match(SUSPICIOUS_TOKEN);
  if (suspicious) {
    console.warn(
      `  ⚠ sanitizeEffectText${warnContext ? ` [${warnContext}]` : ""}: stripping unrecognized token(s) ${suspicious.join(" ")} — if this is a new attribute token, add it to ATTRIBUTE_TOKEN`
    );
  }
  return unwrapped
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Category → CardType mapping ────────────────────────────

function mapCategory(
  category: string
): "Leader" | "Character" | "Event" | "Stage" | null {
  switch (category) {
    case "Leader":
      return "Leader";
    case "Character":
      return "Character";
    case "Event":
      return "Event";
    case "Stage":
      return "Stage";
    default:
      return null;
  }
}

// ─── Main transform ─────────────────────────────────────────

export function transformCards(
  rawCards: RawVegapullCard[],
  _packs: PackMap // reserved for future pack-level transforms
): TransformedCard[] {
  const transformed: TransformedCard[] = [];
  const skipped: string[] = [];

  for (const raw of rawCards) {
    // Skip DON!! cards if any slip through
    const type = mapCategory(raw.category);
    if (!type) {
      skipped.push(`${raw.id} (category: ${raw.category})`);
      continue;
    }

    const baseId = stripVariantSuffix(raw.id);
    const variantType = detectVariantType(raw.id);
    const originSet = cardIdToOriginSet(baseId);

    const isLeader = type === "Leader";

    transformed.push({
      vegapullId: raw.id,
      baseId,
      variantType,
      packId: raw.pack_id,
      originSet,
      name: decodeHtmlEntities(raw.name),
      type,
      color: raw.colors,
      cost: isLeader ? null : raw.cost,
      life: isLeader ? raw.cost : null,
      power: raw.power,
      counter: raw.counter,
      attribute: raw.attributes,
      traits: raw.types,
      rarity: raw.rarity,
      effectText: sanitizeEffectText(raw.effect, raw.id),
      triggerText: sanitizeEffectText(raw.trigger ?? "", raw.id) || null,
      imageUrl: raw.img_full_url,
      blockNumber: raw.block_number ?? 0,
    });
  }

  if (skipped.length > 0) {
    console.log(`  ⚠ Skipped ${skipped.length} entries: ${skipped.join(", ")}`);
  }

  return transformed;
}
