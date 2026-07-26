import { describe, expect, it } from "vitest";
import {
  MAX_SPECTATOR_USER_ID_BYTES,
  validateRevokeSpectatorsPayload,
} from "../util/validate.js";

const validPayload = {
  lobbyId: "lobby-1",
  revision: 8,
  userIds: ["spectator-user"],
};

describe("spectator revocation payload validation", () => {
  it("rejects non-string and empty lobby IDs independently", () => {
    expect(() =>
      validateRevokeSpectatorsPayload({ ...validPayload, lobbyId: 7 })
    ).toThrow();
    expect(() =>
      validateRevokeSpectatorsPayload({ ...validPayload, lobbyId: "" })
    ).toThrow();
  });

  it("rejects revisions that are not safe integers", () => {
    for (const revision of ["8", 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        validateRevokeSpectatorsPayload({ ...validPayload, revision })
      ).toThrow();
    }
  });

  it("rejects negative revisions independently", () => {
    expect(() =>
      validateRevokeSpectatorsPayload({ ...validPayload, revision: -1 })
    ).toThrow();
  });

  it("enforces the WebSocket tag limit in UTF-8 bytes", () => {
    const exactLimit = "x".repeat(MAX_SPECTATOR_USER_ID_BYTES);
    expect(
      validateRevokeSpectatorsPayload({
        ...validPayload,
        userIds: [exactLimit],
      }).userIds
    ).toEqual([exactLimit]);
    expect(() =>
      validateRevokeSpectatorsPayload({
        ...validPayload,
        userIds: [`${exactLimit}x`],
      })
    ).toThrow();
  });
});
