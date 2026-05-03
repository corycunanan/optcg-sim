import { describe, expect, it } from "vitest";
import type { SerializedLobbyInvite } from "@/types/realtime";
import {
  addInvite,
  expireInvites,
  removeInvite,
  seedInvites,
  type InviteToastEntry,
} from "./lobby-invite-toast-state";

const makeInvite = (
  overrides: Partial<SerializedLobbyInvite> = {},
): SerializedLobbyInvite => ({
  id: "invite-1",
  lobbyId: "lobby-1",
  fromUserId: "user-host",
  toUserId: "user-me",
  createdAt: "2026-05-02T12:00:00.000Z",
  expiresAt: "2026-05-02T12:05:00.000Z",
  fromUser: {
    id: "user-host",
    username: "luffy",
    name: "Luffy",
    image: null,
  },
  lobby: {
    joinCode: "ABCD",
    format: "Standard",
    mode: "PVP",
    hostUsername: "luffy",
  },
  ...overrides,
});

describe("addInvite", () => {
  it("prepends a new invite and caches expiresAtMs", () => {
    const result = addInvite([], makeInvite());
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("invite-1");
    expect(result[0]?.expiresAtMs).toBe(
      Date.parse("2026-05-02T12:05:00.000Z"),
    );
  });

  it("dedupes by id (idempotent)", () => {
    const seeded = addInvite([], makeInvite());
    const next = addInvite(seeded, makeInvite());
    expect(next).toBe(seeded);
  });

  it("preserves earlier entries when adding a different invite", () => {
    const seeded = addInvite([], makeInvite({ id: "invite-A" }));
    const next = addInvite(seeded, makeInvite({ id: "invite-B" }));
    expect(next.map((i) => i.id)).toEqual(["invite-B", "invite-A"]);
  });
});

describe("removeInvite", () => {
  it("drops the matching id", () => {
    const seeded = addInvite([], makeInvite({ id: "invite-X" }));
    const next = removeInvite(seeded, "invite-X");
    expect(next).toHaveLength(0);
  });

  it("returns the same reference when nothing matches", () => {
    const seeded = addInvite([], makeInvite({ id: "invite-X" }));
    const next = removeInvite(seeded, "missing");
    expect(next).toBe(seeded);
  });
});

describe("expireInvites", () => {
  it("drops entries whose expiresAt has passed", () => {
    const a: InviteToastEntry = {
      ...makeInvite({ id: "a", expiresAt: "2026-05-02T12:05:00.000Z" }),
      expiresAtMs: Date.parse("2026-05-02T12:05:00.000Z"),
    };
    const b: InviteToastEntry = {
      ...makeInvite({ id: "b", expiresAt: "2026-05-02T12:10:00.000Z" }),
      expiresAtMs: Date.parse("2026-05-02T12:10:00.000Z"),
    };
    const result = expireInvites([a, b], Date.parse("2026-05-02T12:06:00.000Z"));
    expect(result.map((i) => i.id)).toEqual(["b"]);
  });

  it("returns the same reference when nothing has expired", () => {
    const seeded = addInvite([], makeInvite());
    const result = expireInvites(seeded, Date.parse("2026-05-02T12:00:30.000Z"));
    expect(result).toBe(seeded);
  });
});

describe("seedInvites", () => {
  it("adds server-side invites that aren't already tracked", () => {
    const seeded = addInvite([], makeInvite({ id: "invite-A" }));
    const result = seedInvites(seeded, [
      makeInvite({ id: "invite-A" }), // dupe — must be skipped
      makeInvite({ id: "invite-B" }),
    ]);
    expect(result.map((i) => i.id)).toEqual(["invite-B", "invite-A"]);
  });

  it("returns the same reference when nothing is fresh", () => {
    const seeded = addInvite([], makeInvite({ id: "invite-A" }));
    const result = seedInvites(seeded, [makeInvite({ id: "invite-A" })]);
    expect(result).toBe(seeded);
  });

  it("dedupes within a single server batch (CodeRabbit P2)", () => {
    // The reconciliation endpoint should never return two rows with the
    // same id, but `known` must track ids accepted *during* this batch
    // so a degenerate response can't double-render the same toast.
    const result = seedInvites(
      [],
      [makeInvite({ id: "invite-A" }), makeInvite({ id: "invite-A" })],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("invite-A");
  });
});
