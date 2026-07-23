import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  isThemeName,
  resolveThemeName,
  themeDataAttribute,
} from "./theme";

describe("theme registry", () => {
  it("accepts registered theme names", () => {
    expect(isThemeName(DEFAULT_THEME)).toBe(true);
  });

  it("falls back to the default for stale or malformed values", () => {
    expect(resolveThemeName("unregistered")).toBe(DEFAULT_THEME);
    expect(resolveThemeName(undefined)).toBe(DEFAULT_THEME);
  });

  it("omits the data-theme attribute for the default theme", () => {
    expect(themeDataAttribute(DEFAULT_THEME)).toBeUndefined();
  });
});
