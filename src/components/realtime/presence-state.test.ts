import { describe, expect, it } from "vitest";
import {
  EMPTY_PRESENCE,
  applyOfflineEvent,
  applyOnlineEvent,
  applyPresenceSeed,
  type PresenceMap,
} from "./presence-state";

describe("OPT-358 presence-state reducer", () => {
  it("seed merges new ids without losing existing entries", () => {
    const prev: PresenceMap = {
      a: { online: true, lastSeen: null },
    };
    const next = applyPresenceSeed(prev, {
      b: { online: false, lastSeen: "2026-05-01T12:00:00Z" },
    });
    expect(next).toEqual({
      a: { online: true, lastSeen: null },
      b: { online: false, lastSeen: "2026-05-01T12:00:00Z" },
    });
  });

  it("seed returns the same reference when nothing changes", () => {
    const prev: PresenceMap = {
      a: { online: true, lastSeen: null },
    };
    const same = applyPresenceSeed(prev, {
      a: { online: true, lastSeen: null },
    });
    expect(same).toBe(prev);
  });

  it("online event flips offline → online while preserving lastSeen", () => {
    const prev: PresenceMap = {
      a: { online: false, lastSeen: "2026-05-01T12:00:00Z" },
    };
    const next = applyOnlineEvent(prev, "a");
    expect(next.a).toEqual({ online: true, lastSeen: "2026-05-01T12:00:00Z" });
  });

  it("online event for an already-online user returns same reference", () => {
    const prev: PresenceMap = { a: { online: true, lastSeen: null } };
    expect(applyOnlineEvent(prev, "a")).toBe(prev);
  });

  it("online event for an unknown user adds the entry with null lastSeen", () => {
    const next = applyOnlineEvent(EMPTY_PRESENCE, "new-user");
    expect(next["new-user"]).toEqual({ online: true, lastSeen: null });
  });

  it("offline event flips online → offline and stamps lastSeen", () => {
    const prev: PresenceMap = { a: { online: true, lastSeen: null } };
    const next = applyOfflineEvent(prev, "a", "2026-05-02T18:30:00Z");
    expect(next.a).toEqual({ online: false, lastSeen: "2026-05-02T18:30:00Z" });
  });

  it("offline event with same lastSeen returns same reference", () => {
    const prev: PresenceMap = {
      a: { online: false, lastSeen: "2026-05-02T18:30:00Z" },
    };
    expect(applyOfflineEvent(prev, "a", "2026-05-02T18:30:00Z")).toBe(prev);
  });
});
