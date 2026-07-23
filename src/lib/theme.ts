/**
 * Theme contract:
 * - `default` is defined by `:root` and is rendered without a data attribute.
 * - Every other registry entry must have a matching
 *   `html[data-theme="<name>"]` block in globals.css.
 * - Theme blocks override primitive tokens only. Semantic and feature tokens
 *   stay unchanged.
 * - Every registered theme must pass the token contrast check (OPT-516).
 *
 * Keeping the registry as strings (instead of a database enum) makes adding a
 * theme a registry + CSS-only change with no component or migration changes.
 */
export const THEME_REGISTRY = ["default"] as const;

export type ThemeName = (typeof THEME_REGISTRY)[number];

export const DEFAULT_THEME: ThemeName = "default";
export const THEME_COOKIE_NAME = "optcg-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEME_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: THEME_COOKIE_MAX_AGE,
} as const;

export function isThemeName(value: unknown): value is ThemeName {
  return (
    typeof value === "string" &&
    (THEME_REGISTRY as readonly string[]).includes(value)
  );
}

export function resolveThemeName(value: unknown): ThemeName {
  return isThemeName(value) ? value : DEFAULT_THEME;
}

export function themeDataAttribute(theme: ThemeName): string | undefined {
  return theme === DEFAULT_THEME ? undefined : theme;
}
