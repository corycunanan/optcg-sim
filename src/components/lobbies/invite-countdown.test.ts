import { describe, expect, it } from "vitest";
import {
  formatInviteCountdown,
  inviteRemainingMs,
  resolveInviteSeatTiming,
} from "./invite-countdown";

describe("invite countdown", () => {
  it("derives remaining time from the server expiry timestamp", () => {
    expect(
      inviteRemainingMs(
        "2026-07-24T20:05:00.000Z",
        Date.parse("2026-07-24T20:00:00.000Z")
      )
    ).toBe(5 * 60 * 1000);
  });

  it("formats the countdown and clamps expired invites to zero", () => {
    expect(formatInviteCountdown(61_001)).toBe("1:02");
    expect(formatInviteCountdown(0)).toBe("0:00");
    expect(inviteRemainingMs("2020-01-01T00:00:00.000Z", Date.now())).toBe(0);
  });

  it("moves the invited seat to expired exactly at the server deadline", () => {
    const expiresAt = "2026-07-24T20:05:00.000Z";

    expect(
      resolveInviteSeatTiming(expiresAt, Date.parse("2026-07-24T20:04:59.001Z"))
    ).toEqual({ kind: "invited", remainingMs: 999 });
    expect(resolveInviteSeatTiming(expiresAt, Date.parse(expiresAt))).toEqual({
      kind: "expired",
    });
  });
});
