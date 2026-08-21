/**
 * Scrape a pre-release booster from Limitless into vegapull-compatible JSON.
 *
 * Usage:
 *   pnpm pipeline:scrape-limitless -- --set op17-the-worlds-strongest-warriors --pack-id 569117
 */

import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";

import type { RawVegapullCard, VegapullPack } from "./load";

const BASE_URL = "https://onepiece.limitlesstcg.com/cards";
const OUTPUT_DIR = "data/vegapull-full/json";
const USER_AGENT = "OPTCG-Simulator/1.0 (card-data-pipeline)";
const REQUEST_DELAY_MS = 1_000;

const CATEGORIES = new Set(["Leader", "Character", "Event", "Stage"]);
const COLORS = new Set(["Red", "Blue", "Green", "Purple", "Black", "Yellow"]);
const ATTRIBUTES = new Set(["Strike", "Slash", "Ranged", "Special", "Wisdom"]);

const RARITY_MAP: Record<string, string> = {
  "Super Rare": "SuperRare",
  "Secret Rare": "SecretRare",
  "Special Card": "SpecialCard",
  "Treasure Rare": "TreasureRare",
};

export interface LimitlessCardReference {
  baseId: string;
  path: string;
  variantNumber: number | null;
}

interface ScrapeOptions {
  setSlug: string;
  packId: string;
  packTitle: string | null;
}

type CardFailures = Map<string, string[]>;

function requiredMatch(
  input: string,
  pattern: RegExp,
  context: string,
  field: string
): RegExpMatchArray {
  const match = input.match(pattern);
  if (!match) throw new Error(`${context}: no ${field} found`);
  return match;
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: "\u00a0",
    quot: '"',
  };

  return text.replace(
    /&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/gi,
    (entity, body: string) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
      }
      if (body.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
      }
      return named[body.toLowerCase()] ?? entity;
    }
  );
}

function stripTags(fragment: string): string {
  return decodeHtmlEntities(
    fragment.replace(/<br\s*\/?>/gi, "\u0000").replace(/<[^>]+>/g, "")
  );
}

