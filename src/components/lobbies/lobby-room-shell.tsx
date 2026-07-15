"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Lock, Play, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useLobbyRoom, type LobbyRoomDeck } from "@/hooks/use-lobby-room";
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
import { lobbyRoomRecovery } from "./lobby-room-recovery";
import { InviteFriendPopover } from "./invite-friend-popover";
import { DeckListResponseSchema } from "@/lib/validators/cards";

interface DeckOption extends LobbyRoomDeck {
  format: string;
  totalCards: number;
  colors: string[];
}

interface LobbyRoomShellProps {
  lobbyId: string;
  currentUserId: string;
}

export function LobbyRoomShell({
  lobbyId,
  currentUserId,
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
    patchLobby,
    startLobby,
    leaveLobby,
    closeLobby,
  } = useLobbyRoom(lobbyId);
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [deckLoadError, setDeckLoadError] = useState<string | null>(null);
  const [previewDeckId, setPreviewDeckId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingSolitaire, setPendingSolitaire] = useState(false);

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

  useEffect(() => {
    if (!lobby) return;
    const recovery = lobbyRoomRecovery(lobby);
    if (!recovery) return;
    if (recovery.message) toast.info(recovery.message);
    router.push(recovery.route);
  }, [lobby, router]);

  const isHost = lobby?.hostUserId === currentUserId;
  const isGuest = lobby?.guest?.user.id === currentUserId && !isHost;
  const realGuestPresent =
    Boolean(lobby?.guest) && lobby?.guest?.user.id !== lobby?.hostUserId;
  const guestName = lobby?.guest
    ? displayName(lobby.guest.user, "Opponent")
    : "Opponent";

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
    await runPatch({ mode });
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

  if (loading && !lobby) {
    return (
      <div className="bg-surface-base flex-1 overflow-y-auto">
        <div className="text-text-secondary mx-auto flex max-w-5xl items-center gap-2 px-6 py-10 text-sm">
          <span className="bg-text-tertiary h-2 w-2 animate-pulse rounded-full" />
          Loading lobby...
        </div>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="bg-surface-base flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <div className="border-border bg-surface-1 rounded-lg border p-6">
            <p className="text-text-primary text-sm font-semibold">
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
      <div className="bg-surface-base flex-1 overflow-y-auto">
        <PageHeader>
          <PageHeaderContent>
            <PageHeaderTitle>Lobby Room</PageHeaderTitle>
            <PageHeaderDescription>
              Pick decks, ready up, then the host starts the game.
            </PageHeaderDescription>
          </PageHeaderContent>
          <PageHeaderActions>
            <Badge variant="secondary">{lobby.format}</Badge>
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
                disabled={!canStart || starting || closing}
              >
                {starting ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Play data-icon="inline-start" />
                )}
                Start Game
              </Button>
            )}
          </PageHeaderActions>
        </PageHeader>

        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
          <div className="border-border bg-surface-1 flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
            <Tabs value={lobby.mode} onValueChange={onModeChange}>
              <TabsList>
                <TabsTrigger value="PVP" disabled={!isHost || mutating}>
                  PVP
                </TabsTrigger>
                <TabsTrigger value="SOLITAIRE" disabled={!isHost || mutating}>
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
            <p className="text-text-secondary max-w-xl text-sm">
              {isHost
                ? "You control lobby mode and the Start button."
                : "The host controls mode and starts the game."}
            </p>
          </div>

          {deckLoadError && (
            <div className="border-error/30 bg-surface-1 text-error rounded-lg border p-4 text-sm">
              {deckLoadError}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
            <SeatPanel
              label="Side A"
              playerName={displayName(lobby.host, "Host")}
              deck={lobby.hostDeck}
              ready={lobby.hostReady}
              editable={Boolean(isHost)}
              readyEditable={Boolean(isHost)}
              readyDisabled={!lobby.hostDeck || mutating}
              decks={decks}
              selectPlaceholder="Choose host deck"
              onDeckChange={(deckId) => runPatch({ hostDeckId: deckId })}
              onReadyChange={(ready) => runPatch({ ready })}
              onPreview={setPreviewDeckId}
            />

            <div className="flex items-center justify-center">
              <div className="border-border bg-surface-1 text-text-tertiary rounded-full border px-4 py-2 text-xs font-semibold uppercase">
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
                  editable={Boolean(isGuest)}
                  readyEditable={Boolean(isGuest)}
                  readyDisabled={!lobby.guest.deck || mutating}
                  decks={decks}
                  selectPlaceholder="Choose guest deck"
                  onDeckChange={(deckId) => runPatch({ guestDeckId: deckId })}
                  onReadyChange={(ready) => runPatch({ ready })}
                  onPreview={setPreviewDeckId}
                />
              ) : (
                <InvitePanel
                  lobbyId={lobby.id}
                  joinCode={lobby.joinCode}
                  copied={copied}
                  onCopy={copyInvite}
                  showInviteFriend={isHost}
                />
              )
            ) : (
              <SeatPanel
                label="Side B"
                playerName={displayName(lobby.host, "Host")}
                deck={lobby.guest?.deck ?? null}
                ready={false}
                showReady={false}
                editable={Boolean(isHost)}
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
            <div className="border-border bg-surface-1 rounded-lg border p-5">
              <p className="text-text-secondary text-sm">
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
            <p className="text-text-tertiary text-xs">
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
                  void runPatch({ mode: "SOLITAIRE" }, { force: true }).then(
                    () => setPendingSolitaire(false)
                  );
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
}) {
  return (
    <section className="border-border bg-surface-1 flex min-h-[480px] flex-col gap-5 rounded-lg border p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-text-tertiary text-xs font-semibold tracking-widest uppercase">
            {label}
          </p>
          <p className="text-text-primary mt-1 text-lg font-semibold">
            {playerName}
          </p>
        </div>
        {showReady && (
          <Badge variant={ready ? "default" : "secondary"}>
            {ready ? "Ready" : "Not Ready"}
          </Badge>
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          if (deck) onPreview(deck.id);
        }}
        disabled={!deck}
        className={cn(
          "bg-surface-2 flex min-h-72 items-center justify-center rounded-lg transition-transform",
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
          <div className="text-text-tertiary flex flex-col items-center gap-3">
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
          <div className="border-border bg-surface-base text-text-secondary flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
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

function InvitePanel({
  lobbyId,
  joinCode,
  copied,
  onCopy,
  showInviteFriend,
}: {
  lobbyId: string;
  joinCode: string;
  copied: boolean;
  onCopy: () => void;
  showInviteFriend: boolean;
}) {
  return (
    <section className="border-border-strong bg-surface-1 flex min-h-[480px] flex-col items-center justify-center gap-5 rounded-lg border border-dashed p-5 text-center">
      <div>
        <p className="text-text-tertiary text-xs font-semibold tracking-widest uppercase">
          Side B
        </p>
        <p className="text-text-primary mt-2 text-lg font-semibold">
          Waiting for opponent
        </p>
        <p className="text-text-secondary mt-2 text-sm">
          Share the room code when your opponent is ready.
        </p>
      </div>
      <code className="border-border bg-surface-base text-text-primary rounded-md border px-4 py-2 font-mono text-lg font-bold tracking-[0.3em]">
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
        {showInviteFriend && <InviteFriendPopover lobbyId={lobbyId} />}
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
