"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Gamepad2, Loader2, Plus } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { useLobbiesOperations } from "@/hooks/use-lobbies-operations";
import { Button } from "@/components/ui/button";
import { ActiveGameResponseSchema } from "@/lib/validators/game";
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
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

interface LobbiesShellProps {
  user: {
    name: string;
    image: string | null;
  };
}

export function LobbiesShell({ user }: LobbiesShellProps) {
  const router = useRouter();
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGameLoading, setActiveGameLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const {
    creating,
    createError,
    createLobby,
    joining,
    joinError,
    joinLobby,
    conceding,
    concedeError,
    concedeGame,
  } = useLobbiesOperations({
    onCreated: (lobbyId) => router.push(`/lobbies/${lobbyId}`),
    onJoined: (lobbyId) => router.push(`/lobbies/${lobbyId}`),
    onConceded: () => setActiveGameId(null),
  });

  useEffect(() => {
    let cancelled = false;
    apiGet("/api/game/active", ActiveGameResponseSchema)
      .then((json) => {
        if (!cancelled) setActiveGameId(json.data?.id ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setActiveGameLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) setJoinCode(code.toUpperCase());
  }, []);

  const handleJoinLobby = async () => {
    if (joinCode.length < 4) return;
    await joinLobby(joinCode);
  };

  const handleConcedeGame = async () => {
    if (!activeGameId) return;
    await concedeGame(activeGameId);
  };

  if (activeGameLoading) {
    return (
      <div className="bg-surface-base flex-1 overflow-y-auto">
        <div className="text-text-secondary mx-auto flex max-w-xl items-center gap-2 px-6 py-10 text-sm">
          <span className="bg-text-tertiary h-2 w-2 animate-pulse rounded-full" />
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-base flex-1 overflow-y-auto">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Play</PageHeaderTitle>
          <PageHeaderDescription>
            Create a room, invite an opponent, or enter a code.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button
            onClick={createLobby}
            disabled={creating || Boolean(activeGameId)}
          >
            {creating ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Plus data-icon="inline-start" />
            )}
            Create Lobby
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-10 md:grid-cols-[1fr_0.8fr]">
        {activeGameId ? (
          <section className="border-gold-500/30 bg-gold-100 rounded-lg border p-6 md:col-span-2">
            <p className="text-text-secondary text-xs font-semibold tracking-widest uppercase">
              Game In Progress
            </p>
            <p className="text-text-primary mt-2 text-sm">
              You have an ongoing game that needs to be resolved before you can
              start a new lobby.
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
                      onClick={handleConcedeGame}
                      disabled={conceding}
                    >
                      {conceding ? "Conceding..." : "Yes, Concede"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {concedeError && (
              <p className="text-error mt-3 text-sm">{concedeError}</p>
            )}
          </section>
        ) : (
          <>
            <section className="border-border bg-surface-1 flex min-h-72 flex-col justify-between rounded-lg border p-6">
              <div>
                <Gamepad2 />
                <h2 className="font-display text-text-primary mt-5 text-3xl uppercase">
                  Room First
                </h2>
                <p className="text-text-secondary mt-3 max-w-xl text-sm leading-relaxed">
                  Hi {user.name}. Create a pre-game room first, then pick decks
                  and ready up with the full table present.
                </p>
              </div>
              <Button
                className="mt-8 w-fit"
                onClick={createLobby}
                disabled={creating}
              >
                {creating ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Plus data-icon="inline-start" />
                )}
                Create Lobby
              </Button>
              {createError && (
                <p className="text-error mt-3 text-sm">{createError}</p>
              )}
            </section>

            <section className="border-border bg-surface-1 rounded-lg border p-6">
              <p className="text-text-tertiary text-xs font-semibold tracking-widest uppercase">
                Join by Code
              </p>
              <div className="mt-5 flex flex-col gap-4">
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
                {joinError && <p className="text-error text-sm">{joinError}</p>}
                <Button
                  onClick={handleJoinLobby}
                  disabled={joining || joinCode.length < 4}
                >
                  {joining ? (
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : (
                    <ArrowRight data-icon="inline-start" />
                  )}
                  Enter Room
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
