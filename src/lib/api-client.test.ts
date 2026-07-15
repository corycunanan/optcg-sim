import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, apiGet, apiPost } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("preserves request cache and credentials options", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "game-1" } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiGet("/api/game/game-1", {
      cache: "no-store",
      credentials: "same-origin",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/game/game-1", {
      method: "GET",
      signal: undefined,
      headers: undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
  });

  it("serializes JSON and validates successful responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { username: "luffy" } }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const schema = z.object({
      data: z.object({ username: z.string() }),
    });

    await expect(
      apiPost("/api/user/username", { username: "luffy" }, schema),
    ).resolves.toEqual({ data: { username: "luffy" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/user/username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "luffy" }),
      signal: undefined,
      cache: undefined,
      credentials: undefined,
    });
  });

  it("preserves API error messages and status codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Username is already taken" }), {
          status: 409,
        }),
      ),
    );

    const error = await apiPost("/api/user/username", {
      username: "luffy",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message: "Username is already taken",
      status: 409,
    });
  });

  it("rejects malformed responses at validated boundaries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), { status: 200 }),
      ),
    );
    const schema = z.object({
      data: z.object({ token: z.string().min(1) }),
    });

    await expect(apiGet("/api/game/token", schema)).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});
