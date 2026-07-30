"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, Layers3, Loader2, Play, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiDelete, apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { claimLobbyRecovery } from "@/lib/lobbies/recovery-once";
import {
  useLobbyRoom,
  type LobbyRoomDeck,
  type LobbyRoomState,
  type SpectatorRemovalReason,
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
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { PregameSettings } from "./pregame-settings";
import { SpectatorsModal } from "./spectators-modal";

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
    spectatorToggling,
    stoppingSpectating,
    removedByHost,
    spectatorRemovalReason,
    patchLobby,
    setAllowSpectators,
    startLobby,
    leaveLobby,
    closeLobby,
    refresh,
    kickGuest,
    stopSpectating,
  } = useLobbyRoom(lobbyId);
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [deckLoadError, setDeckLoadError] = useState<string | null>(null);
  const [previewDeckId, setPreviewDeckId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingSolitaire, setPendingSolitaire] = useState(false);
  const [cancelingInvite, setCancelingInvite] = useState(false);
  const [recoveryReentry, setRecoveryReentry] = useState(false);
  const [spectatorsOpen, setSpectatorsOpen] = useState(false);
  const recoveryHandledRef = useRef(false);
  const spectatorCountButtonRef = useRef<HTMLButtonElement>(null);
  const viewerRole = lobby?.viewerRole;

  useEffect(() => {
    if (!viewerRole || viewerRole === "spectator") return;

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
  }, [viewerRole]);

  const recovery = useMemo(() => {
    if (spectatorRemovalReason) {
      return {
        route: "/lobbies",
        message: spectatorRemovalMessage(spectatorRemovalReason),
      };
    }
    if (removedByHost) {
      return {
        route: "/lobbies",
        message: `You were removed from ${removedByHost}'s party`,
      };
    }
    return lobby ? lobbyRoomRecovery(lobby) : null;
  }, [lobby, removedByHost, spectatorRemovalReason]);

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

  const isHost = lobby?.viewerRole === "host";
  const isGuest = lobby?.viewerRole === "guest";
  const isSpectator = lobby?.viewerRole === "spectator";
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

  const handleStopSpectating = async () => {
    try {
      await stopSpectating();
      toast.success("You stopped spectating");
      router.push("/lobbies");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Could not stop spectating"
      );
    }
  };

  const handleSpectatorToggle = async (allowSpectators: boolean) => {
    try {
      await setAllowSpectators(allowSpectators);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Could not update spectator access"
      );
    }
  };

  const handleOpenSpectators = () => {
    setSpectatorsOpen(true);
  };

  if (recovery) {
    if (!recoveryReentry) return null;

    return (
      <div
        className="bg-background flex min-h-0 flex-1 flex-col overflow-y-auto xl:[@media(min-height:50rem)]:overflow-hidden"
        data-lobby-frame
      >
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
      <div
        className="bg-background flex min-h-0 flex-1 flex-col overflow-y-auto xl:[@media(min-height:50rem)]:overflow-hidden"
        data-lobby-frame
      >
        <div className="text-content-secondary mx-auto flex max-w-7xl items-center gap-2 px-6 py-10 text-sm">
          <span className="bg-content-tertiary size-2 animate-pulse rounded-full" />
          Loading party room...
        </div>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div
        className="bg-background flex min-h-0 flex-1 flex-col overflow-y-auto xl:[@media(min-height:50rem)]:overflow-hidden"
        data-lobby-frame
      >
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

  if (isSpectator) {
    return (
      <SpectatorRoom
        lobby={lobby}
        activeGameId={activeGameId}
        stopping={stoppingSpectating}
        onStop={() => void handleStopSpectating()}
        onSpectate={(gameId) => router.push(`/game/${gameId}`)}
      />
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
  const settingsDisabled =
    mutating || starting || leaving || closing || hasActiveMatch;

  return (
    <TooltipProvider>
      <div
        className="bg-background flex min-h-0 flex-1 flex-col overflow-y-auto xl:[@media(min-height:50rem)]:overflow-hidden"
        data-lobby-frame
      >
        <header className="shrink-0" data-lobby-header>
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-6 py-8 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="w-full min-w-0 lg:w-auto">
              <p className="text-gold-600 text-xs font-semibold tracking-widest uppercase">
                Game mode
              </p>
              <h1 className="font-display text-content-primary mt-1 truncate text-4xl uppercase">
                {lobby.format}
              </h1>
            </div>

            <div className="flex w-full flex-wrap items-center gap-3 lg:w-auto lg:justify-end">
              <div className="min-w-0">
                <div
                  className="border-border bg-surface-3 inline-flex h-12 w-fit rounded-md border p-1"
                  role="group"
                  aria-label="Game mode"
                >
                  <button
                    type="button"
                    onClick={() => void onModeChange("PVP")}
                    disabled={!isHost || mutating || isInGame}
                    className={cn(
                      "focus-visible:outline-border-focus flex h-full items-center rounded px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
                      lobby.mode === "PVP"
                        ? "bg-accent text-accent-foreground disabled:opacity-100"
                        : "text-content-secondary hover:text-content-primary disabled:opacity-50"
                    )}
                    aria-pressed={lobby.mode === "PVP"}
                  >
                    Versus
                  </button>
                  <Tooltip
                    content={
                      solitaireBlockedReason ??
                      (!isHost
                        ? "Only the host can change game mode"
                        : undefined)
                    }
                  >
                    <span className="h-full">
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
                          "focus-visible:outline-border-focus flex h-full items-center rounded px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed",
                          lobby.mode === "SOLITAIRE"
                            ? "bg-accent text-accent-foreground disabled:opacity-100"
                            : "text-content-secondary hover:text-content-primary disabled:opacity-50"
                        )}
                        aria-pressed={lobby.mode === "SOLITAIRE"}
                        aria-describedby={
                          solitaireBlockedReason
                            ? "solitaire-mode-blocked-reason"
                            : undefined
                        }
                      >
                        Solitaire
                      </button>
                    </span>
                  </Tooltip>
                </div>

                {solitaireBlockedReason && (
                  <p
                    id="solitaire-mode-blocked-reason"
                    className="text-content-tertiary mt-1 max-w-xs text-xs"
                  >
                    {solitaireBlockedReason}
                  </p>
                )}
              </div>

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
                    disabled={mutating || starting || closing || hasActiveMatch}
                    initialCode={initialJoinCode}
                  />
                </span>
              </Tooltip>
            </div>
          </div>
        </header>

        <main
          className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 xl:[@media(min-height:50rem)]:min-h-0 xl:[@media(min-height:50rem)]:overflow-hidden"
          data-lobby-content
        >
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

          <div className="grid flex-1 gap-6 lg:grid-cols-2 xl:[@media(min-height:50rem)]:min-h-0">
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
                  disclosure={
                    isGuest ? (
                      <SpectatorPill
                        allowSpectators={lobby.allowSpectators}
                        spectatorCount={lobby.spectatorCount}
                        viewerRole={lobby.viewerRole}
                        toggling={spectatorToggling}
                        onToggle={(allowSpectators) =>
                          void handleSpectatorToggle(allowSpectators)
                        }
                        onOpenSpectators={handleOpenSpectators}
                        countButtonRef={spectatorCountButtonRef}
                      />
                    ) : undefined
                  }
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

        <div
          className="border-border bg-surface-1 sticky bottom-0 z-20 shrink-0 border-t shadow-[var(--shadow-lg)]"
          data-lobby-action-bar
        >
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-6 py-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              {!isGuest && (
                <SpectatorPill
                  allowSpectators={lobby.allowSpectators}
                  spectatorCount={lobby.spectatorCount}
                  viewerRole={lobby.viewerRole}
                  toggling={spectatorToggling}
                  onToggle={(allowSpectators) =>
                    void handleSpectatorToggle(allowSpectators)
                  }
                  onOpenSpectators={handleOpenSpectators}
                  countButtonRef={spectatorCountButtonRef}
                />
              )}
              <p className="text-content-tertiary text-xs">{startHint}</p>
            </div>

            <div className="flex items-center gap-3">
              {activeGameId ? (
                <ActiveMatchAction
                  gameId={activeGameId}
                  viewerRole={lobby.viewerRole}
                  onOpen={(gameId) => router.push(`/game/${gameId}`)}
                />
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
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  Start Match
                </Button>
              )}

              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={settingsDisabled}
                  >
                    <Settings data-icon="inline-start" />
                    Match settings
                  </Button>
                </DialogTrigger>
                <DialogContent size="lg">
                  <DialogTitle className="sr-only">Match settings</DialogTitle>
                  <PregameSettings
                    mode={lobby.mode}
                    value={lobby.pregameMode}
                    editable={Boolean(isHost)}
                    disabled={settingsDisabled}
                    onChange={(pregameMode) => void runPatch({ pregameMode })}
                  />
                </DialogContent>
              </Dialog>
            </div>
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
        <SpectatorsModal
          lobbyId={lobby.id}
          open={spectatorsOpen}
          spectatorCount={lobby.spectatorCount}
          spectators={lobby.spectators}
          viewerRole={lobby.viewerRole}
          returnFocusRef={spectatorCountButtonRef}
          onOpenChange={setSpectatorsOpen}
          onRefresh={refresh}
        />
      </div>
    </TooltipProvider>
  );
}

function SpectatorRoom({
  lobby,
  activeGameId,
  stopping,
  onStop,
  onSpectate,
}: {
  lobby: LobbyRoomState;
  activeGameId: string | null;
  stopping: boolean;
  onStop: () => void;
  onSpectate: (gameId: string) => void;
}) {
  const realGuestPresent =
    Boolean(lobby.guest) && lobby.guest?.user.id !== lobby.hostUserId;

  return (
    <div
      className="bg-background flex min-h-0 flex-1 flex-col overflow-y-auto xl:[@media(min-height:50rem)]:overflow-hidden"
      data-lobby-frame
    >
      <header className="shrink-0" data-lobby-header>
        <div className="mx-auto max-w-7xl px-6 py-8">
          <p className="text-gold-600 text-xs font-semibold tracking-widest uppercase">
            Watching party
          </p>
          <h1 className="font-display text-content-primary mt-1 text-4xl">
            {displayName(lobby.host, "Host")}&apos;s party
          </h1>
          <p className="text-content-secondary mt-2 text-sm">{lobby.format}</p>
        </div>
      </header>

      <main
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 xl:[@media(min-height:50rem)]:min-h-0 xl:[@media(min-height:50rem)]:overflow-hidden"
        data-lobby-content
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <SpectatorSeat
            role="Host"
            player={
              lobby.host ?? { username: null, name: "Host", image: null }
            }
            deck={lobby.hostDeck}
          />
          <SpectatorSeat
            role="Guest"
            player={
              realGuestPresent && lobby.guest
                ? lobby.guest.user
                : { username: null, name: "Waiting for player", image: null }
            }
            deck={realGuestPresent ? (lobby.guest?.deck ?? null) : null}
          />
        </div>

        <div className="border-border bg-surface-1 rounded-lg border p-6 text-center">
          <Eye className="text-gold-600 mx-auto size-6" aria-hidden="true" />
          <p className="text-content-primary mt-3 text-lg font-semibold">
            {activeGameId
              ? "Match in progress"
              : "Waiting for the match to start"}
          </p>
          <p className="text-content-secondary mt-2 text-sm">
            You can see who is playing. Only deck names are shared before the
            match.
          </p>
        </div>
      </main>

      <div
        className="border-border bg-surface-1 sticky bottom-0 z-20 shrink-0 border-t shadow-[var(--shadow-lg)]"
        data-lobby-action-bar
      >
        <div className="mx-auto flex max-w-7xl flex-col justify-end gap-3 px-6 py-4 sm:flex-row">
          <Button
            variant="secondary"
            size="lg"
            disabled={stopping}
            onClick={onStop}
          >
            {stopping ? "Stopping..." : "Stop spectating"}
          </Button>
          {activeGameId && (
            <ActiveMatchAction
              gameId={activeGameId}
              viewerRole={lobby.viewerRole}
              onOpen={onSpectate}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveMatchAction({
  gameId,
  viewerRole,
  onOpen,
}: {
  gameId: string;
  viewerRole: LobbyRoomState["viewerRole"];
  onOpen: (gameId: string) => void;
}) {
  return (
    <Button variant="gold" size="lg" onClick={() => onOpen(gameId)}>
      <Play data-icon="inline-start" />
      {viewerRole === "spectator" ? "Spectate Match" : "Rejoin Game"}
    </Button>
  );
}

function SpectatorSeat({
  role,
  player,
  deck,
}: {
  role: "Host" | "Guest";
  player: {
    username: string | null;
    name: string | null;
    image: string | null;
  };
  deck: LobbyRoomDeck | null;
}) {
  const playerName = displayName(player, "Player");

  return (
    <section
      className="border-border bg-surface-1 flex min-h-48 flex-col rounded-lg border"
      aria-label={`${role} seat — ${playerName}`}
    >
      <header className="border-border flex min-h-20 items-center gap-3 border-b px-5 py-4">
        <UserAvatar user={player} size="md" variant="dark" />
        <div className="min-w-0">
          <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
            {role}
          </p>
          <h2 className="text-content-primary truncate text-lg font-semibold">
            {playerName}
          </h2>
        </div>
      </header>
      <div className="flex flex-1 flex-col justify-center px-5 py-6">
        <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
          Deck
        </p>
        <p className="text-content-primary mt-2 text-base font-semibold">
          {deck?.name ?? "Waiting for deck selection"}
        </p>
      </div>
    </section>
  );
}

export function spectatorRemovalMessage(reason: SpectatorRemovalReason) {
  if (reason === "SPECTATING_DISABLED") {
    return "The host turned off spectating. You've been returned to your own lobby.";
  }
  if (reason === "REMOVED_BY_HOST") {
    return "The host removed you. You've been returned to your own lobby.";
  }
  return "The party closed. You've been returned to your own lobby.";
}

function SpectatorPill({
  allowSpectators,
  spectatorCount,
  viewerRole,
  toggling,
  onToggle,
  onOpenSpectators,
  countButtonRef,
}: {
  allowSpectators: boolean;
  spectatorCount: number;
  viewerRole: LobbyRoomState["viewerRole"];
  toggling: boolean;
  onToggle: (allowSpectators: boolean) => void;
  onOpenSpectators: () => void;
  countButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const isHost = viewerRole === "host";
  const watchingLabel = `${spectatorCount} watching`;
  const toggleLabel =
    allowSpectators && spectatorCount > 0
      ? `Allow spectators. Turning this off removes ${spectatorCount} ${
          spectatorCount === 1 ? "watcher" : "watchers"
        }.`
      : "Allow spectators";

  return (
    <div className="border-border bg-surface-3 flex min-h-10 items-center gap-3 rounded-full border p-1 pl-3">
      {isHost ? (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={allowSpectators}
            aria-label={toggleLabel}
            disabled={toggling}
            onClick={() => onToggle(!allowSpectators)}
            className={cn(
              "focus-visible:ring-border-focus relative h-6 w-10 shrink-0 rounded-full p-1 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait",
              allowSpectators ? "bg-navy-700" : "bg-content-tertiary"
            )}
          >
            <span
              className={cn(
                "bg-surface-1 block size-4 rounded-full transition-transform",
                allowSpectators && "translate-x-4"
              )}
            />
          </button>
          <span className="text-content-primary text-xs font-semibold tracking-widest uppercase">
            Spectators
          </span>
          <span className="sr-only">
            {allowSpectators ? "Spectators on" : "Spectators off"},{" "}
            {watchingLabel}
          </span>
        </>
      ) : (
        <span className="text-content-primary flex items-center gap-2 text-xs font-semibold">
          <Eye className="text-gold-600 size-4" aria-hidden="true" />
          Spectators {allowSpectators ? "on" : "off"} · {watchingLabel}
        </span>
      )}

      <button
        ref={countButtonRef}
        type="button"
        aria-label={`View spectators (${spectatorCount})`}
        onClick={onOpenSpectators}
        className="border-border bg-surface-1 text-content-primary hover:border-border-strong focus-visible:ring-border-focus inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {spectatorCount}
      </button>
    </div>
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
      className="border-border bg-surface-3 hover:border-border-strong focus-visible:outline-border-focus flex h-12 items-center gap-2 rounded-md border p-1 pl-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={copied ? "Party link copied" : "Copy party link"}
    >
      <span className="text-content-primary font-mono text-sm font-semibold tracking-widest">
        {code}
      </span>
      <span
        className={cn(
          "border-border bg-surface-1 rounded border px-3 py-2 text-xs font-semibold",
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
