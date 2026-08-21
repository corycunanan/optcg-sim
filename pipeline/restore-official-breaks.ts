/**
 * Restore official Effect and Trigger `<br>` separators after a vega pull.
 *
 * Required immediately after every per-pack pull:
 *   pnpm pipeline:restore-official-breaks -- --pack-id 569117
 *
 * The script validates every field after replacing `<br>` with spaces and
 * collapsing whitespace. It writes nothing if any card's wording differs.
 */

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";

import type { RawVegapullCard } from "./load";

const BASE_URL = "https://en.onepiece-cardgame.com/cardlist/";
const DEFAULT_DATA_DIR = "data/vegapull-full/json";
const USER_AGENT = "OPTCG-Simulator/1.0 (card-data-pipeline)";
const BREAK_PATTERN = /<br\s*\/?>/gi;

export interface OfficialCardText {
  effect: string;
  trigger: string | null;
}

export interface RestorationResult {
  cards: RawVegapullCard[];
  restoredCards: number;
  restoredFields: number;
}

interface RestoreOptions {
  packId: string;
  dataDir: string;
}

function attribute(attributes: string, name: string): string | null {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i")
  );
  return match?.[1] ?? null;
}

function hasClass(attributes: string, className: string): boolean {
  return (attribute(attributes, "class") ?? "")
    .split(/\s+/)
    .includes(className);
}

function extractField(
  cardBody: string,
  className: "text" | "trigger",
  cardId: string
): string | null {
  for (const match of cardBody.matchAll(
    /<div\b([^>]*)>([\s\S]*?)<\/div\s*>/gi
  )) {
    if (!hasClass(match[1], className)) continue;

    const withoutHeading = match[2].replace(
      /^\s*<h3\b[^>]*>[\s\S]*?<\/h3\s*>\s*/i,
      ""
    );
    const withBreakMarkers = withoutHeading.replace(BREAK_PATTERN, "\u0000");
    const unexpectedTag = withBreakMarkers.match(/<[^>]+>/);
    if (unexpectedTag) {
      throw new Error(
        `${cardId} ${className}: unsupported official markup ${unexpectedTag[0]}`
      );
    }

    return withBreakMarkers
      .split("\u0000")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("<br>");
  }

  return null;
}

export function parseOfficialCardlist(
  html: string
): Map<string, OfficialCardText> {
  const cards = new Map<string, OfficialCardText>();

  for (const match of html.matchAll(/<dl\b([^>]*)>([\s\S]*?)<\/dl\s*>/gi)) {
    const attributes = match[1];
    if (!hasClass(attributes, "modalCol")) continue;

    const cardId = attribute(attributes, "id");
    if (!cardId || !/^[A-Z0-9]+-\d+(?:_[pr]\d+)?$/.test(cardId)) {
      throw new Error(
        "official cardlist contains a modal without a valid card ID"
      );
    }
    if (cards.has(cardId)) {
      throw new Error(`${cardId}: duplicate official cardlist entry`);
    }

    const effect = extractField(match[2], "text", cardId);
    if (effect === null) {
      throw new Error(`${cardId}: official cardlist entry has no Effect field`);
    }
    cards.set(cardId, {
      effect,
      trigger: extractField(match[2], "trigger", cardId),
    });
  }

  if (cards.size === 0) {
    throw new Error("official cardlist contains no card modals");
  }
  return cards;
}

function normalizedText(value: string | null): string {
  return (value ?? "").replace(BREAK_PATTERN, " ").replace(/\s+/g, " ").trim();
}

function assertSameWording(
  cardId: string,
  field: "effect" | "trigger",
  pulled: string | null,
  official: string | null
): void {
  const normalizedPulled = normalizedText(pulled);
  const normalizedOfficial = normalizedText(official);
  if (normalizedPulled !== normalizedOfficial) {
    throw new Error(
      `${cardId} ${field} wording differs: pulled ${JSON.stringify(normalizedPulled)}; official ${JSON.stringify(normalizedOfficial)}`
    );
  }
}

function breakCount(value: string | null): number {
  return value?.match(BREAK_PATTERN)?.length ?? 0;
}

export function formattingLossWarning(
  cards: RawVegapullCard[],
  officialCards: ReadonlyMap<string, OfficialCardText>,
  packId: string
): string | null {
  const pulledBreaks = cards.reduce(
    (total, card) => total + breakCount(card.effect),
    0
  );
  const officialBreaks = cards.reduce(
    (total, card) =>
      total + breakCount(officialCards.get(card.id)?.effect ?? null),
    0
  );

  if (pulledBreaks !== 0 || officialBreaks === 0) return null;
  return `  ⚠ Pack ${packId} may have lost effect formatting: pulled JSON has 0 <br> separators; official HTML has ${officialBreaks}. Run the restoration before import.`;
}

export function restoreOfficialFormatting(
  cards: RawVegapullCard[],
  officialCards: ReadonlyMap<string, OfficialCardText>
): RestorationResult {
  let restoredFields = 0;
  const restoredCardIds = new Set<string>();

  const restoredCards = cards.map((card) => {
    const official = officialCards.get(card.id);
    if (!official) {
      throw new Error(`${card.id}: no official cardlist entry found`);
    }

    assertSameWording(card.id, "effect", card.effect, official.effect);
    assertSameWording(card.id, "trigger", card.trigger, official.trigger);

    const effectChanged = card.effect !== official.effect;
    const triggerChanged = card.trigger !== official.trigger;
    if (effectChanged) restoredFields += 1;
    if (triggerChanged) restoredFields += 1;
    if (effectChanged || triggerChanged) restoredCardIds.add(card.id);

    return {
      ...card,
      effect: official.effect,
      trigger: official.trigger,
    };
  });

  return {
    cards: restoredCards,
    restoredCards: restoredCardIds.size,
    restoredFields,
  };
}

function parseArguments(args: string[]): RestoreOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key ?? "end of command"}`);
    }
    values.set(key, value);
  }

  const packId = values.get("--pack-id");
  if (!packId) {
    throw new Error("usage: --pack-id <pack-id> [--data-dir <path>]");
  }
  if (!/^\d{6}$/.test(packId)) throw new Error("--pack-id must be six digits");
  for (const key of values.keys()) {
    if (!["--pack-id", "--data-dir"].includes(key)) {
      throw new Error(`unknown argument: ${key}`);
    }
  }

  return { packId, dataDir: values.get("--data-dir") ?? DEFAULT_DATA_DIR };
}

async function fetchOfficialCardlist(packId: string): Promise<string> {
  const url = new URL(BASE_URL);
  url.searchParams.set("series", packId);
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(
      `official cardlist returned ${response.status} ${response.statusText}`
    );
  }
  return response.text();
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const cardsPath = join(options.dataDir, `cards_${options.packId}.json`);
  const [cardsContents, officialHtml] = await Promise.all([
    readFile(cardsPath, "utf8"),
    fetchOfficialCardlist(options.packId),
  ]);
  const cards: RawVegapullCard[] = JSON.parse(cardsContents);
  if (!Array.isArray(cards)) throw new Error(`${cardsPath}: expected an array`);

  const officialCards = parseOfficialCardlist(officialHtml);
  const warning = formattingLossWarning(cards, officialCards, options.packId);
  if (warning) console.warn(warning);

  const result = restoreOfficialFormatting(cards, officialCards);
  await writeFile(
    cardsPath,
    `${JSON.stringify(result.cards, null, 2)}\n`,
    "utf8"
  );
  console.log(
    `Restored ${result.restoredFields} Effect/Trigger field(s) across ${result.restoredCards} card(s) in ${cardsPath}.`
  );
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
