import { describe, expect, it } from "vitest";
import {
  isAuthorizedBearer,
  timingSafeEqualStrings,
} from "@shared/bearer-auth";

describe("timingSafeEqualStrings", () => {
  it("matches only identical strings", () => {
    expect(timingSafeEqualStrings("abc", "abc")).toBe(true);
    expect(timingSafeEqualStrings("", "")).toBe(true);
    expect(timingSafeEqualStrings("abc", "abd")).toBe(false);
    expect(timingSafeEqualStrings("abc", "ab")).toBe(false);
    expect(timingSafeEqualStrings("ab", "abc")).toBe(false);
    expect(timingSafeEqualStrings("abc", "")).toBe(false);
  });

  it("compares multi-byte characters by their encoded bytes", () => {
    expect(timingSafeEqualStrings("é", "é")).toBe(true);
    expect(timingSafeEqualStrings("é", "e")).toBe(false);
  });
});

describe("isAuthorizedBearer", () => {
  it("accepts exactly Bearer plus the secret", () => {
    expect(isAuthorizedBearer("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects wrong, partial, extended, and differently cased headers", () => {
    for (const header of [
      "Bearer wrong",
      "Bearer s3cre",
      "Bearer s3cret ",
      "Bearer s3cretX",
      "bearer s3cret",
      "s3cret",
      "",
      null,
      undefined,
    ]) {
      expect(isAuthorizedBearer(header, "s3cret")).toBe(false);
    }
  });

  it("fails closed when the secret is missing", () => {
    expect(isAuthorizedBearer("Bearer ", "")).toBe(false);
    expect(isAuthorizedBearer("Bearer undefined", undefined)).toBe(false);
    expect(isAuthorizedBearer("Bearer null", null)).toBe(false);
  });
});
