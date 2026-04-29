import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const rateLimitMock = vi.fn(async () => ({ limited: false, remaining: 99 }));
const lobbyFindUniqueMock = vi.fn();
const lobbyUpdateMock = vi.fn();
const lobbyGuestCreateMock = vi.fn();
const lobbyGuestDeleteManyMock = vi.fn();
const lobbyGuestUpdateMock = vi.fn();
const lobbyGuestUpsertMock = vi.fn();
const deckFindFirstMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  prisma: {
    lobby: {
      findUnique: (...args: unknown[]) => lobbyFindUniqueMock(...args),
      update: (...args: unknown[]) => lobbyUpdateMock(...args),
    },
    lobbyGuest: {
      create: (...args: unknown[]) => lobbyGuestCreateMock(...args),
      deleteMany: (...args: unknown[]) => lobbyGuestDeleteManyMock(...args),
      update: (...args: unknown[]) => lobbyGuestUpdateMock(...args),
      upsert: (...args: unknown[]) => lobbyGuestUpsertMock(...args),
    },
    deck: {
      findFirst: (...args: unknown[]) => deckFindFirstMock(...args),
    },
    card: {
      findMany: vi.fn(),
    },
    $transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  apiLimiter: { check: rateLimitMock },
}));

const { PATCH } = await import("./route");

function buildRequest(body: unknown, search = "") {
  return new NextRequest(`http://localhost/api/lobbies/lobby-1${search}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "lobby-1" }) };

function baseLobby(overrides: Record<string, unknown> = {}) {
  return {
    id: "lobby-1",
    hostUserId: "host-user",
    hostDeckId: "host-deck",
    format: "Standard",
    mode: "PVP",
    status: "READY",
    hostReady: true,
    guest: {
      userId: "guest-user",
      deckId: "guest-deck",
      guestReady: true,
      user: { id: "guest-user", username: "guesty", name: "Guest Player" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  lobbyFindUniqueMock.mockReset();
  lobbyUpdateMock.mockReset();
  lobbyGuestCreateMock.mockReset();
  lobbyGuestDeleteManyMock.mockReset();
  lobbyGuestUpdateMock.mockReset();
  lobbyGuestUpsertMock.mockReset();
  deckFindFirstMock.mockReset();
  transactionMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "host-user" } });
  rateLimitMock.mockResolvedValue({ limited: false, remaining: 99 });
  lobbyFindUniqueMock.mockResolvedValue(baseLobby());
  lobbyUpdateMock.mockReturnValue({ query: "update-lobby" });
  lobbyGuestCreateMock.mockReturnValue({ query: "create-guest" });
  lobbyGuestDeleteManyMock.mockReturnValue({ query: "delete-guests" });
  lobbyGuestUpdateMock.mockReturnValue({ query: "update-guest" });
  lobbyGuestUpsertMock.mockReturnValue({ query: "upsert-guest" });
  deckFindFirstMock.mockResolvedValue({ id: "deck-1" });
  transactionMock.mockResolvedValue([]);
});

describe("PATCH /api/lobbies/[id]", () => {
  it("blocks PVP to Solitaire while a real guest is present unless forced", async () => {
    const res = await PATCH(buildRequest({ mode: "SOLITAIRE" }), params);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "Guest is present",
      code: "GUEST_PRESENT",
      details: { guestUserId: "guest-user", guestUserName: "guesty" },
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("force-switches PVP to Solitaire by ejecting the real guest and creating the host side B row", async () => {
    const res = await PATCH(
      buildRequest(
        { mode: "SOLITAIRE", guestDeckId: "side-b-deck" },
        "?force=true"
      ),
      params
    );

    expect(res.status).toBe(200);
    expect(lobbyGuestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1" },
    });
    expect(lobbyGuestUpsertMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1" },
      create: {
        lobbyId: "lobby-1",
        userId: "host-user",
        deckId: "side-b-deck",
        guestReady: false,
      },
      update: {
        userId: "host-user",
        deckId: "side-b-deck",
        guestReady: false,
      },
    });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { mode: "SOLITAIRE", hostReady: false, status: "READY" },
    });
    expect(transactionMock).toHaveBeenCalledWith([
      { query: "delete-guests" },
      { query: "upsert-guest" },
      { query: "update-lobby" },
    ]);
  });

  it("cleans up host-as-guest state when switching Solitaire back to PVP", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(
      baseLobby({
        mode: "SOLITAIRE",
        guest: {
          userId: "host-user",
          deckId: "side-b-deck",
          guestReady: false,
          user: { id: "host-user", username: "hosty", name: "Host Player" },
        },
      })
    );

    const res = await PATCH(buildRequest({ mode: "PVP" }), params);

    expect(res.status).toBe(200);
    expect(lobbyGuestDeleteManyMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1", userId: "host-user" },
    });
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { mode: "PVP", hostReady: false, status: "WAITING" },
    });
  });

  it("lets the PVP guest change only their deck and clears guestReady", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "guest-user" } });

    const res = await PATCH(
      buildRequest({ guestDeckId: "new-guest-deck" }),
      params
    );

    expect(res.status).toBe(200);
    expect(deckFindFirstMock).toHaveBeenCalledWith({
      where: { id: "new-guest-deck", userId: "guest-user" },
    });
    expect(lobbyGuestUpdateMock).toHaveBeenCalledWith({
      where: { lobbyId: "lobby-1" },
      data: { deckId: "new-guest-deck", guestReady: false },
    });
  });

  it("rejects host attempts to mutate the PVP guest deck slot", async () => {
    const res = await PATCH(
      buildRequest({ guestDeckId: "new-guest-deck" }),
      params
    );

    expect(res.status).toBe(403);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("requires the actor seat to have a deck before readying", async () => {
    lobbyFindUniqueMock.mockResolvedValueOnce(baseLobby({ hostDeckId: null }));

    const res = await PATCH(buildRequest({ ready: true }), params);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body).toEqual({
      error: "Select a deck before readying",
      code: "DECK_REQUIRED",
    });
  });

  it("clears hostReady when the host changes their deck", async () => {
    const res = await PATCH(buildRequest({ hostDeckId: null }), params);

    expect(res.status).toBe(200);
    expect(lobbyUpdateMock).toHaveBeenCalledWith({
      where: { id: "lobby-1" },
      data: { hostDeckId: null, hostReady: false },
    });
  });

  it("rejects PVComputer mutations until the mode is implemented", async () => {
    const res = await PATCH(buildRequest({ mode: "PVCOMPUTER" }), params);

    expect(res.status).toBe(501);
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
