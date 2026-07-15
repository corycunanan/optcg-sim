"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/social/user-avatar";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import { PendingLobbyInvitesResponseSchema } from "@/lib/validators/realtime";
import {
  EMPTY_INVITES,
  addInvite,
  expireInvites,
  removeInvite,
  seedInvites,
  type InviteToastEntry,
} from "./lobby-invite-toast-state";

const TICK_MS = 1000;
const TOAST_DURATION_MS = 5 * 60 * 1000;

export function LobbyInviteToasts() {
  const router = useRouter();
  const { subscribe } = useUserChannelEvents();
  const [invites, setInvites] = useState<InviteToastEntry[]>(EMPTY_INVITES);
  const [now, setNow] = useState<number>(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reconciliation: surface anything PENDING that arrived while the recipient
  // was offline / a tab wasn't open.
  useEffect(() => {
    let cancelled = false;
    apiGet("/api/lobby-invites/pending", PendingLobbyInvitesResponseSchema)
      .then((res) => {
        if (cancelled) return;
        setInvites((prev) => seedInvites(prev, res.data ?? []));
      })
      .catch(() => {
        // Best-effort — pushed events still surface live invites.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubReceived = subscribe("lobby:invite_received", (event) => {
      setInvites((prev) => addInvite(prev, event.invite));
    });
    const unsubDeclined = subscribe("lobby:invite_declined", (event) => {
      setInvites((prev) => removeInvite(prev, event.inviteId));
    });
    const unsubCanceled = subscribe("lobby:invite_canceled", (event) => {
      setInvites((prev) => removeInvite(prev, event.inviteId));
    });
    return () => {
      unsubReceived();
      unsubDeclined();
      unsubCanceled();
    };
  }, [subscribe]);

  // 1Hz tick drives both the countdown bar and the auto-expiry sweep.
  useEffect(() => {
    if (invites.length === 0) return;
    const interval = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setInvites((prev) => expireInvites(prev, t));
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [invites.length]);

  const onJoin = useCallback(
    async (invite: InviteToastEntry) => {
      setBusyId(invite.id);
      try {
        await apiPost(`/api/lobby-invites/${invite.id}/accept`);
        setInvites((prev) => removeInvite(prev, invite.id));
        router.push(`/lobbies/${invite.lobbyId}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 410) {
          // Already canceled / expired — drop it silently. No error toast:
          // the user clicked a stale row, not a broken one.
          setInvites((prev) => removeInvite(prev, invite.id));
          return;
        }
        toast.error(
          err instanceof ApiError ? err.message : "Could not join lobby"
        );
      } finally {
        setBusyId(null);
      }
    },
    [router]
  );

  const onDecline = useCallback(async (invite: InviteToastEntry) => {
    setBusyId(invite.id);
    try {
      await apiPost(`/api/lobby-invites/${invite.id}/decline`);
      // Only remove on success. The server fanout's `lobby:invite_declined`
      // echo will re-confirm via the subscribe handler; that path is
      // idempotent (`removeInvite` on a missing id returns the same ref).
      setInvites((prev) => removeInvite(prev, invite.id));
    } catch (err) {
      // 404 / 410 = already canceled / no longer active. Drop the row
      // silently — the user clicked a stale toast, not a broken one.
      if (
        err instanceof ApiError &&
        (err.status === 404 || err.status === 410)
      ) {
        setInvites((prev) => removeInvite(prev, invite.id));
        return;
      }
      // Transient failure — keep the toast in place so the user can retry.
      toast.error(
        err instanceof ApiError ? err.message : "Could not decline invite"
      );
    } finally {
      setBusyId(null);
    }
  }, []);

  const onDismiss = useCallback((inviteId: string) => {
    // Esc / X — local hide only. Reconciliation will re-surface on next mount.
    setInvites((prev) => removeInvite(prev, inviteId));
  }, []);

  if (invites.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      {invites.map((invite) => (
        <InviteCard
          key={invite.id}
          invite={invite}
          now={now}
          busy={busyId === invite.id}
          onJoin={() => void onJoin(invite)}
          onDecline={() => void onDecline(invite)}
          onDismiss={() => onDismiss(invite.id)}
        />
      ))}
    </div>
  );
}

function InviteCard({
  invite,
  now,
  busy,
  onJoin,
  onDecline,
  onDismiss,
}: {
  invite: InviteToastEntry;
  now: number;
  busy: boolean;
  onJoin: () => void;
  onDecline: () => void;
  onDismiss: () => void;
}) {
  const remaining = Math.max(0, invite.expiresAtMs - now);
  const remainingSec = Math.ceil(remaining / 1000);
  const progress = Math.max(0, Math.min(1, remaining / TOAST_DURATION_MS));
  const inviterName =
    invite.fromUser.username ?? invite.fromUser.name ?? "A friend";

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onDismiss();
    }
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby={`invite-${invite.id}-title`}
      className="border-border bg-surface-1 pointer-events-auto rounded-lg border p-4 shadow-[var(--shadow-md)]"
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div className="flex items-start gap-3">
        <UserAvatar user={invite.fromUser} size="sm" />
        <div className="min-w-0 flex-1">
          <p
            id={`invite-${invite.id}-title`}
            className="text-text-primary truncate text-sm font-semibold"
          >
            {inviterName} invited you to a lobby
          </p>
          <p className="text-text-secondary text-xs">
            {invite.lobby.format} · {prettyMode(invite.lobby.mode)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          variant="gold"
          onClick={onJoin}
          disabled={busy}
          className="flex-1"
        >
          {busy ? "Joining..." : "Join"}
        </Button>
        <Button
          variant="secondary"
          onClick={onDecline}
          disabled={busy}
          className="flex-1"
        >
          Decline
        </Button>
      </div>
      <div
        className="bg-surface-2 mt-3 h-1 overflow-hidden rounded-full"
        aria-label={`Expires in ${remainingSec} seconds`}
      >
        <div
          className="bg-gold-500 h-full transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

function prettyMode(mode: "PVP" | "SOLITAIRE" | "PVCOMPUTER"): string {
  if (mode === "SOLITAIRE") return "Solitaire";
  if (mode === "PVCOMPUTER") return "Vs Computer";
  return "PVP";
}
