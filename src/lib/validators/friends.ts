import { z } from "zod";

export const SendFriendRequestSchema = z.object({
  toUserId: z.string().min(1, "toUserId is required"),
});

export type SendFriendRequestInput = z.infer<typeof SendFriendRequestSchema>;

export const FriendRequestActionSchema = z.object({
  action: z.enum(["accept", "decline"], {
    error: "action must be 'accept' or 'decline'",
  }),
});

export type FriendRequestActionInput = z.infer<typeof FriendRequestActionSchema>;
