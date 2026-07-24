import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { isRetryableTransactionConflict } from "./transaction-conflict";

describe("isRetryableTransactionConflict", () => {
  it("does not classify an arbitrary domain error with nested 40P01 metadata as retryable", () => {
    const domainError = Object.assign(new Error("Invite rule failed"), {
      meta: { code: "40P01" },
    });

    expect(isRetryableTransactionConflict(domainError)).toBe(false);
  });

  it("recognizes Prisma P2034 transaction conflicts", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict or a deadlock",
      { code: "P2034", clientVersion: "test" }
    );

    expect(isRetryableTransactionConflict(error)).toBe(true);
  });

  it("recognizes PostgreSQL 40P01 reported by a Prisma unknown request error", () => {
    const error = new Prisma.PrismaClientUnknownRequestError(
      "PostgreSQL error 40P01: deadlock detected",
      { clientVersion: "test" }
    );

    expect(isRetryableTransactionConflict(error)).toBe(true);
  });
});
