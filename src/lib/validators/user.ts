import { z } from "zod";
import { isThemeName, type ThemeName } from "@/lib/theme";

export const SetUsernameSchema = z.object({
  username: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(3, "Username must be 3–20 characters")
        .max(20, "Username must be 3–20 characters")
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          "Username can only contain letters, numbers, hyphens, and underscores"
        )
    ),
});

export const SetUsernameResponseSchema = z.object({
  data: z.object({ username: z.string() }),
});

export const SetThemeSchema = z.object({
  theme: z.custom<ThemeName>(isThemeName, "Theme is not registered"),
});

export const ThemeResponseSchema = z.object({
  data: z.object({ theme: SetThemeSchema.shape.theme }),
});
