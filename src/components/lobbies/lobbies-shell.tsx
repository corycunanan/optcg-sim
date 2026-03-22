"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Deck {
  id: string;
  name: string;
}

interface LobbyState {
  id: string;
  status: "WAITING" | "IN_GAME" | "CLOSED";
  joinCode: string;
  format: string;
  gameId: string | null;
  guest: { user: { username: string | null; name: string | null } } | null;
}

export function LobbiesShell() {
  const router = useRouter();

  const [userDecks, setUserDecks] = useState<Deck[]>([]);
  const [activeLobby, setActiveLobby] = useState<LobbyState | null>(null);

  // Active game guard
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGameLoading, setActiveGameLoading] = useState(true);
  const [concedeConfirm, setConcedeConfirm] = useState(false);
  const [conceding, setConceding] = useState(false);
  const [concedeError, setConcedeError] = useState<string | null>(null);

  // Create form
  const [createDeckId, setCreateDeckId] = useState("");
  const [createFormat, setCreateFormat] = useState("Standard");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join form
  const [joinCode, setJoinCode] = useState("");
  const [joinDeckId, setJoinDeckId] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Clipboard copy
  const [copied, setCopied] = useState(false);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Active game: load on mount, re-sync when tab/window regains focus ─────
  // (avoids stale "Rejoin" after a natural win/loss if the first fetch races Postgres)

  const syncActiveGameFromServer = useCallback(async () => {
    try {
      const res = await fetch("/api/game/active");
      if (!res.ok) return;
      const data = await res.json();
      setActiveGameId(data.game?.id ?? null);
    } catch {
      /* network error — leave prior value */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await syncActiveGameFromServer();
      } finally {
        if (!cancelled) setActiveGameLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [syncActiveGameFromServer]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncActiveGameFromServer();
      }
    };
    const onFocus = () => { void syncActiveGameFromServer(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [syncActiveGameFromServer]);

  // ─── Load decks on mount ──────────────────────────────────────────────────

  const fetchDecks = useCallback(async () => {
    const res = await fetch("/api/decks");
    if (!res.ok) return;
    const data = await res.json();
    const decks: Deck[] = (data.data ?? []).map((d: Deck) => ({
      id: d.id,
      name: d.name,
    }));
    setUserDecks(decks);
    if (decks.length > 0 && !createDeckId) setCreateDeckId(decks[0].id);
    if (decks.length > 0 && !joinDeckId) setJoinDeckId(decks[0].id);
  }, [createDeckId, joinDeckId]);

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  // ─── Poll lobby status when host is waiting ──────────────────────────────

  const pollLobby = useCallback(
    async (lobbyId: string) => {
      try {
        const res = await fetch(`/api/lobbies/${lobbyId}`);
        if (!res.ok) {
          setActiveLobby(null);
          return;
        }
        const data = await res.json();

        if (data.gameId) {
          router.push(`/game/${data.gameId}`);
          return;
        }

        if (data.status === "CLOSED") {
          setActiveLobby(null);
          return;
        }

        setActiveLobby(data);
      } catch {
        // Network blip — keep polling
      }
    },
    [router],
  );

  useEffect(() => {
    if (!activeLobby || activeLobby.status !== "WAITING") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(() => pollLobby(activeLobby.id), 2000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeLobby, pollLobby]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const createLobby = async () => {
    if (!createDeckId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/lobbies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: createDeckId, format: createFormat }),
      });
      const data = await res.json();
      if (res.ok) {
        setActiveLobby({
          id: data.lobbyId,
          status: "WAITING",
          joinCode: data.joinCode,
          format: createFormat,
          gameId: null,
          guest: null,
        });
      } else {
        setCreateError(data.error ?? "Failed to create lobby");
      }
    } catch {
      setCreateError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const cancelLobby = async () => {
    if (!activeLobby) return;
    await fetch(`/api/lobbies/${activeLobby.id}`, { method: "DELETE" });
    setActiveLobby(null);
  };

  const joinLobby = async () => {
    if (!joinDeckId || !joinCode.trim()) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch("/api/lobbies/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode, deckId: joinDeckId }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/game/${data.gameId}`);
      } else {
        setJoinError(data.error ?? "Failed to join lobby");
      }
    } catch {
      setJoinError("Network error");
    } finally {
      setJoining(false);
    }
  };

  const copyCode = async () => {
    if (!activeLobby?.joinCode) return;
    try {
      await navigator.clipboard.writeText(activeLobby.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  const concedeGame = async () => {
    if (!activeGameId) return;
    setConceding(true);
    setConcedeError(null);
    try {
      const res = await fetch(`/api/game/${activeGameId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CONCEDE" }),
      });
      if (res.ok) {
        setActiveGameId(null);
        setConcedeConfirm(false);
      } else {
        const data = await res.json().catch(() => ({}));
        setConcedeError(data.error ?? "Failed to concede");
      }
    } catch {
      setConcedeError("Network error");
    } finally {
      setConceding(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const hasDecks = userDecks.length > 0;
  const isWaiting = activeLobby?.status === "WAITING";

  if (activeGameLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-surface-base">
        <div className="mx-auto max-w-xl px-6 py-10">
          <div className="flex items-center gap-2 text-sm text-content-secondary">
            <div className="h-2 w-2 animate-pulse rounded-full bg-content-tertiary" />
            Loading…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-surface-base">
      <div className="mx-auto max-w-xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-4xl font-bold text-content-primary">
            Play
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            {activeGameId
              ? "You have a game in progress."
              : "Create a lobby and share the code, or join with a code from a friend."}
          </p>
        </div>

        {/* Active game guard */}
        {activeGameId && (
          <div className="mb-8 rounded-lg border border-gold-500/30 bg-gold-500/10 p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-gold-700">
              Game In Progress
            </p>
            <p className="mt-2 text-sm text-content-primary">
              You have an ongoing game that needs to be resolved before you can
              start a new one.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => router.push(`/game/${activeGameId}`)}
                className="rounded-md bg-navy-900 px-5 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800"
              >
                Rejoin Game
              </button>

              {!concedeConfirm ? (
                <button
                  onClick={() => setConcedeConfirm(true)}
                  className="rounded-md border border-border px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-2"
                >
                  Concede
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-content-secondary">
                    Are you sure?
                  </span>
                  <button
                    onClick={concedeGame}
                    disabled={conceding}
                    className="rounded-md bg-error px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-error/90 disabled:opacity-50"
                  >
                    {conceding ? "Conceding…" : "Yes, Concede"}
                  </button>
                  <button
                    onClick={() => setConcedeConfirm(false)}
                    className="rounded-md border border-border px-3 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-2"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {concedeError && (
              <p className="mt-3 text-sm text-error">{concedeError}</p>
            )}
          </div>
        )}

        {/* Host waiting state (only when no active game) */}
        {!activeGameId && isWaiting && (
          <div className="mb-8 rounded-lg border border-border bg-surface-1 p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-content-tertiary">
              Your Lobby
            </p>
            <p className="mt-2 text-sm text-content-secondary">
              Share this code with your opponent:
            </p>

            <div className="mt-4 flex items-center gap-3">
              <code className="rounded-md bg-surface-2 px-4 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-content-primary">
                {activeLobby.joinCode}
              </code>
              <button
                onClick={copyCode}
                className="rounded-md border border-border px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-2"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="mt-6 flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-content-tertiary" />
              <p className="text-sm text-content-secondary">
                {activeLobby.guest
                  ? `${activeLobby.guest.user.username ?? activeLobby.guest.user.name ?? "Guest"} joined — starting game…`
                  : "Waiting for opponent to join…"}
              </p>
            </div>

            <div className="mt-4">
              <button
                onClick={cancelLobby}
                className="rounded-md border border-border px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-2"
              >
                Cancel Lobby
              </button>
            </div>
          </div>
        )}

        {/* Create + Join forms (only when no active lobby and no active game) */}
        {!activeGameId && !isWaiting && (
          <>
            {/* Create lobby */}
            <div className="mb-6 rounded-lg border border-border bg-surface-1 p-6">
              <h2 className="text-sm font-semibold text-content-primary">
                Create Lobby
              </h2>
              <p className="mt-1 text-sm text-content-secondary">
                Pick a deck and format, then share the code.
              </p>

              {!hasDecks ? (
                <p className="mt-4 text-sm text-content-tertiary">
                  You need to build a deck before you can play.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-content-tertiary">
                        Deck
                      </label>
                      <select
                        value={createDeckId}
                        onChange={(e) => setCreateDeckId(e.target.value)}
                        className="w-full rounded border border-border bg-surface-2 px-4 py-2 text-sm text-content-primary transition-colors focus:outline-none"
                      >
                        {userDecks.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-content-tertiary">
                        Format
                      </label>
                      <select
                        value={createFormat}
                        onChange={(e) => setCreateFormat(e.target.value)}
                        className="w-full rounded border border-border bg-surface-2 px-4 py-2 text-sm text-content-primary transition-colors focus:outline-none"
                      >
                        <option>Standard</option>
                        <option>Block</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={createLobby}
                    disabled={creating || !createDeckId}
                    className="mt-4 rounded-md bg-navy-900 px-5 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800 disabled:opacity-50"
                  >
                    {creating ? "Creating…" : "Create Lobby"}
                  </button>

                  {createError && (
                    <p className="mt-3 text-sm text-error">{createError}</p>
                  )}
                </>
              )}
            </div>

            {/* Join by code */}
            <div className="rounded-lg border border-border bg-surface-1 p-6">
              <h2 className="text-sm font-semibold text-content-primary">
                Join by Code
              </h2>
              <p className="mt-1 text-sm text-content-secondary">
                Enter a lobby code and pick your deck to start playing immediately.
              </p>

              {!hasDecks ? (
                <p className="mt-4 text-sm text-content-tertiary">
                  You need to build a deck before you can join a game.
                </p>
              ) : (
                <>
                  <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-content-tertiary">
                        Code
                      </label>
                      <input
                        value={joinCode}
                        onChange={(e) =>
                          setJoinCode(e.target.value.toUpperCase())
                        }
                        placeholder="ABCD12"
                        maxLength={6}
                        className="w-full rounded border border-border bg-surface-2 px-4 py-2 text-sm uppercase tracking-[0.2em] text-content-primary transition-colors focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-content-tertiary">
                        Deck
                      </label>
                      <select
                        value={joinDeckId}
                        onChange={(e) => setJoinDeckId(e.target.value)}
                        className="w-full rounded border border-border bg-surface-2 px-4 py-2 text-sm text-content-primary transition-colors focus:outline-none"
                      >
                        {userDecks.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={joinLobby}
                        disabled={
                          joining || !joinDeckId || joinCode.trim().length === 0
                        }
                        className={cn(
                          "rounded-md bg-navy-900 px-5 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-navy-800 disabled:opacity-50",
                        )}
                      >
                        {joining ? "Joining…" : "Join"}
                      </button>
                    </div>
                  </div>

                  {joinError && (
                    <p className="mt-3 text-sm text-error">{joinError}</p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
