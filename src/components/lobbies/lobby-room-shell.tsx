"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Play, Plus, Settings } from "lucide-react";
import { toast } from "sonner";
import { resolvePregameMode } from "@shared/game-init";
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
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/social/user-avatar";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import { DeckPreviewModal } from "./deck-preview-modal";
import { GuestLeaveMenuItem, runGuestLeave } from "./guest-leave-action";
import {
  HostCloseConfirmDialog,
  HostCloseMenuItem,
  runHostClose,
} from "./host-close-action";
import { lobbyRoomRecovery, rejoinGameId } from "./lobby-room-recovery";
import { InviteFriendPopover } from "./invite-friend-popover";
import {
  formatInviteCountdown,
  resolveInviteSeatTiming,
} from "./invite-countdown";
import { JoinPartyDialog } from "./join-party-dialog";
import {
  KickPlayerConfirmDialog,
  KickPlayerMenuItem,
} from "./kick-player-action";
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
  const [confirmDisband, setConfirmDisband] = useState(false);
  // The kick confirmation pins the guest it was opened against. `DELETE
  // /api/lobbies/[id]/guest` targets whoever is seated, so a boolean would let
  // a confirmation opened against guest A land on replacement guest B.
  const [kickTarget, setKickTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const recoveryHandledRef = useRef(false);
  const spectatorCountButtonRef = useRef<HTMLButtonElement>(null);
  const viewerRole = lobby?.viewerRole;
  const { presence, trackPresence } = useUserChannelEvents();

  const hostUserId = lobby?.hostUserId ?? null;
  const guestUserId = lobby?.guest?.user.id ?? null;

  // Retract the confirmation the moment the seat it targeted changes hands or
  // empties. Adjusted during render rather than in an effect so the stale
  // dialog never paints.
  if (kickTarget && guestUserId !== kickTarget.id) {
    setKickTarget(null);
  }

  // Mirror of the seated guest that `handleKick` can read without depending on
  // the closure the confirmation captured when it opened.
  const seatedGuestIdRef = useRef<string | null>(guestUserId);
  useEffect(() => {
    seatedGuestIdRef.current = guestUserId;
  }, [guestUserId]);

  useEffect(() => {
    const ids = [hostUserId, guestUserId].filter(
      (id): id is string => Boolean(id) && id !== currentUserId
    );
    if (ids.length > 0) trackPresence(ids);
  }, [hostUserId, guestUserId, currentUserId, trackPresence]);

  // The viewer is, by definition, connected — presence only reports on other
  // users (and is friendship-gated server-side), so seat it locally.
  const seatOnline = (userId: string | null) =>
    userId
      ? userId === currentUserId || Boolean(presence[userId]?.online)
      : false;

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
  const isSolitaire = lobby?.mode === "SOLITAIRE";
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
      // Both sides belong to the host, so readiness has no one to signal to:
      // a deck on each side is the whole prerequisite. `POST
      // /api/lobbies/[id]/start` applies the same rule server-side.
      return Boolean(lobby.hostDeck && lobby.guest?.deck);
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

  const handleKick = async (target: { id: string; name: string }) => {
    // Last check before the seat-scoped DELETE: the guest may have left (and
    // been replaced) between opening the confirmation and confirming it.
    if (seatedGuestIdRef.current !== target.id) {
      toast.info(`${target.name} already left the party`);
      await refresh();
      return;
    }
    try {
      await kickGuest();
      toast.success(`${target.name} was removed from the party`);
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
        className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden"
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
        className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden"
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
        className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden"
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
  const canDisband = Boolean(
    isHost &&
    lobby.mode === "PVP" &&
    (lobby.status === "WAITING" || lobby.status === "READY")
  );
  const displayedPregameMode =
    resolvePregameMode(
      lobby.mode === "SOLITAIRE" ? "SOLITAIRE" : "PVP",
      lobby.pregameMode,
      false
    ) ?? lobby.pregameMode;

  const handlePregameModeChange = (
    pregameMode: LobbyRoomState["pregameMode"]
  ) => {
    if (!isHost || settingsDisabled) return;
    void runPatch({ pregameMode });
  };

  return (
    <TooltipProvider>
      <div
        className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden"
        data-lobby-frame
      >
        {/* The frame never scrolls, so vertical padding is the first thing to
            give: full rhythm only once the viewport is both wide and tall
            enough to spend it, compressed everywhere else so the seats keep
            their height. The header carries top padding only — the content
            well below owns the whole header→content gap. */}
        {/* The actions row here is a mode toggle, a party code and a join
            dialog, so it needs the full `lg` width before it can sit beside
            the title — the primitive's `sm` stacking point is pushed out
            rather than inherited. */}
        <PageHeader
          className="shrink-0 flex-col items-start gap-3 pt-4 sm:flex-col sm:items-start lg:flex-row lg:items-center lg:gap-6 lg:[@media(min-height:50rem)]:pt-8"
          data-lobby-header
        >
          <PageHeaderContent className="w-full gap-1 lg:w-auto">
            <PageHeaderEyebrow>Game mode</PageHeaderEyebrow>
            <PageHeaderTitle className="truncate">
              {lobby.format}
            </PageHeaderTitle>
          </PageHeaderContent>

          <PageHeaderActions className="w-full gap-3 lg:w-auto lg:justify-end">
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
                    (!isHost ? "Only the host can change game mode" : undefined)
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
          </PageHeaderActions>
        </PageHeader>

        {/* The content well's top padding matches the header's top padding at
            every height gate, so the header→content gap reads as the same step
            as the header's own inset instead of doubling it. Below `lg` the
            fixed chrome — a wrapped header above, a stacked action bar below —
            already spends most of a short viewport, so the well gives up a
            step at the bottom before the seats have to give up a row. */}
        <main
          className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 overflow-hidden px-6 pt-4 pb-3 lg:pb-4 lg:[@media(min-height:50rem)]:gap-6 lg:[@media(min-height:50rem)]:pt-8 lg:[@media(min-height:50rem)]:pb-8"
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

          {/* Side by side from `lg`, where `auto-rows-fr` pins the single row
              to the available height so neither cell can grow the frame. In one
              column the cells keep their natural heights and stack — they are
              `shrink-0`, because a cell squeezed below the height it just laid
              out paints its own controls over the cell beneath it.
              `overflow-y-auto` is the release valve for that rigidity: the page
              and the frame stay locked, and on viewports where the fixed chrome
              leaves less room than two compact panels need, this region — and
              only this region — scrolls instead of overlapping. */}
          <div
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:grid lg:auto-rows-fr lg:grid-cols-2 lg:overflow-visible lg:[@media(min-height:50rem)]:gap-6"
            data-lobby-seats
          >
            <LobbySeatCard
              role={isSolitaire ? "Side 1" : "Host"}
              player={
                lobby.host ?? { username: null, name: "Host", image: null }
              }
              online={seatOnline(lobby.hostUserId)}
              deck={lobby.hostDeck}
              readiness={
                isSolitaire
                  ? undefined
                  : {
                      ready: lobby.hostReady,
                      editable: Boolean(isHost && !isInGame),
                      disabled: !lobby.hostDeck || mutating,
                      onChange: (ready) => void runPatch({ ready }),
                    }
              }
              deckEditable={Boolean(isHost && !isInGame)}
              decks={decks}
              onDeckChange={(deckId) => void runPatch({ hostDeckId: deckId })}
              onPreview={setPreviewDeckId}
              dimmed={isInGame}
              menuItems={
                canDisband ? (
                  <HostCloseMenuItem
                    closing={closing}
                    disabled={mutating || starting}
                    onSelect={() => setConfirmDisband(true)}
                  />
                ) : null
              }
            />

            {lobby.mode === "PVP" ? (
              lobby.guest && realGuestPresent ? (
                <LobbySeatCard
                  role="Guest"
                  player={lobby.guest.user}
                  online={seatOnline(lobby.guest.user.id)}
                  deck={lobby.guest.deck}
                  readiness={{
                    ready: lobby.guest.guestReady,
                    editable: Boolean(isGuest && !isInGame),
                    disabled: !lobby.guest.deck || mutating,
                    onChange: (ready) => void runPatch({ ready }),
                  }}
                  deckEditable={Boolean(isGuest && !isInGame)}
                  decks={decks}
                  onDeckChange={(deckId) =>
                    void runPatch({ guestDeckId: deckId })
                  }
                  onPreview={setPreviewDeckId}
                  dimmed={isInGame}
                  menuItems={
                    isHost ? (
                      <KickPlayerMenuItem
                        playerName={guestName}
                        kicking={kicking}
                        disabled={mutating || starting || isInGame}
                        onSelect={() => {
                          if (!guestUserId) return;
                          setKickTarget({ id: guestUserId, name: guestName });
                        }}
                      />
                    ) : isGuest ? (
                      <GuestLeaveMenuItem
                        leaving={leaving}
                        disabled={mutating || hasActiveMatch}
                        onLeave={() => void handleLeave()}
                      />
                    ) : null
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
              /* Solitaire is one player at both ends of the table, so the
                 second side is the same seat again — same person, same
                 composition, same deck mechanics — distinguished only by the
                 role it is playing. */
              <LobbySeatCard
                role="Side 2"
                player={
                  lobby.host ?? { username: null, name: "Host", image: null }
                }
                online={seatOnline(lobby.hostUserId)}
                deck={lobby.guest?.deck ?? null}
                deckEditable={Boolean(isHost && !isInGame)}
                decks={decks}
                onDeckChange={(deckId) =>
                  void runPatch({ guestDeckId: deckId })
                }
                onPreview={setPreviewDeckId}
                dimmed={isInGame}
              />
            )}
          </div>

          {decks.length === 0 && (
            <p className="text-content-tertiary shrink-0 text-center text-sm">
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
            <p className="text-content-tertiary shrink-0 text-center text-xs">
              Deck legality is checked when Start is clicked, so unfinished
              decks can stay selected while players coordinate.
            </p>
          )}
        </main>

        <div
          className="border-border bg-surface-1 sticky bottom-0 z-20 shrink-0 border-t shadow-[var(--shadow-lg)]"
          data-lobby-action-bar
        >
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-6 py-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <div className="flex justify-start">
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
            </div>

            <div
              className="flex justify-start lg:justify-center"
              data-lobby-match-actions
            >
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
                  className="disabled:border-border disabled:bg-surface-3 disabled:text-content-tertiary disabled:opacity-100"
                  onClick={() => void handleStart()}
                  disabled={
                    !canStart || mutating || starting || closing || isInGame
                  }
                  title={!canStart ? startHint : undefined}
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
            </div>

            <div className="flex justify-start lg:justify-end">
              <Dialog>
                <TooltipRoot>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Match settings"
                        disabled={settingsDisabled}
                      >
                        <Settings aria-hidden="true" />
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Match settings</TooltipContent>
                </TooltipRoot>
                <DialogContent size="lg">
                  <DialogTitle className="sr-only">Match settings</DialogTitle>
                  <PregameSettings
                    mode={lobby.mode}
                    value={displayedPregameMode}
                    editable={Boolean(isHost)}
                    disabled={settingsDisabled}
                    onChange={handlePregameModeChange}
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

        <HostCloseConfirmDialog
          open={confirmDisband}
          onOpenChange={setConfirmDisband}
          guestName={realGuestPresent ? guestName : null}
          closing={closing}
          onClose={() => void handleClose()}
        />
        <KickPlayerConfirmDialog
          open={kickTarget !== null}
          onOpenChange={(open) => {
            if (!open) setKickTarget(null);
          }}
          playerName={kickTarget?.name ?? guestName}
          kicking={kicking}
          onKick={() => {
            const target = kickTarget;
            setKickTarget(null);
            if (target) void handleKick(target);
          }}
        />

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
      className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden"
      data-lobby-frame
    >
      <PageHeader
        className="shrink-0 pt-4 lg:[@media(min-height:50rem)]:pt-8"
        data-lobby-header
      >
        {/* The host's display name is user-controlled, so this title truncates
            like the regular room's does — an unbroken 200-character username
            would otherwise widen the fixed frame. */}
        <PageHeaderContent className="w-full gap-1">
          <PageHeaderEyebrow>Watching party</PageHeaderEyebrow>
          <PageHeaderTitle className="truncate">
            {displayName(lobby.host, "Host")}&apos;s party
          </PageHeaderTitle>
          <PageHeaderDescription className="mt-1 truncate">
            {lobby.format}
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {/* Top padding matches the header's at every height gate. */}
      <main
        className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 overflow-hidden px-6 py-4 lg:[@media(min-height:50rem)]:gap-6 lg:[@media(min-height:50rem)]:pt-8 lg:[@media(min-height:50rem)]:pb-8"
        data-lobby-content
      >
        <div className="grid min-h-0 gap-4 lg:grid-cols-2 lg:[@media(min-height:50rem)]:gap-6">
          <SpectatorSeat
            role="Host"
            player={lobby.host ?? { username: null, name: "Host", image: null }}
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

        <div className="border-border bg-surface-1 shrink-0 rounded-lg border p-4 text-center lg:[@media(min-height:50rem)]:p-6">
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
          <Button size="lg" disabled={stopping} onClick={onStop}>
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
      className="border-border bg-surface-1 flex min-h-0 flex-col overflow-hidden rounded-lg border"
      aria-label={`${role} seat — ${playerName}`}
    >
      <header className="border-border flex min-h-16 shrink-0 items-center gap-3 border-b px-5 py-3 lg:min-h-20 lg:py-4">
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
      <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-4 lg:[@media(min-height:50rem)]:py-6">
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
    <div
      className="border-border bg-surface-3 flex min-h-10 items-center gap-3 rounded border p-1 pl-3"
      data-spectator-control
    >
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
              "focus-visible:ring-border-focus relative h-6 w-10 shrink-0 rounded p-1 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait",
              allowSpectators ? "bg-gold-500" : "bg-content-tertiary"
            )}
          >
            <span
              className={cn(
                "block size-4 rounded transition-transform",
                allowSpectators ? "bg-navy-900 translate-x-4" : "bg-surface-1"
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
        className="border-border bg-surface-1 text-content-primary hover:border-border-strong focus-visible:ring-border-focus inline-flex size-8 shrink-0 items-center justify-center rounded border text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
      <section
        aria-label="Guest seat — invite pending"
        className="border-border bg-surface-1 flex min-h-0 shrink-0 grow flex-col overflow-hidden rounded-lg border"
      >
        <header className="border-border flex min-h-16 shrink-0 items-center gap-3 border-b px-5 py-3 lg:min-h-20 lg:py-4">
          <div className="ring-gold-500/30 shrink-0 animate-pulse rounded-full ring-2">
            <UserAvatar user={pendingInvite.user} size="md" variant="dark" />
          </div>
          <div className="min-w-0">
            <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
              Guest
            </p>
            <h2 className="text-content-primary text-lg font-semibold">
              Invite pending
            </h2>
          </div>
        </header>
        {/* The waiting state is a countdown and a way out. On short and narrow
            viewports everything else — the display heading, the reassurance
            line, the column arrangement — yields so those two never leave the
            frame. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-4 text-center lg:gap-4 lg:[@media(min-height:50rem)]:gap-5 lg:[@media(min-height:50rem)]:py-10">
          <div className="w-full min-w-0">
            <h3 className="font-display text-content-primary truncate text-base lg:[@media(min-height:50rem)]:text-2xl">
              Invite sent to {pendingInviteName}
            </h3>
            <p className="text-content-secondary mt-2 hidden text-sm lg:[@media(min-height:50rem)]:block">
              Their seat is reserved until the invitation expires.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 lg:flex-col lg:[@media(min-height:50rem)]:gap-5">
            <p className="border-border bg-surface-3 text-content-primary rounded border px-4 py-2 text-sm font-semibold tabular-nums">
              Expires in {formatInviteCountdown(timing.remainingMs)}
            </p>
            {showInviteFriend && (
              <Button onClick={onCancelInvite} disabled={cancelingInvite}>
                {cancelingInvite ? "Canceling..." : "Cancel invite"}
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-border-strong bg-surface-1 flex min-h-0 shrink-0 grow flex-col overflow-hidden rounded-lg border border-dashed">
      <header className="border-border flex min-h-16 shrink-0 items-center gap-3 border-b border-dashed px-5 py-3 text-left lg:min-h-20 lg:py-4">
        <div
          className="border-content-tertiary flex size-12 shrink-0 items-center justify-center rounded border border-dashed"
          aria-hidden="true"
        >
          <Plus className="text-content-tertiary size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
            Waiting for a challenger
          </p>
          <h2 className="text-content-primary mt-1 text-lg font-semibold">
            Open seat
          </h2>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 py-4 text-center lg:[@media(min-height:50rem)]:py-8">
        {pendingInvite && pendingInviteName && timing?.kind === "expired" && (
          <p className="text-content-secondary text-sm">
            {pendingInvite && pendingInviteName && timing?.kind === "expired"
              ? `Invite to ${pendingInviteName} expired`
              : null}
          </p>
        )}
        {showInviteFriend && (
          <InviteFriendPopover
            lobbyId={lobbyId}
            onInviteSent={onInviteSent}
            triggerVariant="open-seat"
          />
        )}
      </div>
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
  if (!lobby.hostDeck || !lobby.guest?.deck) {
    return lobby.mode === "SOLITAIRE"
      ? "Both sides need a deck"
      : "Both players need a deck";
  }
  if (lobby.mode === "PVP" && (!lobby.hostReady || !lobby.guest.guestReady))
    return "Both players must be ready";
  return "Everything is set";
}

function displayName(
  user: { username?: string | null; name?: string | null } | null,
  fallback: string
) {
  return user?.username ?? user?.name ?? fallback;
}
