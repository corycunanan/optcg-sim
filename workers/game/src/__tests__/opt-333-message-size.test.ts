import { describe, expect, it } from "vitest";
import { getClientMessageByteLength, MAX_CLIENT_MESSAGE_BYTES } from "../GameSession.js";

describe("WebSocket client message size guard", () => {
  it("uses UTF-8 byte length for string messages", () => {
    expect(getClientMessageByteLength("abc")).toBe(3);
    expect(getClientMessageByteLength("航")).toBe(3);
  });

  it("uses byteLength for binary messages", () => {
    expect(getClientMessageByteLength(new Uint8Array(42).buffer)).toBe(42);
  });

  it("documents the 8 KiB client message cap", () => {
    expect(MAX_CLIENT_MESSAGE_BYTES).toBe(8192);
  });
});
