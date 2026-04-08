"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";

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

export type { Deck, LobbyState };

export interface UseLobbySessionReturn {
  userDecks: Deck[];
  selectedDeckId: string;
  setSelectedDeckId: (id: string) => void;
  activeLobby: LobbyState | null;
  activeGameId: string | null;
  activeGameLoading: boolean;
  creating: boolean;
  conceding: boolean;
  concedeError: string | null;
  joinOpen: boolean;
  setJoinOpen: (open: boolean) => void;
  joinCode: string;
  setJoinCode: (code: string) => void;
  joining: boolean;
  joinError: string | null;
  copied: boolean;
  previewDeckId: string | null;
  setPreviewDeckId: (id: string | null) => void;
  hasDecks: boolean;
  isWaiting: boolean;
  selectedDeck: Deck | undefined;
  cancelLobby: () => Promise<void>;
  joinLobby: () => Promise<void>;
  copyCode: () => Promise<void>;
  concedeGame: () => Promise<void>;
  handleDeckChange: (deckId: string) => Promise<void>;
}

export function useLobbySession(): UseLobbySessionReturn {
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

  return {
    userDecks,
    selectedDeckId,
    setSelectedDeckId,
    activeLobby,
    activeGameId,
    activeGameLoading,
    creating,
    conceding,
    concedeError,
    joinOpen,
    setJoinOpen,
    joinCode,
    setJoinCode,
    joining,
    joinError,
    copied,
    previewDeckId,
    setPreviewDeckId,
    hasDecks,
    isWaiting,
    selectedDeck,
    cancelLobby,
    joinLobby,
    copyCode,
    concedeGame,
    handleDeckChange,
  };
}
