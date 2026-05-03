"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { UserPlus, Check, X, MoreHorizontal, ChevronsUpDown, LogOut, Search } from "lucide-react";
import { UserAvatar } from "./user-avatar";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import {
  applyFriendEvent,
  type FriendEntry,
  type FriendRequestEntry,
  type SidebarUser,
} from "./apply-friend-event";
import { TooltipProvider } from "@/components/ui/tooltip";

// Reconciliation backstop interval — replaces the 30s poll until OPT-361
// drops it after a soak window.
const RECONCILE_INTERVAL_MS = 60_000;

function removeFromSet<T>(set: Set<T>, value: T): Set<T> {
  if (!set.has(value)) return set;
  const next = new Set(set);
  next.delete(value);
  return next;
}

export type { SidebarUser };

// ─── Props ────────────────────────────────────────────────────────────────────

interface SocialSidebarProps {
  onOpenChat: (user: SidebarUser) => void;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function SocialSidebar({ onOpenChat }: SocialSidebarProps) {
  const { data: session } = useSession();
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestEntry[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SidebarUser[]>([]);
  const [pendingSent, setPendingSent] = useState<Set<string>>(new Set());
  const { subscribe, presence, trackPresence } = useUserChannelEvents();

  const fetchFriendsData = useCallback(async () => {
    const [friendsJson, requestsJson] = await Promise.all([
      apiGet<{ data: FriendEntry[] }>("/api/friends").catch(() => null),
      apiGet<{ data: { incoming: FriendRequestEntry[] } }>("/api/friends/requests").catch(() => null),
    ]);
    if (friendsJson) setFriends(friendsJson.data || []);
    if (requestsJson) setIncoming(requestsJson.data?.incoming || []);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchFriendsData();
    });
    const t = setInterval(fetchFriendsData, RECONCILE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [fetchFriendsData]);

  useEffect(() => {
    const unsubReceived = subscribe("friend:request_received", (event) => {
      setIncoming((prev) =>
        applyFriendEvent({ friends: [], incoming: prev }, event).incoming,
      );
    });
    const unsubAccepted = subscribe("friend:request_accepted", (event) => {
      setFriends((prev) =>
        applyFriendEvent({ friends: prev, incoming: [] }, event).friends,
      );
      // The user we sent a request to is now a friend — drop the "Sent" badge.
      // `isFriend` already takes precedence in the search dropdown, but
      // keeping `pendingSent` in sync avoids a stale entry leaking out later.
      setPendingSent((prev) => removeFromSet(prev, event.friendship.user.id));
    });
    const unsubDeclined = subscribe("friend:request_declined", (event) => {
      // Without this, the sender keeps seeing "Sent" until a full reload —
      // the 60s reconcile fetches `friends`/`incoming` but never `pendingSent`.
      setPendingSent((prev) => removeFromSet(prev, event.toUserId));
    });
    const unsubRemoved = subscribe("friend:removed", (event) => {
      setFriends((prev) =>
        applyFriendEvent({ friends: prev, incoming: [] }, event).friends,
      );
    });
    return () => {
      unsubReceived();
      unsubAccepted();
      unsubDeclined();
      unsubRemoved();
    };
  }, [subscribe]);

  const search = useCallback(async (q: string) => {
    setSearchQ(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const json = await apiGet<{ data: SidebarUser[] }>(`/api/users/search?q=${encodeURIComponent(q)}`);
    setSearchResults(json.data || []);
  }, []);

  const removeFriend = useCallback(async (userId: string) => {
    await apiDelete(`/api/friends/${userId}`);
    setFriends((prev) => prev.filter((f) => f.user.id !== userId));
  }, []);

  const sendRequest = useCallback(async (toUserId: string) => {
    setPendingSent((p) => new Set(p).add(toUserId));
    await apiPost("/api/friends/requests", { toUserId });
  }, []);

  const handleFriendRequest = useCallback(
    async (id: string, action: "accept" | "decline") => {
      await apiPut(`/api/friends/requests/${id}`, { action });
      setIncoming((prev) => prev.filter((r) => r.id !== id));
      if (action === "accept") fetchFriendsData();
    },
    [fetchFriendsData],
  );

  const friendIds = new Set(friends.map((f) => f.user.id));
  const user = session?.user;
  const userName = user?.username || user?.name || "User";

  // Seed presence for each newly-added friend. The provider ref-counts so
  // re-render cycles with the same friends array don't refetch.
  useEffect(() => {
    trackPresence(friends.map((f) => f.user.id));
  }, [friends, trackPresence]);

  const onlineCount = friends.reduce(
    (acc, f) => acc + (presence[f.user.id]?.online ? 1 : 0),
    0,
  );

  return (
    <TooltipProvider>
    <Sidebar side="right" collapsible="none">
      {/* Header — User avatar + account menu */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <UserAvatar
                    user={{ username: user?.username ?? null, name: user?.name ?? null, image: user?.image ?? null }}
                    size="sm"
                  />
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="truncate font-semibold">{userName}</span>
                    {user?.email && (
                      <span className="truncate text-xs opacity-60">{user.email}</span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="end"
                className="w-[--radix-dropdown-menu-trigger-width]"
              >
                <DropdownMenuItem disabled className="flex items-center gap-2 opacity-100">
                  <UserAvatar
                    user={{ username: user?.username ?? null, name: user?.name ?? null, image: user?.image ?? null }}
                    size="sm"
                  />
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="truncate font-semibold">{userName}</span>
                    {user?.email && (
                      <span className="truncate text-xs opacity-60">{user.email}</span>
                    )}
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
                  <LogOut className="size-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Incoming requests */}
        {incoming.length > 0 && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Requests ({incoming.length})</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {incoming.map((req) => (
                    <SidebarMenuItem key={req.id}>
                      <SidebarMenuButton size="lg" className="cursor-default">
                        <UserAvatar user={req.fromUser!} size="sm" variant="dark" />
                        <span className="truncate">
                          {req.fromUser?.username || req.fromUser?.name}
                        </span>
                      </SidebarMenuButton>
                      <div className="absolute right-1 top-1.5 flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleFriendRequest(req.id, "accept")}
                          title="Accept"
                          className="size-6 text-gold-500 hover:text-gold-400"
                        >
                          <Check className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleFriendRequest(req.id, "decline")}
                          title="Decline"
                          className="size-6 opacity-50 hover:opacity-100"
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
          </>
        )}

        {/* Friends list */}
        <SidebarGroup>
          <SidebarGroupLabel>
            {friends.length > 0 ? `Online (${onlineCount})` : "Friends"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {friends.length === 0 ? (
              <p className="px-2 text-xs opacity-50">
                No friends yet. Search below to add players.
              </p>
            ) : (
              <SidebarMenu className="gap-1">
                {friends.map(({ friendshipId, user: friendUser }) => {
                  const friendPresence = presence[friendUser.id];
                  return (
                  <SidebarMenuItem key={friendshipId}>
                    <SidebarMenuButton size="lg" onClick={() => onOpenChat(friendUser)}>
                      <UserAvatar
                        user={friendUser}
                        size="sm"
                        variant="dark"
                        showOnline={friendPresence?.online ?? false}
                        lastSeen={friendPresence?.lastSeen ?? null}
                      />
                      <span className="truncate">
                        {friendUser.username || friendUser.name}
                      </span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction showOnHover>
                          <MoreHorizontal className="size-4" />
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="left" align="start">
                        <DropdownMenuItem
                          onClick={() => removeFriend(friendUser.id)}
                          className="text-error focus:text-error"
                        >
                          Unfriend
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — Add Friend */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu open={addOpen} onOpenChange={(open) => {
              setAddOpen(open);
              if (!open) { setSearchQ(""); setSearchResults([]); }
            }}>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                    <Search className="size-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">Add Friend</span>
                    <span className="text-xs opacity-60">Search by username</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-[--radix-dropdown-menu-trigger-width] p-2"
              >
                <Input
                  type="text"
                  value={searchQ}
                  onChange={(e) => search(e.target.value)}
                  placeholder="Search by username..."
                  className="h-8 text-xs"
                  autoFocus
                />
                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {searchResults.map((u) => {
                      const isFriend = friendIds.has(u.id);
                      const alreadySent = pendingSent.has(u.id);
                      return (
                        <div key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                          <UserAvatar user={u} size="sm" />
                          <span className="flex-1 truncate">{u.username || u.name}</span>
                          {isFriend ? (
                            <span className="text-xs opacity-50">Friends</span>
                          ) : alreadySent ? (
                            <span className="text-xs opacity-50">Sent</span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => sendRequest(u.id)}
                              className="size-6"
                            >
                              <UserPlus className="size-3 text-gold-500" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {searchQ.length >= 2 && searchResults.length === 0 && (
                  <p className="mt-2 text-center text-xs opacity-50">No users found</p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
    </TooltipProvider>
  );
}
