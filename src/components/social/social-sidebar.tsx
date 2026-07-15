"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { toast } from "sonner";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  UserPlus,
  Check,
  X,
  MoreHorizontal,
  ChevronsUpDown,
  LogOut,
  Search,
} from "lucide-react";
import { UserAvatar } from "./user-avatar";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api-client";
import {
  MIN_SUBSTRING_SEARCH_LENGTH,
  normalizeSubstringSearchQuery,
} from "@/lib/search-query";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import { UserChannelConnectionStatus } from "@/components/realtime/user-channel-connection-status";
import {
  applyFriendEvent,
  type FriendEntry,
  type FriendRequestEntry,
  type SidebarUser,
} from "./apply-friend-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  FriendRequestsResponseSchema,
  FriendsResponseSchema,
  UserSearchResponseSchema,
} from "@/lib/validators/friends";
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

type LoadState = "loading" | "success" | "error";
type SearchState = "idle" | "loading" | "success" | "error";

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
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [pendingSent, setPendingSent] = useState<Set<string>>(new Set());
  const [sendingRequests, setSendingRequests] = useState<Set<string>>(
    new Set()
  );
  const [resolvingRequests, setResolvingRequests] = useState<Set<string>>(
    new Set()
  );
  const [friendToRemove, setFriendToRemove] = useState<SidebarUser | null>(
    null
  );
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);
  const [friendsLoadState, setFriendsLoadState] =
    useState<LoadState>("loading");
  const [requestsLoadState, setRequestsLoadState] =
    useState<LoadState>("loading");
  const searchRequestId = useRef(0);
  const pendingMutations = useRef(new Set<string>());
  const { subscribe, connectionStatus, presence, trackPresence } =
    useUserChannelEvents();

  const fetchFriendsData = useCallback(async () => {
    setFriendsLoadState("loading");
    setRequestsLoadState("loading");

    const [friendsResult, requestsResult] = await Promise.allSettled([
      apiGet("/api/friends", FriendsResponseSchema),
      apiGet("/api/friends/requests", FriendRequestsResponseSchema),
    ]);

    if (friendsResult.status === "fulfilled") {
      setFriends(friendsResult.value.data || []);
      setFriendsLoadState("success");
    } else {
      setFriendsLoadState("error");
    }

    if (requestsResult.status === "fulfilled") {
      setIncoming(requestsResult.value.data?.incoming || []);
      setRequestsLoadState("success");
    } else {
      setRequestsLoadState("error");
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchFriendsData();
    });
  }, [fetchFriendsData]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void fetchFriendsData();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchFriendsData]);

  useEffect(() => {
    const unsubReceived = subscribe("friend:request_received", (event) => {
      setIncoming(
        (prev) =>
          applyFriendEvent({ friends: [], incoming: prev }, event).incoming
      );
    });
    const unsubAccepted = subscribe("friend:request_accepted", (event) => {
      setFriends(
        (prev) =>
          applyFriendEvent({ friends: prev, incoming: [] }, event).friends
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
      setFriends(
        (prev) =>
          applyFriendEvent({ friends: prev, incoming: [] }, event).friends
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
    const query = normalizeSubstringSearchQuery(q);
    const requestId = ++searchRequestId.current;
    setSearchResults([]);

    if (query.length < MIN_SUBSTRING_SEARCH_LENGTH) {
      setSearchState("idle");
      return;
    }

    setSearchState("loading");
    try {
      const json = await apiGet(
        `/api/users/search?q=${encodeURIComponent(query)}`,
        UserSearchResponseSchema
      );
      if (requestId !== searchRequestId.current) return;
      setSearchResults(json.data || []);
      setSearchState("success");
    } catch {
      if (requestId !== searchRequestId.current) return;
      setSearchResults([]);
      setSearchState("error");
      toast.error("Search failed. Check your connection and try again.");
    }
  }, []);

  const removeFriend = useCallback(async (userId: string) => {
    const mutationKey = `remove:${userId}`;
    if (pendingMutations.current.has(mutationKey)) return;

    pendingMutations.current.add(mutationKey);
    setRemovingFriendId(userId);
    try {
      await apiDelete(`/api/friends/${userId}`);
      setFriends((prev) => prev.filter((f) => f.user.id !== userId));
      setFriendToRemove(null);
    } catch {
      toast.error("Could not remove this friend. Please try again.");
    } finally {
      pendingMutations.current.delete(mutationKey);
      setRemovingFriendId(null);
    }
  }, []);

  const sendRequest = useCallback(async (toUserId: string) => {
    const mutationKey = `send:${toUserId}`;
    if (pendingMutations.current.has(mutationKey)) return;

    pendingMutations.current.add(mutationKey);
    setSendingRequests((prev) => new Set(prev).add(toUserId));
    setPendingSent((prev) => new Set(prev).add(toUserId));
    try {
      await apiPost("/api/friends/requests", { toUserId });
    } catch {
      setPendingSent((prev) => removeFromSet(prev, toUserId));
      toast.error("Could not send friend request. Please try again.");
    } finally {
      pendingMutations.current.delete(mutationKey);
      setSendingRequests((prev) => removeFromSet(prev, toUserId));
    }
  }, []);

  const handleFriendRequest = useCallback(
    async (id: string, action: "accept" | "decline") => {
      const mutationKey = `resolve:${id}`;
      if (pendingMutations.current.has(mutationKey)) return;

      pendingMutations.current.add(mutationKey);
      setResolvingRequests((prev) => new Set(prev).add(id));
      try {
        await apiPut(`/api/friends/requests/${id}`, { action });
        setIncoming((prev) => prev.filter((r) => r.id !== id));
        if (action === "accept") void fetchFriendsData();
      } catch {
        toast.error(
          `Could not ${action} this friend request. Please try again.`
        );
      } finally {
        pendingMutations.current.delete(mutationKey);
        setResolvingRequests((prev) => removeFromSet(prev, id));
      }
    },
    [fetchFriendsData]
  );

  const friendIds = new Set(friends.map((f) => f.user.id));
  const user = session?.user;
  const userName = user?.username || user?.name || "User";
  const normalizedSearchQ = normalizeSubstringSearchQuery(searchQ);
  const loadFailed =
    friendsLoadState === "error" || requestsLoadState === "error";
  const loadPending =
    friendsLoadState === "loading" || requestsLoadState === "loading";

  // Seed presence for each newly-added friend. The provider ref-counts so
  // re-render cycles with the same friends array don't refetch.
  useEffect(() => {
    trackPresence(friends.map((f) => f.user.id));
  }, [friends, trackPresence]);

  const onlineCount = friends.reduce(
    (acc, f) => acc + (presence[f.user.id]?.online ? 1 : 0),
    0
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
                      user={{
                        username: user?.username ?? null,
                        name: user?.name ?? null,
                        image: user?.image ?? null,
                      }}
                      size="sm"
                    />
                    <div className="flex flex-col gap-0.5 leading-none">
                      <span className="truncate font-semibold">{userName}</span>
                      {user?.email && (
                        <span className="truncate text-xs opacity-60">
                          {user.email}
                        </span>
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
                  <DropdownMenuItem
                    disabled
                    className="flex items-center gap-2 opacity-100"
                  >
                    <UserAvatar
                      user={{
                        username: user?.username ?? null,
                        name: user?.name ?? null,
                        image: user?.image ?? null,
                      }}
                      size="sm"
                    />
                    <div className="flex flex-col gap-0.5 leading-none">
                      <span className="truncate font-semibold">{userName}</span>
                      {user?.email && (
                        <span className="truncate text-xs opacity-60">
                          {user.email}
                        </span>
                      )}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: "/" })}
                  >
                    <LogOut className="size-4" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {loadFailed && (
            <SidebarGroup>
              <SidebarGroupLabel>Friends unavailable</SidebarGroupLabel>
              <SidebarGroupContent className="space-y-2 px-2">
                <p className="text-xs opacity-60">
                  We couldn&apos;t load all friendship data. Check your
                  connection and try again.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchFriendsData()}
                  disabled={loadPending}
                >
                  {loadPending ? "Retrying…" : "Retry"}
                </Button>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Incoming requests */}
          {incoming.length > 0 && (
            <>
              <SidebarGroup>
                <SidebarGroupLabel>
                  Requests ({incoming.length})
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {incoming.map((req) => (
                      <SidebarMenuItem key={req.id}>
                        <SidebarMenuButton size="lg" className="cursor-default">
                          <UserAvatar
                            user={req.fromUser!}
                            size="sm"
                            variant="dark"
                          />
                          <span className="truncate">
                            {req.fromUser?.username || req.fromUser?.name}
                          </span>
                        </SidebarMenuButton>
                        <div className="absolute top-1.5 right-1 flex gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              handleFriendRequest(req.id, "accept")
                            }
                            title="Accept"
                            disabled={resolvingRequests.has(req.id)}
                            className="text-gold-500 hover:text-gold-400 size-6"
                          >
                            <Check className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              handleFriendRequest(req.id, "decline")
                            }
                            title="Decline"
                            disabled={resolvingRequests.has(req.id)}
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
              {friendsLoadState === "loading" && friends.length === 0 ? (
                <p className="px-2 text-xs opacity-50">Loading friends…</p>
              ) : friendsLoadState === "error" &&
                friends.length === 0 ? null : friends.length === 0 ? (
                <p className="px-2 text-xs opacity-50">
                  No friends yet. Search below to add players.
                </p>
              ) : (
                <SidebarMenu className="gap-1">
                  {friends.map(({ friendshipId, user: friendUser }) => {
                    const friendPresence = presence[friendUser.id];
                    return (
                      <SidebarMenuItem key={friendshipId}>
                        <SidebarMenuButton
                          size="lg"
                          onClick={() => onOpenChat(friendUser)}
                        >
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
                              onSelect={() => setFriendToRemove(friendUser)}
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
          <UserChannelConnectionStatus connectionStatus={connectionStatus} />
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu
                open={addOpen}
                onOpenChange={(open) => {
                  setAddOpen(open);
                  if (!open) {
                    searchRequestId.current += 1;
                    setSearchQ("");
                    setSearchResults([]);
                    setSearchState("idle");
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton size="lg">
                    <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-md">
                      <Search className="size-4" />
                    </div>
                    <div className="flex flex-col gap-0.5 leading-none">
                      <span className="font-semibold">Add Friend</span>
                      <span className="text-xs opacity-60">
                        Search by username
                      </span>
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
                    placeholder="Search 3+ username characters..."
                    className="h-8 text-xs"
                    autoFocus
                  />
                  {searchResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {searchResults.map((u) => {
                        const isFriend = friendIds.has(u.id);
                        const alreadySent = pendingSent.has(u.id);
                        const isSending = sendingRequests.has(u.id);
                        return (
                          <div
                            key={u.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                          >
                            <UserAvatar user={u} size="sm" />
                            <span className="flex-1 truncate">
                              {u.username || u.name}
                            </span>
                            {isFriend ? (
                              <span className="text-xs opacity-50">
                                Friends
                              </span>
                            ) : isSending ? (
                              <span className="text-xs opacity-50">
                                Sending…
                              </span>
                            ) : alreadySent ? (
                              <span className="text-xs opacity-50">Sent</span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => sendRequest(u.id)}
                                disabled={isSending}
                                aria-label={`Send friend request to ${u.username || u.name || "user"}`}
                                className="size-6"
                              >
                                <UserPlus className="text-gold-500 size-3" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {normalizedSearchQ.length > 0 &&
                    normalizedSearchQ.length < MIN_SUBSTRING_SEARCH_LENGTH && (
                      <p className="mt-2 text-center text-xs opacity-50">
                        Enter at least 3 characters
                      </p>
                    )}
                  {normalizedSearchQ.length >= MIN_SUBSTRING_SEARCH_LENGTH &&
                    searchState === "loading" && (
                      <p className="mt-2 text-center text-xs opacity-50">
                        Searching…
                      </p>
                    )}
                  {normalizedSearchQ.length >= MIN_SUBSTRING_SEARCH_LENGTH &&
                    searchState === "error" && (
                      <div className="mt-2 flex items-center justify-center gap-2">
                        <span className="text-error text-xs">
                          Search failed.
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void search(searchQ)}
                        >
                          Retry
                        </Button>
                      </div>
                    )}
                  {normalizedSearchQ.length >= MIN_SUBSTRING_SEARCH_LENGTH &&
                    searchState === "success" &&
                    searchResults.length === 0 && (
                      <p className="mt-2 text-center text-xs opacity-50">
                        No users found
                      </p>
                    )}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <AlertDialog
        open={Boolean(friendToRemove)}
        onOpenChange={(open) => {
          if (!open && !removingFriendId) setFriendToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unfriend this player?</AlertDialogTitle>
            <AlertDialogDescription>
              {friendToRemove?.username ||
                friendToRemove?.name ||
                "This player"}
              {" will be removed from your friends list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(removingFriendId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(removingFriendId)}
              onClick={(event) => {
                event.preventDefault();
                if (friendToRemove) void removeFriend(friendToRemove.id);
              }}
            >
              {removingFriendId ? "Removing…" : "Unfriend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
