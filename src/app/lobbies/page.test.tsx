import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const redirectMock = vi.fn();
const afterMock = vi.fn();
const joinLobbyByCodeMock = vi.fn();
const publishLobbyJoinMock = vi.fn();
const resolveCanonicalLobbyMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));
vi.mock("next/server", () => ({
  after: (...args: unknown[]) => afterMock(...args),
}));
vi.mock("@/lib/lobbies/join", () => ({
  joinLobbyByCode: (...args: unknown[]) => joinLobbyByCodeMock(...args),
  publishLobbyJoin: (...args: unknown[]) => publishLobbyJoinMock(...args),
  lobbyJoinFailureMessage: (kind: string) =>
    ({
      invalid_code: "Invalid lobby code",
      not_found: "Lobby not found or already started",
      occupied: "Lobby already has a guest",
      active_game_exists: "Finish or leave your current game first",
    })[kind] ?? "Could not join lobby",
}));
vi.mock("@/lib/lobbies/resolve", () => ({
  resolveCanonicalLobby: (...args: unknown[]) =>
    resolveCanonicalLobbyMock(...args),
}));

const LobbiesPage = (await import("./page")).default;

beforeEach(() => {
  authMock.mockReset();
  redirectMock.mockReset();
  afterMock.mockReset();
  joinLobbyByCodeMock.mockReset();
  publishLobbyJoinMock.mockReset();
  resolveCanonicalLobbyMock.mockReset();

  authMock.mockResolvedValue({ user: { id: "invitee-user" } });
  redirectMock.mockImplementation((destination: string) => {
    throw new Error(`redirect:${destination}`);
  });
  afterMock.mockImplementation((callback: () => unknown) => callback());
  resolveCanonicalLobbyMock.mockResolvedValue({
    lobbyId: "personal-lobby",
    branch: "created",
  });
});

describe("/lobbies code resolver", () => {
  it("admits an invitee by code before canonical lobby resolution", async () => {
    const joined = {
      kind: "joined",
      lobbyId: "host-lobby",
      replacedLobbyId: null,
      membership: "created",
    };
    joinLobbyByCodeMock.mockResolvedValue(joined);

    await expect(
      LobbiesPage({ searchParams: Promise.resolve({ code: "ABCD" }) })
    ).rejects.toThrow("redirect:/lobbies/host-lobby");

    expect(joinLobbyByCodeMock).toHaveBeenCalledWith({
      userId: "invitee-user",
      code: "ABCD",
    });
    expect(publishLobbyJoinMock).toHaveBeenCalledWith(joined, "invitee-user");
    expect(resolveCanonicalLobbyMock).not.toHaveBeenCalled();
  });

  it("lands an existing guest in their room without an error fallback", async () => {
    const existingMembership = {
      kind: "joined",
      lobbyId: "host-lobby",
      replacedLobbyId: null,
      membership: "existing",
    };
    joinLobbyByCodeMock.mockResolvedValue(existingMembership);

    await expect(
      LobbiesPage({ searchParams: Promise.resolve({ code: "ABCD" }) })
    ).rejects.toThrow("redirect:/lobbies/host-lobby");

    expect(resolveCanonicalLobbyMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalledWith(
      expect.stringContaining("joinError=")
    );
  });

  it.each([
    ["invalid_code", "Invalid%20lobby%20code"],
    ["not_found", "Lobby%20not%20found%20or%20already%20started"],
    ["occupied", "Lobby%20already%20has%20a%20guest"],
  ])("falls through with a clear %s error", async (kind, encodedMessage) => {
    joinLobbyByCodeMock.mockResolvedValue({ kind });

    await expect(
      LobbiesPage({ searchParams: Promise.resolve({ code: "--" }) })
    ).rejects.toThrow(
      `redirect:/lobbies/personal-lobby?joinError=${encodedMessage}`
    );

    expect(resolveCanonicalLobbyMock).toHaveBeenCalledWith("invitee-user");
    expect(publishLobbyJoinMock).not.toHaveBeenCalled();
  });

  it("falls through to the game lobby when admission finds an active game", async () => {
    joinLobbyByCodeMock.mockResolvedValue({ kind: "active_game_exists" });
    resolveCanonicalLobbyMock.mockResolvedValue({
      lobbyId: "active-game-lobby",
      branch: "active_game",
    });

    await expect(
      LobbiesPage({ searchParams: Promise.resolve({ code: "ABCD" }) })
    ).rejects.toThrow(
      "redirect:/lobbies/active-game-lobby?joinError=Finish%20or%20leave%20your%20current%20game%20first"
    );

    expect(resolveCanonicalLobbyMock).toHaveBeenCalledWith("invitee-user");
    expect(publishLobbyJoinMock).not.toHaveBeenCalled();
  });
});
