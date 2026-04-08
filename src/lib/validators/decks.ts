import { z } from "zod";

const DeckCardSchema = z.object({
  cardId: z.string().min(1),
  quantity: z.number().int().min(1).max(4),
  selectedArtUrl: z.string().nullable().optional(),
});

const TestDeckOrderSchema = z
  .object({
    life: z.array(z.string().min(1)),
    hand: z.array(z.string().min(1)).length(5),
  })
  .nullable()
  .optional();

export const CreateDeckSchema = z.object({
  name: z.string().min(1, "Name is required"),
  leaderId: z.string().min(1, "leaderId is required"),
  leaderArtUrl: z.string().nullable().optional(),
  sleeveUrl: z.string().nullable().optional(),
  donArtUrl: z.string().nullable().optional(),
  testOrder: TestDeckOrderSchema,
  format: z.string().optional(),
  cards: z.array(DeckCardSchema).optional(),
});

export const UpdateDeckSchema = z.object({
  name: z.string().min(1).optional(),
  leaderId: z.string().min(1).optional(),
  leaderArtUrl: z.string().nullable().optional(),
  sleeveUrl: z.string().nullable().optional(),
  donArtUrl: z.string().nullable().optional(),
  testOrder: TestDeckOrderSchema,
  format: z.string().optional(),
  cards: z.array(DeckCardSchema).optional(),
});

export const ImportDeckSchema = z.object({
  text: z.string().min(1, "Text field is required"),
});

