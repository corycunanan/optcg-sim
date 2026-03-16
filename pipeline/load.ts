/**
 * Step 1: Load vegapull JSON data from disk.
 *
 * Reads packs.json and all cards_*.json files from the vegapull output directory.
 */

import { readFile, readdir } from "fs/promises";
import { join } from "path";

export interface RawVegapullCard {
  id: string;
  pack_id: string;
  name: string;
  rarity: string;
  category: string;
  img_url: string;
  img_full_url: string;
  cost: number | null;
  attributes: string[];
  power: number | null;
  counter: number | null;
  colors: string[];
  block_number: number | null;
  types: string[];
  effect: string;
  trigger: string | null;
}

export interface VegapullPack {
  id: string;
  raw_title: string;
  title_parts: {
    prefix: string | null;
    title: string;
    label: string | null;
  };
}

export type PackMap = Record<string, VegapullPack>;

export async function loadVegapullData(dataDir: string): Promise<{
  packs: PackMap;
  rawCards: RawVegapullCard[];
}> {
  // Load packs
  const packsPath = join(dataDir, "packs.json");
  const packsRaw = await readFile(packsPath, "utf-8");
  const packs: PackMap = JSON.parse(packsRaw);

  // Load all card files
  const files = await readdir(dataDir);
  const cardFiles = files
    .filter((f) => f.startsWith("cards_") && f.endsWith(".json"))
    .sort();

  const rawCards: RawVegapullCard[] = [];

  for (const file of cardFiles) {
    const filePath = join(dataDir, file);
    const content = await readFile(filePath, "utf-8");
    const cards: RawVegapullCard[] = JSON.parse(content);
    rawCards.push(...cards);
  }

  return { packs, rawCards };
}