function cleanWhitespace(text: string): string {
  return text
    .split("\u0000")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function splitValue(value: string): string[] {
  return value.split("/").map((part) => part.trim());
}

export function parseSetList(html: string): LimitlessCardReference[] {
  const setCode = requiredMatch(
    html,
    /data-location=["']([A-Z0-9-]+)["']/,
    "set list",
    "set code"
  )[1];
  const grid = requiredMatch(
    html,
    /<div class="card-search-grid">([\s\S]*?)<\/div>/,
    "set list",
    "card grid"
  )[1];
  const references = new Map<string, LimitlessCardReference>();
  const cardLink = /href=["']?\/cards\/([A-Z0-9]+-\d+)(?:\?v=(\d+))?["']?/g;

  for (const match of grid.matchAll(cardLink)) {
    const baseId = match[1];
    if (!baseId.startsWith(`${setCode}-`)) continue;

    const variantNumber = match[2] ? Number.parseInt(match[2], 10) : null;
    const path = `${baseId}${variantNumber === null ? "" : `?v=${variantNumber}`}`;
    references.set(path, { baseId, path, variantNumber });
  }

  if (references.size === 0) {
    throw new Error(`set list: no ${setCode} card links found`);
  }

  return [...references.values()].sort((left, right) => {
    if (left.variantNumber === null && right.variantNumber !== null) return -1;
    if (left.variantNumber !== null && right.variantNumber === null) return 1;
    return (
      left.baseId.localeCompare(right.baseId) ||
      (left.variantNumber ?? 0) - (right.variantNumber ?? 0)
    );
  });
}

export function parseCardPage(
  html: string,
  requestedId: string,
  packId: string
): RawVegapullCard {
  const imageUrl = requiredMatch(
    html,
    /<div class="card-image">\s*<img[^>]+src="([^"]+)"/,
    requestedId,
    "card image"
  )[1];
  const id = requiredMatch(
    imageUrl,
    /\/([A-Z0-9]+-\d+(?:_[a-z]\d+)?)_EN\.webp$/,
    requestedId,
    "canonical image ID"
  )[1];
  const name = stripTags(
    requiredMatch(
      html,
      /<span\s+class="card-text-name"[^>]*>([\s\S]*?)<\/span\s*>/,
      requestedId,
      "card name"
    )[1]
  ).trim();
  const typeLine = requiredMatch(
    html,
    /<p class="card-text-type">([\s\S]*?)<\/p>/,
    requestedId,
    "type line"
  )[1];
  const category = requiredMatch(
    typeLine,
    /data-tooltip="Category">([^<]+)<\/span>/,
    requestedId,
    "category"
  )[1].trim();
  const colors = splitValue(
    requiredMatch(
      typeLine,
      /data-tooltip="Color">([^<]+)<\/span>/,
      requestedId,
      "color"
    )[1]
  );
  const costMatch = typeLine.match(/(\d+)\s*(?:Cost|Life)/);
  const cost = costMatch ? Number.parseInt(costMatch[1], 10) : null;

  let power: number | null = null;
  let counter: number | null = null;
  let attributes: string[] = [];
  const statMatch = html.match(
    /<p class="card-text-section">\s*([\d,]+)\s*Power([\s\S]*?)<\/p>/
  );
  if (statMatch) {
    power = Number.parseInt(statMatch[1].replaceAll(",", ""), 10);
    const attributeMatch = statMatch[2].match(
      /data-tooltip="Attribute">([^<]+)<\/span>/
    );
    if (attributeMatch) attributes = splitValue(attributeMatch[1]);
    const counterMatch = statMatch[2].match(/\+(\d+)\s*Counter/);
    if (counterMatch) counter = Number.parseInt(counterMatch[1], 10);
  } else {
    const attributeMatch = html.match(
      /data-tooltip="Attribute">([^<]+)<\/span>/
    );
    if (attributeMatch) attributes = splitValue(attributeMatch[1]);
  }

  const typesMatch = html.match(/data-tooltip="Type">([^<]+)<\/span>/);
  const types = typesMatch ? splitValue(typesMatch[1]) : [];

  let effect = "";
  let trigger: string | null = null;
  let sawNonEmptyEffectSection = false;
  for (const section of html.matchAll(
    /<div class="card-text-section(?:\s[^"]*)?">([\s\S]*?)<\/div>/g
  )) {
    const body = section[1];
    if (
      section[0].includes("card-text-artist") ||
      body.includes("card-text-title") ||
      body.includes('data-tooltip="Type"')
    ) {
      continue;
    }
    if (body.trim()) sawNonEmptyEffectSection = true;
    // Limitless also wraps inline [Trigger] icons in double breaks, so preserve
    // those raw block boundaries until the final block is classified.
    const blocks = body
      .split(/(?:<br\s*\/?>\s*){2,}/i)
      .map((block) => cleanWhitespace(stripTags(block)))
      .filter(Boolean);
    if (blocks.length === 0) continue;

    const lastBlock = blocks[blocks.length - 1];
    const triggerMatch = lastBlock.match(/^\[Trigger\]\s*(\S)/);
    const precedingBlock = blocks[blocks.length - 2];
    const precedingBlockEndsSentence =
      precedingBlock !== undefined && /[.!?)]["'”’]?$/.test(precedingBlock);
    if (
      triggerMatch &&
      /^[A-Z]$/.test(triggerMatch[1]) &&
      (blocks.length === 1 || precedingBlockEndsSentence)
    ) {
      trigger = lastBlock.replace(/^\[Trigger\]\s*/, "[Trigger] ");
      blocks.pop();
    }

    effect = blocks.join(" ").replaceAll("\n", "<br>");
    break;
  }
  if (!effect) {
    if (sawNonEmptyEffectSection && trigger === null) {
      console.warn(
        `  ⚠ ${id}: non-empty effect section parsed to empty; effect set to "-"`
      );
    }
    effect = "-";
  }

  const rarityLabel = requiredMatch(
    html,
    /class="card-prints-current"[\s\S]*?<span>\s*([^<]+?)\s*<\/span>\s*<\/div>/,
    requestedId,
    "rarity"
  )[1].trim();
  const regulationMarkMatch = html.match(
    /class="regulation-mark">([\s\S]*?)<\/div>/
  );
  const rawRegulationMark = regulationMarkMatch
    ? cleanWhitespace(stripTags(regulationMarkMatch[1]))
    : "(missing)";
  const blockNumberMatch = rawRegulationMark.match(/\bBlock\s+(\d+)\b/i);
  const blockNumber = blockNumberMatch
    ? Number.parseInt(blockNumberMatch[1], 10)
    : null;
  if (blockNumber === null) {
    console.warn(
      `  ⚠ ${id}: regulation mark "${rawRegulationMark}" is not numeric; block_number set to null`
    );
  }

  return {
    id,
    pack_id: packId,
    name,
    rarity: RARITY_MAP[rarityLabel] ?? rarityLabel,
    category,
    img_url: imageUrl,
    img_full_url: imageUrl,
    cost,
    attributes,
    power,
    counter,
    colors,
    block_number: blockNumber,
    types,
    effect,
    trigger,
  };
}

