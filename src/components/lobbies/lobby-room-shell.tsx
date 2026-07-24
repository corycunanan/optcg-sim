"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Lock, Play, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiDelete, apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { claimLobbyRecovery } from "@/lib/lobbies/recovery-once";
import {
  useLobbyRoom,
  type LobbyRoomDeck,
  type LobbyRoomState,
} from "@/hooks/use-lobby-room";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
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
import { PregameSettings } from "./pregame-settings";
import { KickPlayerAction } from "./kick-player-action";
import { DeckListResponseSchema } from "@/lib/validators/cards";
import { UserAvatar } from "@/components/social/user-avatar";

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
    if (!claimLobbyRecovery(lobbyId)) return;
    if (recovery.message) toast.info(recovery.message);
    router.push(recovery.route);
  }, [lobbyId, recovery, router]);

  const isHost = lobby?.hostUserId === currentUserId;
  const isGuest = lobby?.guest?.user.id === currentUserId && !isHost;
  const isInGame = lobby?.status === "IN_GAME";
  const activeGameId = lobby ? rejoinGameId(lobby) : null;
  const canEditPregame = Boolean(
    isHost && (lobby?.status === "WAITING" || lobby?.status === "READY")
  );
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
      onSuccess: () => toast.success("Lobby closed"),
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

  if (recovery) return null;

  if (loading && !lobby) {
    return (
      <div className="bg-background flex-1 overflow-y-auto">
        <div className="text-content-secondary mx-auto flex max-w-5xl items-center gap-2 px-6 py-10 text-sm">
          <span className="bg-content-tertiary h-2 w-2 animate-pulse rounded-full" />
          Loading lobby...
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

  return (
    <TooltipProvider>
      <div className="bg-background flex-1 overflow-y-auto">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>Lobby Room</PageHeaderTitle>
            <PageHeaderDescription>
              {activeGameId
                ? "Your match is in progress. Rejoin when you are ready."
                : isInGame
                  ? "The match has ended. This room is waiting to reset."
                  : "Pick decks, ready up, then the host starts the game."}
            </PageHeaderDescription>
          </PageHeaderContent>
          <PageHeaderActions>
            <Badge variant="secondary">{lobby.format}</Badge>
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
              <>
                <JoinPartyDialog
                  disabled={mutating || starting || closing}
                  initialCode={initialJoinCode}
                />
                <GuestLeaveAction
                  isGuest={Boolean(isGuest)}
                  leaving={leaving}
                  disabled={mutating}
                  onLeave={() => void handleLeave()}
                />
                <HostCloseAction
                  canClose={Boolean(
                    isHost &&
                    lobby.mode === "PVP" &&
                    (lobby.status === "WAITING" || lobby.status === "READY")
                  )}
                  guestName={realGuestPresent ? guestName : null}
                  closing={closing}
                  disabled={mutating || starting}
                  onClose={() => void handleClose()}
                />
                {isHost && (
                  <Button
                    onClick={handleStart}
                    disabled={!canStart || mutating || starting || closing}
                  >
                    {starting ? (
                      <Loader2
                        data-icon="inline-start"
                        className="animate-spin"
                      />
                    ) : (
                      <Play data-icon="inline-start" />
                    )}
                    Start Game
                  </Button>
                )}
              </>
            )}
          </PageHeaderActions>
        </PageHeader>

        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
          {joinError && (
            <div
              className="border-error/30 bg-card text-error rounded-lg border p-4 text-sm"
              role="alert"
            >
              {joinError}
            </div>
          )}
          <div className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
            <Tabs value={lobby.mode} onValueChange={onModeChange}>
              <TabsList>
                <TabsTrigger
                  value="PVP"
                  disabled={!isHost || mutating || isInGame}
                >
                  PVP
                </TabsTrigger>
                <TabsTrigger
                  value="SOLITAIRE"
                  disabled={!isHost || mutating || isInGame}
                >
                  Solitaire
                </TabsTrigger>
                <Tooltip content="Coming soon">
                  <span>
                    <TabsTrigger
                      value="PVCOMPUTER"
                      disabled
                      aria-disabled="true"
                      className="pointer-events-auto"
                    >
                      PVComputer
                    </TabsTrigger>
                  </span>
                </Tooltip>
              </TabsList>
            </Tabs>
            <p className="text-content-secondary max-w-xl text-sm">
              {isHost
                ? "You control lobby mode and the Start button."
                : "The host controls mode and starts the game."}
            </p>
          </div>

          <PregameSettings
            mode={lobby.mode}
            value={lobby.pregameMode}
            editable={canEditPregame}
            disabled={mutating || starting}
            onChange={(pregameMode) => runPatch({ pregameMode })}
          />

          {deckLoadError && (
            <div className="border-error/30 bg-card text-error rounded-lg border p-4 text-sm">
              {deckLoadError}
            </div>
          )}

          <div
            className={cn(
              "grid gap-6 lg:grid-cols-[1fr_auto_1fr]",
              isInGame && "pointer-events-none opacity-45"
            )}
          >
            <SeatPanel
              label="Side A"
              playerName={displayName(lobby.host, "Host")}
              deck={lobby.hostDeck}
              ready={lobby.hostReady}
              editable={Boolean(isHost && !isInGame)}
              readyEditable={Boolean(isHost && !isInGame)}
              readyDisabled={!lobby.hostDeck || mutating}
              decks={decks}
              selectPlaceholder="Choose host deck"
              onDeckChange={(deckId) => runPatch({ hostDeckId: deckId })}
              onReadyChange={(ready) => runPatch({ ready })}
              onPreview={setPreviewDeckId}
            />

            <div className="flex items-center justify-center">
              <div className="border-border bg-card text-content-tertiary rounded-full border px-4 py-2 text-xs font-semibold uppercase">
                {lobby.mode === "SOLITAIRE" ? "Solo Test" : "Versus"}
              </div>
            </div>

            {lobby.mode === "PVP" ? (
              lobby.guest && realGuestPresent ? (
                <SeatPanel
                  label="Side B"
                  playerName={guestName}
                  deck={lobby.guest.deck}
                  ready={lobby.guest.guestReady}
                  editable={Boolean(isGuest && !isInGame)}
                  readyEditable={Boolean(isGuest && !isInGame)}
                  readyDisabled={!lobby.guest.deck || mutating}
                  actions={
                    isHost ? (
                      <KickPlayerAction
                        playerName={guestName}
                        kicking={kicking}
                        disabled={mutating || starting || isInGame}
                        onKick={() => void handleKick()}
                      />
                    ) : null
                  }
                  decks={decks}
                  selectPlaceholder="Choose guest deck"
                  onDeckChange={(deckId) => runPatch({ guestDeckId: deckId })}
                  onReadyChange={(ready) => runPatch({ ready })}
                  onPreview={setPreviewDeckId}
                />
              ) : (
                <InvitePanel
                  key={pendingInvite?.id ?? "open-seat"}
                  lobbyId={lobby.id}
                  joinCode={lobby.joinCode}
                  copied={copied}
                  onCopy={copyInvite}
                  showInviteFriend={isHost}
                  pendingInvite={pendingInvite}
                  cancelingInvite={cancelingInvite}
                  onInviteSent={() => void refresh()}
                  onCancelInvite={() => void handleCancelInvite()}
                />
              )
            ) : (
              <SeatPanel
                label="Side B"
                playerName={displayName(lobby.host, "Host")}
                deck={lobby.guest?.deck ?? null}
                ready={false}
                showReady={false}
                editable={Boolean(isHost && !isInGame)}
                readyEditable={false}
                readyDisabled
                decks={decks}
                selectPlaceholder="Choose side-B deck"
                onDeckChange={(deckId) => runPatch({ guestDeckId: deckId })}
                onReadyChange={() => undefined}
                onPreview={setPreviewDeckId}
              />
            )}
          </div>

          {decks.length === 0 && (
            <div className="border-border bg-card rounded-lg border p-5">
              <p className="text-content-secondary text-sm">
                You can sit in the room now, but you need a playable deck before
                you can ready and start.
              </p>
              <Button
                className="mt-4"
                variant="secondary"
                onClick={() => router.push("/decks")}
              >
                Build a Deck
              </Button>
            </div>
          )}

          {ownDeck && ownDeck.totalCards < 50 && (
            <p className="text-content-tertiary text-xs">
              Deck legality is checked when Start is clicked, so unfinished
              decks can stay selected while players coordinate.
            </p>
          )}
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

function SeatPanel({
  label,
  playerName,
  deck,
  ready,
  showReady = true,
  editable,
  readyEditable,
  readyDisabled,
  decks,
  selectPlaceholder,
  onDeckChange,
  onReadyChange,
  onPreview,
  actions,
}: {
  label: string;
  playerName: string;
  deck: LobbyRoomDeck | null;
  ready: boolean;
  showReady?: boolean;
  editable: boolean;
  readyEditable: boolean;
  readyDisabled: boolean;
  decks: DeckOption[];
  selectPlaceholder: string;
  onDeckChange: (deckId: string) => void;
  onReadyChange: (ready: boolean) => void;
  onPreview: (deckId: string) => void;
  actions?: ReactNode;
}) {
  return (
    <section className="border-border bg-card flex min-h-[480px] flex-col gap-5 rounded-lg border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
            {label}
          </p>
          <p className="text-content-primary mt-1 text-lg font-semibold">
            {playerName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showReady && (
            <Badge variant={ready ? "default" : "secondary"}>
              {ready ? "Ready" : "Not Ready"}
            </Badge>
          )}
          {actions}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (deck) onPreview(deck.id);
        }}
        disabled={!deck}
        className={cn(
          "bg-secondary flex min-h-72 items-center justify-center rounded-lg transition-transform",
          deck && "hover:scale-[1.02]"
        )}
      >
        {deck?.leaderImageUrl ? (
          <img
            src={deck.leaderImageUrl}
            alt={deck.leaderName ?? deck.name}
            className="h-72 rounded-lg object-contain shadow-[var(--shadow-md)]"
          />
        ) : (
          <div className="text-content-tertiary flex flex-col items-center gap-3">
            <UserRound />
            <span className="text-sm">No deck selected</span>
          </div>
        )}
      </button>

      <div className="flex flex-col gap-3">
        {editable ? (
          <Select value={deck?.id ?? ""} onValueChange={onDeckChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={selectPlaceholder} />
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
          <div className="border-border bg-background text-content-secondary flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <Lock />
            {deck?.name ?? "Waiting for deck"}
          </div>
        )}

        {readyEditable && (
          <Button
            variant={ready ? "secondary" : "default"}
            onClick={() => onReadyChange(!ready)}
            disabled={readyDisabled}
          >
            <Check data-icon="inline-start" />
            {ready ? "Unready" : "Ready"}
          </Button>
        )}
      </div>
    </section>
  );
}

