import { z } from "zod";

export const SendMessageSchema = z.object({
  body: z
    .string()
    .min(1, "Message body is required")
    .max(2000, "Message body must be 2000 characters or fewer")
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Message body is required")),
});