function baseCardId(id: string): string {
  return id.replace(/_[a-z]\d+$/, "");
}

function addCardFailure(
  failures: CardFailures,
  cardId: string,
  message: string
): void {
  const messages = failures.get(cardId) ?? [];
  if (!messages.includes(message)) messages.push(message);
  failures.set(cardId, messages);
}

function formatCardFailures(failures: CardFailures): string {
  return `Failed to scrape ${failures.size} card(s):\n${[...failures.entries()]
    .map(([cardId, messages]) => `- ${cardId}: ${messages.join("; ")}`)
    .join("\n")}`;
}

function throwCardFailures(failures: CardFailures): void {
  if (failures.size > 0) throw new Error(formatCardFailures(failures));
}

function collectVariantRarityFailures(
  cards: RawVegapullCard[],
  failures: CardFailures
): RawVegapullCard[] {
  const baseRarities = new Map(
    cards
      .filter((card) => card.id === baseCardId(card.id))
      .map((card) => [card.id, card.rarity])
  );

  return cards.map((card) => {
    const baseId = baseCardId(card.id);
    if (card.id === baseId) return card;
    const rarity = baseRarities.get(baseId);
    if (!rarity) {
      addCardFailure(failures, card.id, `no base rarity found for ${baseId}`);
      return card;
    }
    return { ...card, rarity };
  });
}

export function inheritVariantRarities(
  cards: RawVegapullCard[]
): RawVegapullCard[] {
  const failures: CardFailures = new Map();
  const inherited = collectVariantRarityFailures(cards, failures);
  throwCardFailures(failures);
  return inherited;
}

function collectValidationFailures(
  cards: RawVegapullCard[],
  failures: CardFailures,
  checkSetShape = true
): void {
  const ids = new Set<string>();
  const baseCards = cards.filter((card) => card.id === baseCardId(card.id));
  const baseRarities = new Map(baseCards.map((card) => [card.id, card.rarity]));

  for (const card of cards) {
    if (ids.has(card.id))
      addCardFailure(failures, card.id, "duplicate card ID");
    ids.add(card.id);

    if (!CATEGORIES.has(card.category)) {
      addCardFailure(failures, card.id, `invalid category ${card.category}`);
    }
    for (const color of card.colors) {
      if (!COLORS.has(color)) {
        addCardFailure(failures, card.id, `invalid color ${color}`);
      }
    }
    for (const attribute of card.attributes) {
      if (!ATTRIBUTES.has(attribute)) {
        addCardFailure(failures, card.id, `invalid attribute ${attribute}`);
      }
    }
    if (!card.img_full_url.endsWith(`${card.id}_EN.webp`)) {
      addCardFailure(
        failures,
        card.id,
        "image URL does not match the canonical ID"
      );
    }
    if (card.category === "Leader" || card.category === "Character") {
      if (card.cost === null) {
        addCardFailure(failures, card.id, `${card.category} requires cost`);
      }
      if (card.power === null) {
        addCardFailure(failures, card.id, `${card.category} requires power`);
      }
      if (card.attributes.length === 0) {
        addCardFailure(
          failures,
          card.id,
          `${card.category} requires at least one attribute`
        );
      }
    }
    if (card.category === "Leader" && card.counter !== null) {
      addCardFailure(failures, card.id, "Leader requires a null counter");
    }
    if (
      (card.category === "Event" || card.category === "Stage") &&
      (card.power !== null || card.counter !== null)
    ) {
      addCardFailure(
        failures,
        card.id,
        `${card.category} requires null power and counter`
      );
    }
    if (card.types.length === 0) {
      addCardFailure(failures, card.id, "card requires at least one type");
    }

    const baseId = baseCardId(card.id);
    const baseRarity = baseRarities.get(baseId);
    if (card.id !== baseId && baseRarity && card.rarity !== baseRarity) {
      addCardFailure(
        failures,
        card.id,
        `variant rarity does not match ${baseId}`
      );
    }
  }

  if (!checkSetShape) return;
  const numberedBases = baseCards
    .flatMap((card) => {
      const match = card.id.match(/^([A-Z0-9]+)-(\d+)$/);
      if (!match) {
        addCardFailure(failures, card.id, "invalid base card ID");
        return [];
      }
      return [{ cardId: card.id, prefix: match[1], number: Number(match[2]) }];
    })
    .sort((left, right) => left.number - right.number);
  const expectedPrefix = numberedBases[0]?.prefix;
  for (const card of numberedBases) {
    if (card.prefix !== expectedPrefix) {
      addCardFailure(
        failures,
        card.cardId,
        "base card has a different set prefix"
      );
    }
  }
  numberedBases.forEach((card, index) => {
    const expected = index + 1;
    if (card.number !== expected) {
      addCardFailure(
        failures,
        card.cardId,
        `base numbering is not contiguous: expected ${expected}`
      );
    }
  });
}

