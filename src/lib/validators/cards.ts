import { z } from "zod";

const CardTypeEnum = z.enum(["Leader", "Character", "Event", "Stage"]);
const BanStatusEnum = z.enum(["LEGAL", "BANNED", "RESTRICTED"]);

// ─── Query param validation (GET /api/cards) ────────────────

export const CardSearchParamsSchema = z.object({
  q: z.string().optional(),
  color: z.string().optional(),
  type: z.string().optional(),
  costMin: z.string().optional(),
  costMax: z.string().optional(),
  powerMin: z.string().optional(),
  powerMax: z.string().optional(),
  set: z.string().optional(),
  block: z.string().optional(),
  rarity: z.string().optional(),
  ban: z.string().optional(),
  traits: z.string().optional(),
  attribute: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().optional(),
  order: z.string().optional(),
});

// ─── Response schemas ───────────────────────────────────────

/** Shape returned by CARD_SELECT in API routes. */
export const CardResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.array(z.string()),
  type: z.string(),
  cost: z.number().nullable(),
  power: z.number().nullable(),
  counter: z.number().nullable(),
  life: z.number().nullable(),
  imageUrl: z.string(),
  banStatus: z.string(),
  blockNumber: z.number(),
  traits: z.array(z.string()),
  attribute: z.array(z.string()),
  effectText: z.string(),
  triggerText: z.string().nullable(),
  rarity: z.string(),
  originSet: z.string(),
});

export type CardResponse = z.infer<typeof CardResponseSchema>;

/** GET /api/cards response envelope. */
export const CardSearchResponseSchema = z.object({
  data: z.array(CardResponseSchema.extend({
    artVariants: z.array(z.unknown()).optional(),
    cardSets: z.array(z.unknown()).optional(),
  })),
  pagination: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
});

export type CardSearchResponse = z.infer<typeof CardSearchResponseSchema>;

/** GET /api/decks/[id] — card entry within a deck response. */
export const DeckCardResponseSchema = z.object({
  cardId: z.string(),
  quantity: z.number(),
  selectedArtUrl: z.string().nullable(),
  card: CardResponseSchema,
});

/** GET /api/decks/[id] response envelope. */
export const DeckDetailResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    format: z.string().nullable(),
    leaderId: z.string(),
    leaderArtUrl: z.string().nullable(),
    sleeveUrl: z.string().nullable(),
    donArtUrl: z.string().nullable(),
    testOrder: z.unknown().nullable(),
    updatedAt: z.string(),
    cards: z.array(DeckCardResponseSchema),
    leader: CardResponseSchema.nullable(),
  }).passthrough(),
});

export type DeckDetailResponse = z.infer<typeof DeckDetailResponseSchema>;

/** Partial card shape returned by the import endpoint (fewer fields than CARD_SELECT). */
const ImportCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  color: z.array(z.string()),
  cost: z.number().nullable(),
  power: z.number().nullable(),
  imageUrl: z.string(),
  traits: z.array(z.string()),
});

/** POST /api/decks/import response envelope. */
export const DeckImportResponseSchema = z.object({
  data: z.object({
    leader: z.object({
      cardId: z.string(),
      card: ImportCardSchema,
    }).nullable(),
    cards: z.array(z.object({
      cardId: z.string(),
      quantity: z.number(),
      card: ImportCardSchema,
    })),
    errors: z.array(z.object({
      line: z.number(),
      raw: z.string(),
      error: z.string().nullable(),
    })),
    totalLines: z.number(),
  }),
});

export type DeckImportResponse = z.infer<typeof DeckImportResponseSchema>;

// ─── Input schemas ──────────────────────────────────────────

export const CreateCardSchema = z.object({
  id: z.string().min(1, "id is required"),
  name: z.string().min(1, "name is required"),
  type: CardTypeEnum,
  color: z.array(z.string()).min(1, "color is required"),
  blockNumber: z.number({ error: "blockNumber is required" }),
  cost: z.number().nullable().optional(),
  power: z.number().nullable().optional(),
  counter: z.number().nullable().optional(),
  life: z.number().nullable().optional(),
  attribute: z.array(z.string()).optional().default([]),
  traits: z.array(z.string()).optional().default([]),
  rarity: z.string().optional().default("Unknown"),
  effectText: z.string().optional().default(""),
  triggerText: z.string().nullable().optional(),
  imageUrl: z.string().optional().default(""),
  banStatus: BanStatusEnum.optional().default("LEGAL"),
});

export const UpdateCardSchema = z.object({
  name: z.string().optional(),
  type: CardTypeEnum.optional(),
  color: z.array(z.string()).optional(),
  cost: z.number().nullable().optional(),
  power: z.number().nullable().optional(),
  counter: z.number().nullable().optional(),
  life: z.number().nullable().optional(),
  attribute: z.array(z.string()).optional(),
  traits: z.array(z.string()).optional(),
  rarity: z.string().optional(),
  effectText: z.string().optional(),
  triggerText: z.string().nullable().optional(),
  imageUrl: z.string().optional(),
  blockNumber: z.number().optional(),
  banStatus: BanStatusEnum.optional(),
  isReprint: z.boolean().optional(),
});

