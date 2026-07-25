"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Eye,
  Layers3,
  Loader2,
  Play,
  Plus,
  Swords,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiDelete, apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { claimLobbyRecovery } from "@/lib/lobbies/recovery-once";
import {
  useLobbyRoom,
  type LobbyRoomDeck,
  type LobbyRoomState,
} from "@/hooks/use-lobby-room";
import { DeckListResponseSchema } from "@/lib/validators/cards";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/social/user-avatar";
import { DeckPreviewModal } from "./deck-preview-modal";
import { GuestLeaveAction, runGuestLeave } from "./guest-leave-action";
import { HostCloseAction, runHostClose } from "./host-close-action";
import { lobbyRoomRecovery, rejoinGameId } from "./lobby-room-recovery";
import { InviteFriendPopover } from "./invite-friend-popover";
import {
  formatInviteCountdown,
  resolveInviteSeatTiming,
} from "./invite-countdown";
import { JoinPartyDialog } from "./join-party-dialog";
import { KickPlayerAction } from "./kick-player-action";
import { LobbySeatCard } from "./lobby-seat-card";

interface DeckOption extends LobbyRoomDeck {
  format: string;
  totalCards: number;
  colors: string[];
}

interface LobbyRoomShellProps {
  lobbyId: string;
  currentUserId: string;
  joinError?: string;
  initialJoinCode?: string;
}