export function validateCards(cards: RawVegapullCard[]): void {
  const failures: CardFailures = new Map();
  collectValidationFailures(cards, failures);
  throwCardFailures(failures);
}

function parseArguments(args: string[]): ScrapeOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key ?? "end of command"}`);
    }
    values.set(key, value);
  }

  const setSlug = values.get("--set");
  const packId = values.get("--pack-id");
  if (!setSlug || !packId) {
    throw new Error(
      "usage: --set <set-slug> --pack-id <pack-id> [--pack-title <title>]"
    );
  }
  if (!/^\d{6}$/.test(packId)) throw new Error("--pack-id must be six digits");
  for (const key of values.keys()) {
    if (!["--set", "--pack-id", "--pack-title"].includes(key)) {
      throw new Error(`unknown argument: ${key}`);
    }
  }

  return { setSlug, packId, packTitle: values.get("--pack-title") ?? null };
}

async function fetchHtml(path: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/${path}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(
      `${path}: Limitless returned ${response.status} ${response.statusText}`
    );
  }
  return response.text();
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function scrapeCardReferences(
  references: LimitlessCardReference[],
  packId: string,
  fetchPage: (path: string) => Promise<string> = fetchHtml,
  requestDelayMs = REQUEST_DELAY_MS
): Promise<RawVegapullCard[]> {
  const cards: RawVegapullCard[] = [];
  const failures: CardFailures = new Map();

  for (const [index, reference] of references.entries()) {
    if (requestDelayMs > 0) await sleep(requestDelayMs);
    try {
      const card = parseCardPage(
        await fetchPage(reference.path),
        reference.path,
        packId
      );
      cards.push(card);
      console.log(`[${index + 1}/${references.length}] Fetched ${card.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = message.startsWith(`${reference.path}:`)
        ? message.slice(reference.path.length + 1).trim()
        : message;
      addCardFailure(failures, reference.path, failure);
      console.error(
        `[${index + 1}/${references.length}] Failed ${reference.path}: ${failure}`
      );
    }
  }

  const inherited = collectVariantRarityFailures(cards, failures);
  collectValidationFailures(inherited, failures, failures.size === 0);
  throwCardFailures(failures);
  return inherited;
}

function packLabel(setCode: string): string {
  return setCode.replace(/^([A-Z]+)(\d+)$/, "$1-$2");
}

async function writePackEntry(
  outputDir: string,
  packId: string,
  packTitle: string,
  setCode: string
): Promise<void> {
  const packsPath = join(outputDir, "packs.json");
  let packs: Record<string, VegapullPack> = {};
  try {
    packs = JSON.parse(await readFile(packsPath, "utf8"));
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
  packs[packId] = {
    id: packId,
    raw_title: packTitle,
    title_parts: { prefix: null, title: packTitle, label: packLabel(setCode) },
  };
  await writeFile(packsPath, `${JSON.stringify(packs, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const listHtml = await fetchHtml(options.setSlug);
  const references = parseSetList(listHtml);
  const setCode = references[0].baseId.split("-")[0];
  console.log(`Found ${references.length} ${setCode} card pages.`);

  const parsedCards = await scrapeCardReferences(references, options.packId);

  const cards = parsedCards;
  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = join(OUTPUT_DIR, `cards_${options.packId}.json`);
  await writeFile(outputPath, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
  console.log(`Wrote ${cards.length} validated cards to ${outputPath}.`);

  if (options.packTitle) {
    await writePackEntry(
      OUTPUT_DIR,
      options.packId,
      options.packTitle,
      setCode
    );
    console.log(
      `Updated ${join(OUTPUT_DIR, "packs.json")} for pack ${options.packId}.`
    );
  } else {
    console.log(
      `Reminder: add a matching ${options.packId} entry to ${join(OUTPUT_DIR, "packs.json")} before importing, or rerun with --pack-title.`
    );
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
