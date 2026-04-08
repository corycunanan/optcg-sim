"use client";

import { useRouter } from "next/navigation";
import { Plus, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { useLobbySession } from "@/hooks/use-lobby-session";

interface LobbiesShellProps {
  user: {
    name: string;
    image: string | null;
  };
}

export function LobbiesShell({ user }: LobbiesShellProps) {
  const router = useRouter();
  const lobby = useLobbySession();

  // ─── Loading state ────────────────────────────────────────────────────────

  if (lobby.activeGameLoading) {
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
            {lobby.activeGameId
              ? "You have a game in progress."
              : lobby.isWaiting
                ? "Waiting for an opponent to join your lobby."
                : "Setting up your lobby..."}
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          {!lobby.activeGameId && (
            <Popover open={lobby.joinOpen} onOpenChange={lobby.setJoinOpen}>
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
                    value={lobby.joinCode}
                    onChange={(value) => lobby.setJoinCode(value.toUpperCase())}
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
                  {lobby.joinError && (
                    <p className="text-xs text-error">{lobby.joinError}</p>
                  )}
                  <Button
                    onClick={lobby.joinLobby}
                    disabled={lobby.joining || lobby.joinCode.length < 6 || !lobby.selectedDeckId}
                    className="w-full"
                  >
                    {lobby.joining ? "Joining..." : "Join"}
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
        {lobby.activeGameId && (
          <div className="rounded-lg border border-gold-500/30 bg-gold-100 p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
              Game In Progress
            </p>
            <p className="mt-2 text-sm text-text-primary">
              You have an ongoing game that needs to be resolved before you can
              start a new one.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button onClick={() => router.push(`/game/${lobby.activeGameId}`)}>
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
                    <AlertDialogCancel disabled={lobby.conceding}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={lobby.concedeGame}
                      disabled={lobby.conceding}
                    >
                      {lobby.conceding ? "Conceding..." : "Yes, Concede"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {lobby.concedeError && (
              <p className="mt-3 text-sm text-error">{lobby.concedeError}</p>
            )}
          </div>
        )}

        {/* No decks state */}
        {!lobby.activeGameId && !lobby.hasDecks && (
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
        {!lobby.activeGameId && lobby.hasDecks && (
          <div className="flex flex-col gap-6">
            {/* Players row */}
            <div className="flex justify-center gap-6">
              {/* Player */}
              <div className="flex min-h-[420px] min-w-60 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-surface-1 p-6">
                {lobby.selectedDeck?.leaderImageUrl ? (
                  <button
                    onClick={() => lobby.setPreviewDeckId(lobby.selectedDeckId)}
                    className="cursor-pointer transition-transform hover:scale-105"
                  >
                    <img
                      src={lobby.selectedDeck.leaderImageUrl}
                      alt={lobby.selectedDeck.leaderName ?? "Leader"}
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
                    {lobby.selectedDeck?.name ?? "No deck selected"}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {user.name}
                  </p>
                </div>
                {lobby.userDecks.length > 1 && (
                  <Select
                    value={lobby.selectedDeckId}
                    onValueChange={lobby.handleDeckChange}
                  >
                    <SelectTrigger className="w-full max-w-48">
                      <SelectValue placeholder="Select a deck" />
                    </SelectTrigger>
                    <SelectContent>
                      {lobby.userDecks.map((d) => (
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
                {lobby.activeLobby?.guest ? (
                  <>
                    {lobby.activeLobby.guest.deck?.leaderImageUrl ? (
                      <button
                        onClick={() => {
                          if (lobby.activeLobby?.guest?.deck?.id)
                            lobby.setPreviewDeckId(lobby.activeLobby.guest.deck.id);
                        }}
                        className="cursor-pointer transition-transform hover:scale-105"
                      >
                        <img
                          src={lobby.activeLobby.guest.deck.leaderImageUrl}
                          alt={lobby.activeLobby.guest.deck.leaderName ?? "Leader"}
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
                        {lobby.activeLobby.guest.deck?.name ?? "Deck"}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {lobby.activeLobby.guest.user.username ??
                          lobby.activeLobby.guest.user.name ??
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
                    onClick={() => lobby.setJoinOpen(true)}
                    aria-label="Invite opponent"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                )}
              </div>
            </div>

            {/* Lobby info */}
            {lobby.isWaiting && lobby.activeLobby && (
              <div className="flex flex-col items-center gap-3">
                <code className="rounded-md bg-surface-1 border border-border px-4 py-2 font-mono text-lg font-bold tracking-[0.3em] text-text-primary">
                  {lobby.activeLobby.joinCode}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={lobby.copyCode}
                >
                  {lobby.copied ? (
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

            {lobby.creating && !lobby.isWaiting && (
              <div className="flex items-center justify-center gap-2 text-sm text-text-secondary">
                <div className="h-2 w-2 animate-pulse rounded-full bg-text-tertiary" />
                Creating lobby...
              </div>
            )}
          </div>
        )}
      </div>

      <DeckPreviewModal
        deckId={lobby.previewDeckId}
        open={lobby.previewDeckId !== null}
        onOpenChange={(open) => {
          if (!open) lobby.setPreviewDeckId(null);
        }}
      />
    </div>
  );
}