export function InvitePanel({
  lobbyId,
  joinCode,
  copied,
  onCopy,
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
      <section className="border-border bg-card flex min-h-[480px] flex-col items-center justify-center gap-5 rounded-lg border p-5 text-center">
        <div className="ring-primary/30 animate-pulse rounded-full ring-2">
          <UserAvatar user={pendingInvite.user} size="md" />
        </div>
        <div>
          <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
            Side B
          </p>
          <p className="text-content-primary mt-2 text-lg font-semibold">
            Invite sent to {pendingInviteName}
          </p>
          <p className="text-content-secondary mt-2 text-sm tabular-nums">
            Expires in {formatInviteCountdown(timing.remainingMs)}
          </p>
        </div>
        {showInviteFriend && (
          <Button
            variant="secondary"
            onClick={onCancelInvite}
            disabled={cancelingInvite}
          >
            {cancelingInvite ? "Canceling..." : "Cancel invite"}
          </Button>
        )}
      </section>
    );
  }

  return (
    <section className="border-border-strong bg-card flex min-h-[480px] flex-col items-center justify-center gap-5 rounded-lg border border-dashed p-5 text-center">
      <div>
        <p className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
          Side B
        </p>
        <p className="text-content-primary mt-2 text-lg font-semibold">
          Open seat
        </p>
        <p className="text-content-secondary mt-2 text-sm">
          {pendingInvite && pendingInviteName && timing?.kind === "expired"
            ? `Invite to ${pendingInviteName} expired`
            : "Share the room code when your opponent is ready."}
        </p>
      </div>
      <code className="border-border bg-background text-content-primary rounded-md border px-4 py-2 font-mono text-lg font-bold tracking-[0.3em]">
        {joinCode}
      </code>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" onClick={onCopy}>
          {copied ? (
            <Check data-icon="inline-start" />
          ) : (
            <Copy data-icon="inline-start" />
          )}
          {copied ? "Copied" : "Copy Invite"}
        </Button>
        {showInviteFriend && (
          <InviteFriendPopover lobbyId={lobbyId} onInviteSent={onInviteSent} />
        )}
      </div>
    </section>
  );
}

function displayName(
  user: { username?: string | null; name?: string | null } | null,
  fallback: string
) {
  return user?.username ?? user?.name ?? fallback;
}
