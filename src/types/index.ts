/**
 * Shared TypeScript types for the OPTCG Simulator.
 * These supplement Prisma-generated types with app-specific shapes.
 */

// ─── Card types ─────────────────────────────────────────────

export type CardColor =
  | "Red"
  | "Blue"
  | "Green"
  | "Purple"
  | "Black"
  | "Yellow";

export type CardAttribute =
  | "Strike"
  | "Slash"
  | "Ranged"
  | "Special"
  | "Wisdom";

export type CardRarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Super Rare"
  | "Secret Rare"
  | "Leader"
  | "Special"
  | "Treasure Rare"
  | "Promo";

// ─── Pipeline types ─────────────────────────────────────────

/** Raw card entry from vegapull JSON output */
export interface VegapullCard {
  id: string;
  pack_id: string;
  name: string;
  rarity: string;
  category: string;
  img_url: string;
  img_full_url: string;
  colors: string[];
  cost: number | null;
  attributes: string[];
  power: number | null;
  counter: number | null;
  types: string[];
  effect: string;
  trigger: string | null;
  block_number?: number | null;
}

/** Pack metadata from vegapull packs.json */
export interface VegapullPack {
  id: string;
  title: string;
  title_parts: {
    prefix: string | null;
    label: string | null;
    name: string;
  };
  release_date: string | null;
}

// ─── API types ──────────────────────────────────────────────

/** Card search/filter parameters */
export interface CardSearchParams {
  q?: string; // Full-text search query
  color?: CardColor[];
  type?: ("Leader" | "Character" | "Event" | "Stage")[];
  costMin?: number;
  costMax?: number;
  powerMin?: number;
  powerMax?: number;
  set?: string;
  traits?: string[];
  rarity?: string[];
  block?: number[];
  banStatus?: ("LEGAL" | "BANNED" | "RESTRICTED")[];
  page?: number;
  limit?: number;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