export function LobbyRoomShell({
  lobbyId,
  currentUserId,
  joinError,
  initialJoinCode,
}: LobbyRoomShellProps) {
  const router = useRouter();
  const {
    lobby,
    loading,
    error,
    mutating,
    starting,
    leaving,
    closing,
    kicking,
    removedByHost,
    patchLobby,
    startLobby,
    leaveLobby,
    closeLobby,
    refresh,
    kickGuest,
  } = useLobbyRoom(lobbyId);
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [deckLoadError, setDeckLoadError] = useState<string | null>(null);
  const [previewDeckId, setPreviewDeckId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingSolitaire, setPendingSolitaire] = useState(false);
  const [cancelingInvite, setCancelingInvite] = useState(false);
  const [recoveryReentry, setRecoveryReentry] = useState(false);
  const recoveryHandledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiGet("/api/decks", DeckListResponseSchema)
      .then((json) => {
        if (!cancelled) setDecks(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setDeckLoadError("Decks could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recovery = useMemo(() => {
    if (removedByHost) {
      return {
        route: "/lobbies",
        message: `You were removed from ${removedByHost}'s party`,
      };
    }
    return lobby ? lobbyRoomRecovery(lobby) : null;
  }, [lobby, removedByHost]);

  useEffect(() => {
    if (!recovery || recoveryHandledRef.current) return;
    recoveryHandledRef.current = true;
    if (!claimLobbyRecovery(lobbyId)) {
      setRecoveryReentry(true);
      return;
    }
    if (recovery.message) toast.info(recovery.message);
    router.push(recovery.route);
  }, [lobbyId, recovery, router]);

  const isHost = lobby?.hostUserId === currentUserId;
  const isGuest = lobby?.guest?.user.id === currentUserId && !isHost;
  const isInGame = lobby?.status === "IN_GAME";
  const activeGameId = lobby ? rejoinGameId(lobby) : null;
  const hasActiveMatch = Boolean(isInGame || activeGameId);
  const realGuestPresent =
    Boolean(lobby?.guest) && lobby?.guest?.user.id !== lobby?.hostUserId;
  const guestName = lobby?.guest
    ? displayName(lobby.guest.user, "Opponent")
    : "Opponent";
  const pendingInvite = lobby?.pendingInvite ?? null;

  const ownDeck = decks.find((deck) => deck.id === lobby?.hostDeck?.id);
  const canStart = useMemo(() => {
    if (!lobby || !isHost) return false;
    if (lobby.mode === "PVP") {
      return Boolean(
        lobby.hostDeck &&
        lobby.guest?.deck &&
        lobby.hostReady &&
        lobby.guest.guestReady
      );
    }
    if (lobby.mode === "SOLITAIRE") {
      return Boolean(lobby.hostDeck && lobby.guest?.deck && lobby.hostReady);
    }
    return false;
  }, [isHost, lobby]);

  const onModeChange = async (mode: string) => {
    if (!lobby || !isHost || mode === lobby.mode || mode === "PVCOMPUTER")
      return;
    if (lobby.mode === "PVP" && mode === "SOLITAIRE" && realGuestPresent) {
      setPendingSolitaire(true);
      return;
    }
    await runPatch({
      mode,
      pregameMode: mode === "SOLITAIRE" ? "SOLITAIRE_RANDOM" : "PRIORITY_ROLL",
    });
  };

  const runPatch = async (
    body: Record<string, unknown>,
    options: { force?: boolean } = {}
  ) => {
    try {
      await patchLobby(body, options);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Lobby update failed"
      );
    }
  };

  const copyInvite = async () => {
    if (!lobby) return;
    const value = `${window.location.origin}/lobbies?code=${lobby.joinCode}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy invite link");
    }
  };

  const handleStart = async () => {
    try {
      const gameId = await startLobby();
      router.push(`/game/${gameId}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not start game"
      );
    }
  };

  const handleLeave = async () => {
    await runGuestLeave({
      leave: leaveLobby,
      onSuccess: () => toast.success("You left the lobby"),
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.message : "Could not leave lobby"
        ),
      returnToBrowser: () => router.push("/lobbies"),
    });
  };

  const handleClose = async () => {
    await runHostClose({
      close: closeLobby,
      onSuccess: () => toast.success("Party disbanded"),
      onError: (err) =>
        toast.error(
          err instanceof ApiError ? err.message : "Could not close lobby"
        ),
      returnToBrowser: () => router.push("/lobbies"),
    });
  };

  const handleCancelInvite = async () => {
    setCancelingInvite(true);
    try {
      await apiDelete(`/api/lobbies/${lobbyId}/invite`);
      await refresh();
      toast.success("Invite canceled");
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        await refresh();
        return;
      }
      toast.error(
        err instanceof ApiError ? err.message : "Could not cancel invite"
      );
    } finally {
      setCancelingInvite(false);
    }
  };

  const handleKick = async () => {
    try {
      await kickGuest();
      toast.success(`${guestName} was removed from the party`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not kick player"
      );
    }
  };

  if (recovery) {
    if (!recoveryReentry) return null;

    return (
      <div className="bg-background flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="border-border bg-card rounded-lg border p-6">
            <p className="text-content-primary text-lg font-semibold">
              This party is no longer available
            </p>
            <p className="text-content-secondary mt-2 text-sm">
              Return to Play to find or create an available party room.
            </p>
            <Button className="mt-4" onClick={() => router.push("/lobbies")}>
              Back to Play
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !lobby) {
    return (
      <div className="bg-background flex-1 overflow-y-auto">
        <div className="text-content-secondary mx-auto flex max-w-7xl items-center gap-2 px-6 py-10 text-sm">
          <span className="bg-content-tertiary size-2 animate-pulse rounded-full" />
          Loading party room...
        </div>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="bg-background flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="border-border bg-card rounded-lg border p-6">
            <p className="text-content-primary text-sm font-semibold">
              {error ?? "Lobby not found"}
            </p>
            <Button className="mt-4" onClick={() => router.push("/lobbies")}>
              Back to Lobbies
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const solitaireBlockedReason = isGuest
    ? "Leave the party to play solitaire"
    : pendingInvite
      ? "Cancel the invite before switching to solitaire"
      : realGuestPresent
        ? "Your guest must leave before switching to solitaire"
        : null;
  const startHint = getStartHint({
    lobby,
    isHost: Boolean(isHost),
    realGuestPresent,
    activeGameId,
  });

  return (
    <TooltipProvider>
      <div className="bg-background flex-1 overflow-y-auto">
        <header className="border-border bg-surface-1 border-b">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
              <div>
                <p className="text-gold-600 text-xs font-semibold tracking-widest uppercase">
                  Game mode
                </p>
                <h1 className="font-display text-content-primary mt-1 text-4xl">
                  {lobby.mode === "SOLITAIRE" ? "Solitaire" : "Versus"}
                </h1>
                <p className="text-content-secondary mt-2 text-sm">
                  {lobby.format} · {displayName(lobby.host, "Host")}
                  &apos;s party
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <PartyCode
                  code={lobby.joinCode}
                  copied={copied}
                  onCopy={() => void copyInvite()}
                />
                <Tooltip
                  content={
                    hasActiveMatch
                      ? "Rejoin your active match before switching parties"
                      : undefined
                  }
                >
                  <span>
                    <JoinPartyDialog
                      disabled={
                        mutating || starting || closing || hasActiveMatch
                      }
                      initialCode={initialJoinCode}
                    />
                  </span>
                </Tooltip>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div
                className="border-border bg-surface-3 inline-flex w-fit rounded-md border p-1"
                role="group"
                aria-label="Game mode"
              >
                <button
                  type="button"
                  onClick={() => void onModeChange("PVP")}
                  disabled={!isHost || mutating || isInGame}
                  className={cn(
                    "focus-visible:outline-border-focus flex min-h-10 items-center gap-2 rounded px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    lobby.mode === "PVP"
                      ? "bg-surface-2 text-content-primary"
                      : "text-content-secondary hover:text-content-primary"
                  )}
                  aria-pressed={lobby.mode === "PVP"}
                >
                  <Swords className="size-4" />
                  Versus
                </button>
                <Tooltip
                  content={
                    solitaireBlockedReason ??
                    (!isHost ? "Only the host can change game mode" : undefined)
                  }
                >
                  <span>
                    <button
                      type="button"
                      onClick={() => void onModeChange("SOLITAIRE")}
                      disabled={
                        !isHost ||
                        mutating ||
                        isInGame ||
                        Boolean(solitaireBlockedReason)
                      }
                      className={cn(
                        "focus-visible:outline-border-focus flex min-h-10 items-center gap-2 rounded px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                        lobby.mode === "SOLITAIRE"
                          ? "bg-surface-2 text-content-primary"
                          : "text-content-secondary hover:text-content-primary"
                      )}
                      aria-pressed={lobby.mode === "SOLITAIRE"}
                    >
                      <Layers3 className="size-4" />
                      Solitaire
                    </button>
                  </span>
                </Tooltip>
              </div>

              {solitaireBlockedReason && (
                <p className="text-content-tertiary text-xs">
                  {solitaireBlockedReason}
                </p>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
          {joinError && (
            <div
              className="border-error/30 bg-error-soft text-error rounded-lg border p-4 text-sm"
              role="alert"
            >
              {joinError}
            </div>
          )}

          {deckLoadError && (
            <div
              className="border-error/30 bg-error-soft text-error rounded-lg border p-4 text-sm"
              role="alert"
            >
              {deckLoadError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <LobbySeatCard
              role="Host"
              player={
                lobby.host ?? { username: null, name: "Host", image: null }
              }
              deck={lobby.hostDeck}
              ready={lobby.hostReady}
              readyEditable={Boolean(isHost && !isInGame)}
              readyDisabled={!lobby.hostDeck || mutating}
              deckEditable={Boolean(isHost && !isInGame)}
              decks={decks}
              deckPlaceholder="Choose your deck"
              onDeckChange={(deckId) => void runPatch({ hostDeckId: deckId })}
              onReadyChange={(ready) => void runPatch({ ready })}
              onPreview={setPreviewDeckId}
              previewSide="left"
              disabled={isInGame}
              actions={
                <HostCloseAction
                  canClose={Boolean(
                    isHost &&
                    lobby.mode === "PVP" &&
                    (lobby.status === "WAITING" || lobby.status === "READY")
                  )}
                  guestName={realGuestPresent ? guestName : null}
                  closing={closing}
                  disabled={mutating || starting}
                  compact
                  onClose={() => void handleClose()}
                />
              }
            />

            {lobby.mode === "PVP" ? (
              lobby.guest && realGuestPresent ? (
                <LobbySeatCard
                  role="Guest"
                  player={lobby.guest.user}
                  deck={lobby.guest.deck}
                  ready={lobby.guest.guestReady}
                  readyEditable={Boolean(isGuest && !isInGame)}
                  readyDisabled={!lobby.guest.deck || mutating}
                  deckEditable={Boolean(isGuest && !isInGame)}
                  decks={decks}
                  deckPlaceholder="Choose your deck"
                  onDeckChange={(deckId) =>
                    void runPatch({ guestDeckId: deckId })
                  }
                  onReadyChange={(ready) => void runPatch({ ready })}
                  onPreview={setPreviewDeckId}
                  previewSide="right"
                  disabled={isInGame}
                  actions={
                    isHost ? (
                      <KickPlayerAction
                        playerName={guestName}
                        kicking={kicking}
                        disabled={mutating || starting || isInGame}
                        onKick={() => void handleKick()}
                      />
                    ) : (
                      <GuestLeaveAction
                        isGuest={Boolean(isGuest)}
                        leaving={leaving}
                        disabled={mutating || hasActiveMatch}
                        compact
                        onLeave={() => void handleLeave()}
                      />
                    )
                  }
                />
              ) : (
                <InvitePanel
                  key={pendingInvite?.id ?? "open-seat"}
                  lobbyId={lobby.id}
                  joinCode={lobby.joinCode}
                  copied={copied}
                  onCopy={copyInvite}
                  showInviteFriend={Boolean(isHost)}
                  pendingInvite={pendingInvite}
                  cancelingInvite={cancelingInvite}
                  onInviteSent={() => void refresh()}
                  onCancelInvite={() => void handleCancelInvite()}
                />
              )
            ) : (
              <SolitaireSeat
                deck={lobby.guest?.deck ?? null}
                decks={decks}
                editable={Boolean(isHost && !isInGame)}
                disabled={mutating || isInGame}
                onDeckChange={(deckId) =>
                  void runPatch({ guestDeckId: deckId })
                }
                onPreview={setPreviewDeckId}
              />
            )}
          </div>

          {decks.length === 0 && (
            <p className="text-content-tertiary text-center text-sm">
              You can wait here now, but you&apos;ll need a playable deck before
              the match can start.{" "}
              <button
                type="button"
                className="text-gold-600 hover:text-gold-400 font-semibold"
                onClick={() => router.push("/decks")}
              >
                Build a deck
              </button>
            </p>
          )}

          {ownDeck && ownDeck.totalCards < 50 && (
            <p className="text-content-tertiary text-center text-xs">
              Deck legality is checked when Start is clicked, so unfinished
              decks can stay selected while players coordinate.
            </p>
          )}
        </main>

        <div className="border-border bg-surface-1 sticky bottom-0 z-20 border-t shadow-[var(--shadow-lg)]">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-6 py-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <Tooltip content="Spectator mode is coming in a future update">
                <span>
                  <Button variant="secondary" disabled>
                    <Eye data-icon="inline-start" />
                    Spectators
                  </Button>
                </span>
              </Tooltip>
              <p className="text-content-tertiary text-xs">{startHint}</p>
            </div>

            {activeGameId ? (
              <Button
                variant="gold"
                size="lg"
                onClick={() => router.push(`/game/${activeGameId}`)}
              >
                <Play data-icon="inline-start" />
                Rejoin Game
              </Button>
            ) : (
              <Button
                variant="gold"
                size="lg"
                onClick={() => void handleStart()}
                disabled={
                  !canStart || mutating || starting || closing || isInGame
                }
              >
                {starting ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Play data-icon="inline-start" />
                )}
                Start Match
              </Button>
            )}
          </div>
        </div>

        <AlertDialog open={pendingSolitaire} onOpenChange={setPendingSolitaire}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Switch to Solitaire?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove {guestName} from the lobby. Continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void runPatch(
                    {
                      mode: "SOLITAIRE",
                      pregameMode: "SOLITAIRE_RANDOM",
                    },
                    { force: true }
                  ).then(() => setPendingSolitaire(false));
                }}
                disabled={mutating}
              >
                Continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <DeckPreviewModal
          deckId={previewDeckId}
          open={previewDeckId !== null}
          onOpenChange={(open) => {
            if (!open) setPreviewDeckId(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
}

function PartyCode({
  code,
  copied,
  onCopy,
}: {
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="border-border bg-surface-3 hover:border-border-strong focus-visible:outline-border-focus flex min-h-10 items-center gap-3 rounded-md border px-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={copied ? "Party link copied" : "Copy party link"}
    >
      <span>
        <span className="text-content-tertiary block text-xs leading-none">
          Party code
        </span>
        <span className="text-content-primary mt-1 block font-mono text-sm font-semibold tracking-widest">
          {code}
        </span>
      </span>
      {copied ? (
        <Check className="text-success size-4" />
      ) : (
        <Copy className="text-content-tertiary size-4" />
      )}
      <span
        className={cn(
          "text-xs font-semibold",
          copied ? "text-success" : "text-content-secondary"
        )}
      >
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}

export function InvitePanel({
  lobbyId,
  showInviteFriend,
  pendingInvite,
  cancelingInvite,
  onInviteSent,
  onCancelInvite,
}: {
  lobbyId: string;
  joinCode: string;
  copied: boolean;
  onCopy: () => void;
  showInviteFriend: boolean;
  pendingInvite: NonNullable<LobbyRoomState["pendingInvite"]> | null;
  cancelingInvite: boolean;
  onInviteSent: () => void;
  onCancelInvite: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const pendingInviteName = pendingInvite
    ? displayName(pendingInvite.user, "Friend")
    : null;
  const timing = pendingInvite
    ? resolveInviteSeatTiming(pendingInvite.expiresAt, now)
    : null;

  useEffect(() => {
    if (!pendingInvite) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [pendingInvite]);

  if (pendingInvite && pendingInviteName && timing?.kind === "invited") {
    return (
      <section className="border-border bg-surface-1 flex min-h-96 flex-col rounded-lg border">
        <header className="border-border flex min-h-20 items-center gap-3 border-b px-5 py-4">
          <div className="ring-gold-500/30 animate-pulse rounded-full ring-2">
            <UserAvatar user={pendingInvite.user} size="md" variant="dark" />
          </div>
          <div>
            <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
              Guest
            </p>
            <p className="text-content-primary text-lg font-semibold">
              Invite pending
            </p>
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
          <div>
            <h2 className="font-display text-content-primary text-2xl">
              Invite sent to {pendingInviteName}
            </h2>
            <p className="text-content-secondary mt-2 text-sm">
              Their seat is reserved until the invitation expires.
            </p>
          </div>
          <p className="border-border bg-surface-3 text-content-primary rounded-full border px-4 py-2 text-sm font-semibold tabular-nums">
            Expires in {formatInviteCountdown(timing.remainingMs)}
          </p>
          {showInviteFriend && (
            <Button
              variant="secondary"
              onClick={onCancelInvite}
              disabled={cancelingInvite}
            >
              {cancelingInvite ? "Canceling..." : "Cancel invite"}
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="border-border-strong bg-surface-1 flex min-h-96 flex-col items-center justify-center gap-6 rounded-lg border border-dashed p-8 text-center">
      <div className="border-gold-500 text-gold-500 flex size-16 items-center justify-center rounded-full border">
        <Plus className="size-6" />
      </div>
      <div>
        <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
          Guest
        </p>
        <h2 className="font-display text-content-primary mt-2 text-2xl">
          Open seat
        </h2>
        <p className="text-content-secondary mt-2 text-sm">
          {pendingInvite && pendingInviteName && timing?.kind === "expired"
            ? `Invite to ${pendingInviteName} expired`
            : "Waiting for a challenger"}
        </p>
      </div>
      {showInviteFriend && (
        <InviteFriendPopover lobbyId={lobbyId} onInviteSent={onInviteSent} />
      )}
    </section>
  );
}

function SolitaireSeat({
  deck,
  decks,
  editable,
  disabled,
  onDeckChange,
  onPreview,
}: {
  deck: LobbyRoomDeck | null;
  decks: DeckOption[];
  editable: boolean;
  disabled: boolean;
  onDeckChange: (deckId: string) => void;
  onPreview: (deckId: string) => void;
}) {
  return (
    <section
      className={cn(
        "border-border bg-surface-1 relative flex min-h-96 flex-col overflow-hidden rounded-lg border",
        disabled && "pointer-events-none opacity-50"
      )}
      aria-label="Solitaire second deck"
    >
      <header className="border-border flex min-h-20 items-center gap-3 border-b px-5 py-4">
        <div className="bg-gold-100 text-gold-600 flex size-10 items-center justify-center rounded-full">
          <Layers3 className="size-5" />
        </div>
        <div>
          <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
            Solitaire
          </p>
          <h2 className="text-content-primary text-lg font-semibold">
            Your second deck
          </h2>
        </div>
      </header>

      <div className="relative flex flex-1 items-center gap-8 overflow-hidden px-8 py-10">
        <button
          type="button"
          disabled={!deck}
          onClick={() => deck && onPreview(deck.id)}
          className="bg-surface-3 border-border aspect-card focus-visible:outline-border-focus relative w-32 shrink-0 -rotate-6 overflow-hidden rounded-md border shadow-[var(--shadow-lg)] transition-transform hover:-rotate-3 focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label={deck ? `Preview ${deck.name}` : "No second deck chosen"}
        >
          {deck?.leaderImageUrl ? (
            <Image
              src={deck.leaderImageUrl}
              alt={deck.leaderName ?? deck.name}
              fill
              sizes="128px"
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-content-tertiary flex h-full items-center justify-center">
              <Layers3 className="size-8" />
            </span>
          )}
        </button>
        <div className="relative z-10 max-w-sm">
          <h3 className="font-display text-content-primary text-2xl">
            Play both sides
          </h3>
          <p className="text-content-secondary mt-3 text-sm leading-relaxed">
            Test matchups at your own pace. You&apos;ll control each side of the
            table and switch perspective between turns.
          </p>
          {deck && (
            <div className="mt-5">
              <p className="text-content-primary text-sm font-semibold">
                {deck.name}
              </p>
              <p className="text-content-tertiary mt-1 font-mono text-xs">
                {deck.leaderName ?? deck.leaderId}
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="border-border mt-auto border-t p-4">
        {editable ? (
          <Select value={deck?.id ?? ""} onValueChange={onDeckChange}>
            <SelectTrigger className="bg-surface-3 w-full">
              <SelectValue placeholder="Choose your second deck" />
            </SelectTrigger>
            <SelectContent>
              {decks.map((deckOption) => (
                <SelectItem key={deckOption.id} value={deckOption.id}>
                  {deckOption.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="border-border bg-surface-3 text-content-secondary flex min-h-10 items-center rounded-md border px-3 text-sm">
            {deck?.name ?? "Choose a second deck"}
          </div>
        )}
      </footer>
    </section>
  );
}

function getStartHint({
  lobby,
  isHost,
  realGuestPresent,
  activeGameId,
}: {
  lobby: LobbyRoomState;
  isHost: boolean;
  realGuestPresent: boolean;
  activeGameId: string | null;
}) {
  if (activeGameId) return "Your match is already in progress";
  if (lobby.status === "IN_GAME") return "Waiting for this room to reset";
  if (!isHost) return "The host starts the match";
  if (lobby.mode === "PVP" && !realGuestPresent)
    return "You need an opponent first";
  if (!lobby.hostDeck || !lobby.guest?.deck) return "Both players need a deck";
  if (lobby.mode === "PVP" && (!lobby.hostReady || !lobby.guest.guestReady))
    return "Both players must be ready";
  if (lobby.mode === "SOLITAIRE" && !lobby.hostReady)
    return "Ready up when both decks are set";
  return "Everything is set";
}

function displayName(
  user: { username?: string | null; name?: string | null } | null,
  fallback: string
) {
  return user?.username ?? user?.name ?? fallback;
}
