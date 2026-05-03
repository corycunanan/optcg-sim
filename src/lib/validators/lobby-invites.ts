import { z } from "zod";

export const SendLobbyInviteSchema = z.object({
  toUserId: z.string().min(1, "toUserId is required"),
});
