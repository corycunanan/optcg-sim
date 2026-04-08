"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderActions,
} from "@/components/ui/page-header";
import { DeckPreviewModal } from "./deck-preview-modal";

interface Deck {
  id: string;
  name: string;
  leaderId: string;
  leaderName: string | null;
  leaderImageUrl: string | null;
}

interface LobbyState {
  id: string;
  status: "WAITING" | "IN_GAME" | "CLOSED";
  joinCode: string;
  format: string;
  gameId: string | null;
  host: { username: string | null; name: string | null; image: string | null } | null;
  hostDeck: {
    id: string;
    name: string;
    leaderName: string | null;
    leaderImageUrl: string | null;
  };
  guest: {
    user: { username: string | null; name: string | null; image: string | null };
    deck: {
      id: string;
      name: string;
      leaderName: string | null;
      leaderImageUrl: string | null;
    } | null;
  } | null;
}

interface LobbiesShellProps {
  user: {
    name: string;
    image: string | null;
  };
}

export function LobbiesShell({ user }: LobbiesShellProps) {
  const router = useRouter();

  const [userDecks, setUserDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [activeLobby, setActiveLobby] = useState<LobbyState | null>(null);

  // Active game guard
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGameLoading, setActiveGameLoading] = useState(true);
  const [conceding, setConceding] = useState(false);
  const [concedeError, setConcedeError] = useState<string | null>(null);

  // Lobby creation
  const [creating, setCreating] = useState(false);
  const lobbyCreatedRef = useRef(false);

  // Join popover
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Clipboard
  const [copied, setCopied] = useState(false);

  // Deck preview
  const [previewDeckId, setPreviewDeckId] = useState<string | null>(null);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Active game: load on mount, re-sync on focus ─────────────────────────

  const syncActiveGameFromServer = useCallback(async () => {
    try {
      const json = await apiGet<{ data: { id: string } | null }>("/api/game/active");
      setActiveGameId(json.data?.id ?? null);
    } catch {
      /* network error or 401 */
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
      if (document.visibilityState === "visible") void syncActiveGameFromServer();
    };
    const onFocus = () => void syncActiveGameFromServer();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [syncActiveGameFromServer]);

  // ─── Load decks on mount ──────────────────────────────────────────────────

  const fetchDecks = useCallback(async () => {
    try {
      const json = await apiGet<{ data: Deck[] }>("/api/decks");
      const decks: Deck[] = (json.data ?? []).map(
        (d) => ({
          id: d.id,
          name: d.name,
          leaderId: d.leaderId,
          leaderName: d.leaderName,
          leaderImageUrl: d.leaderImageUrl,
        }),
      );
      setUserDecks(decks);
      if (decks.length > 0 && !selectedDeckId) setSelectedDeckId(decks[0].id);
      return decks;
    } catch {
      /* network error */
    }
  }, [selectedDeckId]);

  useEffect(() => {
    fetchDecks();
  }, [fetchDecks]);

  // ─── Poll lobby status when host is waiting ──────────────────────────────

  const pollLobby = useCallback(
    async (lobbyId: string) => {
      try {
        const json = await apiGet<{ data: LobbyState }>(`/api/lobbies/${lobbyId}`);
        const data = json.data;

        if (data.gameId) {
          router.push(`/game/${data.gameId}`);
          return;
        }

        if (data.status === "CLOSED") {
          setActiveLobby(null);
          lobbyCreatedRef.current = false;
          return;
        }

        setActiveLobby(data);
      } catch {
        setActiveLobby(null);
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

  // ─── Auto-create lobby ────────────────────────────────────────────────────

  const createLobby = useCallback(
    async (deckId: string) => {
      if (!deckId || creating) return;
      setCreating(true);
      try {
        const json = await apiPost<{ data: { lobbyId: string; joinCode: string } }>("/api/lobbies", { deckId, format: "Standard" });
        // Find the selected deck to populate hostDeck info
        const deck = userDecks.find((d) => d.id === deckId);
        setActiveLobby({
          id: json.data.lobbyId,
          status: "WAITING",
          joinCode: json.data.joinCode,
          format: "Standard",
          gameId: null,
          host: null,
          hostDeck: {
            id: deckId,
            name: deck?.name ?? "Deck",
            leaderName: deck?.leaderName ?? null,
            leaderImageUrl: deck?.leaderImageUrl ?? null,
          },
          guest: null,
        });
        lobbyCreatedRef.current = true;
      } catch {
        /* network error */
      } finally {
        setCreating(false);
      }
    },
    [creating, userDecks],
  );

  useEffect(() => {
    if (
      !activeGameLoading &&
      !activeGameId &&
      !activeLobby &&
      !lobbyCreatedRef.current &&
      selectedDeckId &&
      userDecks.length > 0
    ) {
      createLobby(selectedDeckId);
    }
  }, [activeGameLoading, activeGameId, activeLobby, selectedDeckId, userDecks, createLobby]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const cancelLobby = async () => {
    if (!activeLobby) return;
    try {
      await apiDelete(`/api/lobbies/${activeLobby.id}`);
    } catch {
      /* ignore */
    }
    setActiveLobby(null);
    lobbyCreatedRef.current = false;
  };

  const joinLobby = async () => {
    if (!selectedDeckId || joinCode.length < 6) return;
    setJoining(true);
    setJoinError(null);
    try {
      const json = await apiPost<{ data: { gameId: string } }>("/api/lobbies/join", { code: joinCode, deckId: selectedDeckId });
      router.push(`/game/${json.data.gameId}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setJoinError(error.message);
      } else {
        setJoinError("Network error");
      }
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
      await apiPost(`/api/game/${activeGameId}`, { action: "CONCEDE" });
      setActiveGameId(null);
    } catch (error) {
      if (error instanceof ApiError) {
        setConcedeError(error.message);
      } else {
        setConcedeError("Network error");
      }
    } finally {
      setConceding(false);
    }
  };

  const handleDeckChange = async (deckId: string) => {
    setSelectedDeckId(deckId);
    if (activeLobby) {
      const deck = userDecks.find((d) => d.id === deckId);
      try {
        await apiPatch(`/api/lobbies/${activeLobby.id}`, { deckId });
      } catch {
        /* ignore */
      }
      setActiveLobby((prev) =>
        prev
          ? {
              ...prev,
              hostDeck: {
                id: deckId,
                name: deck?.name ?? "Deck",
                leaderName: deck?.leaderName ?? null,
                leaderImageUrl: deck?.leaderImageUrl ?? null,
              },
            }
          : null,
      );
    }
  };

  // ─── Derived state ────────────────────────────────────────────────────────

  const hasDecks = userDecks.length > 0;
  const isWaiting = activeLobby?.status === "WAITING";
  const selectedDeck = userDecks.find((d) => d.id === selectedDeckId);

  // ─── Loading state ────────────────────────────────────────────────────────

  if (activeGameLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-surface-base">
        <div className="mx-auto max-w-xl px-6 py-10">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <div className="h-2 w-2 animate-pulse rounded-full bg-text-tertiary" />
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto bg-surface-base">
      {/* Header */}
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Play</PageHeaderTitle>
          <PageHeaderDescription>
            {activeGameId
              ? "You have a game in progress."
              : isWaiting
                ? "Waiting for an opponent to join your lobby."
                : "Setting up your lobby..."}
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          {!activeGameId && (
            <Popover open={joinOpen} onOpenChange={setJoinOpen}>
              <PopoverTrigger asChild>
                <Button variant="secondary">Join Lobby</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto">
                <div className="flex flex-col gap-4 p-2">
                  <p className="text-sm font-medium text-text-primary">
                    Enter lobby code
                  </p>
                  <InputOTP
                    maxLength={6}
                    value={joinCode}
                    onChange={(value) => setJoinCode(value.toUpperCase())}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  {joinError && (
                    <p className="text-xs text-error">{joinError}</p>
                  )}
                  <Button
                    onClick={joinLobby}
                    disabled={joining || joinCode.length < 6 || !selectedDeckId}
                    className="w-full"
                  >
                    {joining ? "Joining..." : "Join"}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </PageHeaderActions>
      </PageHeader>

      {/* Main content */}
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Active game guard */}
        {activeGameId && (
          <div className="rounded-lg border border-gold-500/30 bg-gold-100 p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
              Game In Progress
            </p>
            <p className="mt-2 text-sm text-text-primary">
              You have an ongoing game that needs to be resolved before you can
              start a new one.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button onClick={() => router.push(`/game/${activeGameId}`)}>
                Rejoin Game
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary">Concede</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Concede Game</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to concede? This will end the game
                      and count as a loss.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={conceding}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={concedeGame}
                      disabled={conceding}
                    >
                      {conceding ? "Conceding..." : "Yes, Concede"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {concedeError && (
              <p className="mt-3 text-sm text-error">{concedeError}</p>
            )}
          </div>
        )}

        {/* No decks state */}
        {!activeGameId && !hasDecks && (
          <div className="rounded-lg border border-border bg-surface-1 p-6 text-center">
            <p className="text-sm text-text-secondary">
              You need to build a deck before you can play.
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push("/decks")}
            >
              Build a Deck
            </Button>
          </div>
        )}

        {/* Lobby layout */}
        {!activeGameId && hasDecks && (
          <div className="flex flex-col gap-6">
            {/* Players row */}
            <div className="flex justify-center gap-6">
              {/* Player */}
              <div className="flex min-h-[420px] min-w-60 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-surface-1 p-6">
                {selectedDeck?.leaderImageUrl ? (
                  <button
                    onClick={() => setPreviewDeckId(selectedDeckId)}
                    className="cursor-pointer transition-transform hover:scale-105"
                  >
                    <img
                      src={selectedDeck.leaderImageUrl}
                      alt={selectedDeck.leaderName ?? "Leader"}
                      className="w-48 rounded-lg shadow-[var(--shadow-md)]"
                    />
                  </button>
                ) : (
                  <div className="flex h-64 w-48 items-center justify-center rounded-lg bg-surface-2">
                    <span className="text-xs text-text-tertiary">
                      No leader
                    </span>
                  </div>
                )}
                <div className="text-center">
                  <p className="text-lg font-semibold text-text-primary">
                    {selectedDeck?.name ?? "No deck selected"}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {user.name}
                  </p>
                </div>
                {userDecks.length > 1 && (
                  <Select
                    value={selectedDeckId}
                    onValueChange={handleDeckChange}
                  >
                    <SelectTrigger className="w-full max-w-48">
                      <SelectValue placeholder="Select a deck" />
                    </SelectTrigger>
                    <SelectContent>
                      {userDecks.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Opponent */}
              <div className="flex min-h-[420px] min-w-60 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-surface-1 p-6">
                {activeLobby?.guest ? (
                  <>
                    {activeLobby.guest.deck?.leaderImageUrl ? (
                      <button
                        onClick={() => {
                          if (activeLobby.guest?.deck?.id)
                            setPreviewDeckId(activeLobby.guest.deck.id);
                        }}
                        className="cursor-pointer transition-transform hover:scale-105"
                      >
                        <img
                          src={activeLobby.guest.deck.leaderImageUrl}
                          alt={activeLobby.guest.deck.leaderName ?? "Leader"}
                          className="w-48 rounded-lg shadow-[var(--shadow-md)]"
                        />
                      </button>
                    ) : (
                      <div className="flex h-64 w-48 items-center justify-center rounded-lg bg-surface-2">
                        <span className="text-xs text-text-tertiary">
                          No leader
                        </span>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-lg font-semibold text-text-primary">
                        {activeLobby.guest.deck?.name ?? "Deck"}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {activeLobby.guest.user.username ??
                          activeLobby.guest.user.name ??
                          "Opponent"}
                      </p>
                    </div>
                  </>
                ) : (
                  <button
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full",
                      "border-2 border-dashed border-border-strong",
                      "text-text-tertiary transition-colors",
                      "hover:border-navy-500 hover:text-navy-500",
                    )}
                    onClick={() => setJoinOpen(true)}
                    aria-label="Invite opponent"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                )}
              </div>
            </div>

            {/* Lobby info */}
            {isWaiting && activeLobby && (
              <div className="flex flex-col items-center gap-3">
                <code className="rounded-md bg-surface-1 border border-border px-4 py-2 font-mono text-lg font-bold tracking-[0.3em] text-text-primary">
                  {activeLobby.joinCode}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyCode}
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Code
                    </>
                  )}
                </Button>
              </div>
            )}

            {creating && !isWaiting && (
              <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
                <div className="h-2 w-2 animate-pulse rounded-full bg-text-tertiary" />
                Creating lobby...
              </div>
            )}
          </div>
        )}
      </div>

      <DeckPreviewModal
        deckId={previewDeckId}
        open={previewDeckId !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewDeckId(null);
        }}
      />
    </div>
  );
}
