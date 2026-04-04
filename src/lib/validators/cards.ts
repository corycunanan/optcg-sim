import { z } from "zod";

const CardTypeEnum = z.enum(["Leader", "Character", "Event", "Stage"]);

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
  banStatus: z.enum(["LEGAL", "BANNED", "RESTRICTED"]).optional().default("LEGAL"),
});

export type CreateCardInput = z.infer<typeof CreateCardSchema>;

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
  banStatus: z.enum(["LEGAL", "BANNED", "RESTRICTED"]).optional(),
  isReprint: z.boolean().optional(),
});

export type UpdateCardInput = z.infer<typeof UpdateCardSchema>;
