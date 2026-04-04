import { z } from "zod";

export const SetUsernameSchema = z.object({
  username: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(3, "Username must be 3–20 characters")
        .max(20, "Username must be 3–20 characters")
        .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, and underscores"),
    ),
});

export type SetUsernameInput = z.infer<typeof SetUsernameSchema>;
