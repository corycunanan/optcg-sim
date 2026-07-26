"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { ApiError, apiDelete } from "@/lib/api-client";
import { LobbyActionResponseSchema } from "@/lib/validators/lobbies";
import type { LobbyRoomState } from "@/lib/lobbies/state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/social/user-avatar";

type Spectator = LobbyRoomState["spectators"][number];

interface SpectatorsModalProps {
  lobbyId: string;
  open: boolean;
  spectatorCount: number;
  spectators: Spectator[];
  viewerRole: LobbyRoomState["viewerRole"];
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<LobbyRoomState | null>;
}

export function SpectatorsModal({
  lobbyId,
  open,
  spectatorCount,
  spectators,
  viewerRole,
  returnFocusRef,
  onOpenChange,
  onRefresh,
}: SpectatorsModalProps) {
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusedRemoveIdRef = useRef<string | null>(null);
  const removingIdsRef = useRef(new Set<string>());
  const isHost = viewerRole === "host";

  useEffect(() => {
    const focusedRemoveId = focusedRemoveIdRef.current;
    if (
      focusedRemoveId &&
      !spectators.some((spectator) => spectator.id === focusedRemoveId)
    ) {
      titleRef.current?.focus();
      focusedRemoveIdRef.current = null;
    }
  }, [spectators]);

  const removeSpectator = async (spectator: Spectator) => {
    if (removingIdsRef.current.has(spectator.id)) return;

    removingIdsRef.current.add(spectator.id);
    setRemovingIds((current) => new Set(current).add(spectator.id));
    try {
      await apiDelete(
        `/api/lobbies/${lobbyId}/spectators/${encodeURIComponent(spectator.id)}`,
        LobbyActionResponseSchema
      );
      await onRefresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not remove spectator"
      );
    } finally {
      removingIdsRef.current.delete(spectator.id);
      setRemovingIds((current) => {
        const next = new Set(current);
        next.delete(spectator.id);
        return next;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusedRemoveIdRef.current = null;
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1}>
            Spectators ({spectatorCount})
          </DialogTitle>
          <DialogDescription>
            People currently watching this party.
          </DialogDescription>
        </DialogHeader>

        {spectators.length === 0 ? (
          <p className="text-content-secondary py-8 text-center text-sm">
            No spectators watching yet
          </p>
        ) : (
          <ul className="divide-border divide-y" aria-label="Spectators">
            {spectators.map((spectator) => {
              const name = spectatorDisplayName(spectator);
              const removing = removingIds.has(spectator.id);

              return (
                <li
                  key={spectator.id}
                  className="flex min-h-16 items-center gap-3 py-3"
                >
                  <UserAvatar user={spectator} size="md" />
                  <span className="text-content-primary min-w-0 flex-1 truncate text-sm font-semibold">
                    {name}
                  </span>
                  {isHost && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      aria-label={`Remove ${name}`}
                      disabled={removing}
                      onFocus={() => {
                        focusedRemoveIdRef.current = spectator.id;
                      }}
                      onBlur={() => {
                        focusedRemoveIdRef.current = null;
                      }}
                      onClick={() => void removeSpectator(spectator)}
                    >
                      {removing ? "Removing..." : "Remove"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function spectatorDisplayName(spectator: Spectator) {
  return spectator.username ?? spectator.name ?? "Spectator";
}
