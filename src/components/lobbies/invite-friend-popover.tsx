"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserAvatar } from "@/components/social/user-avatar";
import { FriendsResponseSchema } from "@/lib/validators/friends";

interface FriendUser {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

interface FriendEntry {
  friendshipId: string;
  user: FriendUser;
}

interface Props {
  lobbyId: string;
}

export function InviteFriendPopover({ lobbyId }: Props) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  // Tracks userIds we've successfully invited *during this popover open* so
  // the row swaps to "Invited" without an extra fetch.
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    apiGet("/api/friends", FriendsResponseSchema)
      .then((res) => {
        if (cancelled) return;
        setFriends(res.data ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Could not load friends");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => {
      const handle = (f.user.username ?? "").toLowerCase();
      const name = (f.user.name ?? "").toLowerCase();
      return handle.includes(q) || name.includes(q);
    });
  }, [friends, query]);

  const onInvite = async (user: FriendUser) => {
    setPending(user.id);
    try {
      await apiPost(`/api/lobbies/${lobbyId}/invite`, { toUserId: user.id });
      setInvited((prev) => new Set(prev).add(user.id));
      toast.success(`Invited ${displayName(user)}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Invite failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="default">
          <UserPlus data-icon="inline-start" />
          Invite a friend
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex flex-col gap-2">
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search friends..."
            className="h-8"
            autoFocus
          />
          <div className="max-h-64 overflow-y-auto">
            {loading && (
              <p className="text-text-tertiary px-2 py-3 text-xs">
                Loading friends...
              </p>
            )}
            {!loading && friends.length === 0 && (
              <p className="text-text-tertiary px-2 py-3 text-xs">
                Add friends from the sidebar to invite them.
              </p>
            )}
            {!loading && friends.length > 0 && filtered.length === 0 && (
              <p className="text-text-tertiary px-2 py-3 text-xs">
                No friends match.
              </p>
            )}
            {filtered.map(({ friendshipId, user }) => {
              const alreadyInvited = invited.has(user.id);
              const isPending = pending === user.id;
              return (
                <div
                  key={friendshipId}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm"
                >
                  <UserAvatar user={user} size="sm" />
                  <span className="flex-1 truncate">{displayName(user)}</span>
                  {alreadyInvited ? (
                    <span className="text-text-tertiary text-xs">Invited</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void onInvite(user)}
                      disabled={isPending}
                    >
                      {isPending ? "Inviting..." : "Invite"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function displayName(user: FriendUser): string {
  return user.username ?? user.name ?? "Friend";
}
