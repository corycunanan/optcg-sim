"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
} from "@/components/ui/sidebar";
import {
  UserPlus,
  Check,
  X,
  MoreHorizontal,
  ChevronsUpDown,
  LogOut,
  Search,
  MessageCircle,
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
  const fetchEpoch = useRef(0);
  const pendingMutations = useRef(new Set<string>());
  const { subscribe, connectionStatus, presence, trackPresence } =
    useUserChannelEvents();

  const fetchFriendsData = useCallback(async () => {
    const epoch = fetchEpoch.current;
    setFriendsLoadState("loading");
    setRequestsLoadState("loading");

    const [friendsResult, requestsResult] = await Promise.allSettled([
      apiGet("/api/friends", FriendsResponseSchema),
      apiGet("/api/friends/requests", FriendRequestsResponseSchema),
    ]);

    if (epoch !== fetchEpoch.current) return;

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

  const removeFriend = useCallback(
    async (userId: string) => {
      const mutationKey = `remove:${userId}`;
      if (pendingMutations.current.has(mutationKey)) return;

      pendingMutations.current.add(mutationKey);
      setRemovingFriendId(userId);
      try {
        await apiDelete(`/api/friends/${userId}`);
        fetchEpoch.current += 1;
        setFriends((prev) => prev.filter((f) => f.user.id !== userId));
        setFriendToRemove(null);
        void fetchFriendsData();
      } catch {
        toast.error("Could not remove this friend. Please try again.");
      } finally {
        pendingMutations.current.delete(mutationKey);
        setRemovingFriendId(null);
      }
    },
    [fetchFriendsData]
  );

  const sendRequest = useCallback(
    async (toUserId: string) => {
      const mutationKey = `send:${toUserId}`;
      if (pendingMutations.current.has(mutationKey)) return;

      pendingMutations.current.add(mutationKey);
      setSendingRequests((prev) => new Set(prev).add(toUserId));
      setPendingSent((prev) => new Set(prev).add(toUserId));
      try {
        await apiPost("/api/friends/requests", { toUserId });
        fetchEpoch.current += 1;
        void fetchFriendsData();
      } catch {
        setPendingSent((prev) => removeFromSet(prev, toUserId));
        toast.error("Could not send friend request. Please try again.");
      } finally {
        pendingMutations.current.delete(mutationKey);
        setSendingRequests((prev) => removeFromSet(prev, toUserId));
      }
    },
    [fetchFriendsData]
  );

  const handleFriendRequest = useCallback(
    async (id: string, action: "accept" | "decline") => {
      const mutationKey = `resolve:${id}`;
      if (pendingMutations.current.has(mutationKey)) return;

      pendingMutations.current.add(mutationKey);
      setResolvingRequests((prev) => new Set(prev).add(id));
      try {
        await apiPut(`/api/friends/requests/${id}`, { action });
        fetchEpoch.current += 1;
        setIncoming((prev) => prev.filter((r) => r.id !== id));
        void fetchFriendsData();
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
  const onlineFriends = friends.filter(
    ({ user: friendUser }) => presence[friendUser.id]?.online
  );
  const offlineFriends = friends.filter(
    ({ user: friendUser }) => !presence[friendUser.id]?.online
  );

  const renderFriend = (
    { friendshipId, user: friendUser }: FriendEntry,
    isOnline: boolean
  ) => {
    const friendPresence = presence[friendUser.id];
    const friendName = friendUser.username || friendUser.name || "Player";

    return (
      <SidebarMenuItem
        key={friendshipId}
        className={cn(
          "transition-opacity",
          !isOnline && "opacity-60 focus-within:opacity-100 hover:opacity-100"
        )}
      >
        <SidebarMenuButton
          size="lg"
          onClick={() => onOpenChat(friendUser)}
          className="pr-16"
          aria-label={`Chat with ${friendName}`}
        >
          <UserAvatar
            user={friendUser}
            size="sm"
            variant="dark"
            showOnline={isOnline}
            lastSeen={friendPresence?.lastSeen ?? null}
          />
          <span className="truncate font-medium">{friendName}</span>
        </SidebarMenuButton>
        <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              onOpenChat(friendUser);
            }}
            className="text-content-secondary hover:text-content-primary size-8"
            aria-label={`Open chat with ${friendName}`}
          >
            <MessageCircle className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(event) => event.stopPropagation()}
                className="text-content-secondary hover:text-content-primary size-8"
                aria-label={`More actions for ${friendName}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
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
        </div>
      </SidebarMenuItem>
    );
  };

  return (
    <TooltipProvider>
      <Sidebar
        side="right"
        collapsible="none"
        className="social-rail bg-surface-nav w-[280px] shrink-0 border-l"
      >
        <SidebarHeader className="border-border border-b px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-content-primary text-xl">
              Friends
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                disabled
                className="text-content-disabled size-8"
                aria-label="Search friends"
                title="Search friends"
              >
                <Search className="size-4" />
              </Button>
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-content-secondary hover:text-content-primary size-8"
                    aria-label="Add friend"
                    title="Add friend"
                  >
                    <UserPlus className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="bottom"
                  align="end"
                  className="w-72 p-2"
                >
                  <Input
                    type="text"
                    value={searchQ}
                    onChange={(event) => search(event.target.value)}
                    placeholder="Search 3+ username characters..."
                    className="h-8 text-xs"
                    autoFocus
                  />
                  {searchResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {searchResults.map((searchUser) => {
                        const isFriend = friendIds.has(searchUser.id);
                        const alreadySent = pendingSent.has(searchUser.id);
                        const isSending = sendingRequests.has(searchUser.id);
                        return (
                          <div
                            key={searchUser.id}
                            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm"
                          >
                            <UserAvatar user={searchUser} size="sm" />
                            <span className="flex-1 truncate">
                              {searchUser.username || searchUser.name}
                            </span>
                            {isFriend ? (
                              <span className="text-content-tertiary text-xs">
                                Friends
                              </span>
                            ) : isSending ? (
                              <span className="text-content-tertiary text-xs">
                                Sending…
                              </span>
                            ) : alreadySent ? (
                              <span className="text-content-tertiary text-xs">
                                Sent
                              </span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => sendRequest(searchUser.id)}
                                disabled={isSending}
                                aria-label={`Send friend request to ${searchUser.username || searchUser.name || "user"}`}
                                className="size-8"
                              >
                                <UserPlus className="text-accent size-4" />
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {normalizedSearchQ.length > 0 &&
                    normalizedSearchQ.length < MIN_SUBSTRING_SEARCH_LENGTH && (
                      <p className="text-content-tertiary mt-2 text-center text-xs">
                        Enter at least 3 characters
                      </p>
                    )}
                  {normalizedSearchQ.length >= MIN_SUBSTRING_SEARCH_LENGTH &&
                    searchState === "loading" && (
                      <p className="text-content-tertiary mt-2 text-center text-xs">
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
                      <p className="text-content-tertiary mt-2 text-center text-xs">
                        No users found
                      </p>
                    )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
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

          <SidebarGroup className="py-3">
            <SidebarGroupLabel className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
              Requests {incoming.length > 0 && `(${incoming.length})`}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {requestsLoadState === "loading" && incoming.length === 0 ? (
                <p className="text-content-tertiary px-2 text-xs">
                  Loading requests…
                </p>
              ) : requestsLoadState === "error" &&
                incoming.length === 0 ? null : incoming.length === 0 ? (
                <p className="text-content-tertiary px-2 text-xs">
                  No pending friend requests.
                </p>
              ) : (
                <SidebarMenu className="gap-1">
                  {incoming.map((request) => (
                    <SidebarMenuItem key={request.id}>
                      <SidebarMenuButton
                        size="lg"
                        className="cursor-default pr-16"
                      >
                        <UserAvatar
                          user={request.fromUser!}
                          size="sm"
                          variant="dark"
                        />
                        <span className="truncate font-medium">
                          {request.fromUser?.username ||
                            request.fromUser?.name ||
                            "Player"}
                        </span>
                      </SidebarMenuButton>
                      <div className="absolute top-2 right-2 flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            handleFriendRequest(request.id, "accept")
                          }
                          title="Accept friend request"
                          aria-label="Accept friend request"
                          disabled={resolvingRequests.has(request.id)}
                          className="text-accent hover:text-accent size-8"
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            handleFriendRequest(request.id, "decline")
                          }
                          title="Decline friend request"
                          aria-label="Decline friend request"
                          disabled={resolvingRequests.has(request.id)}
                          className="text-content-secondary hover:text-content-primary size-8"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="py-3">
            <SidebarGroupLabel className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
              Online ({onlineCount})
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {friendsLoadState === "loading" && friends.length === 0 ? (
                <p className="text-content-tertiary px-2 text-xs">
                  Loading friends…
                </p>
              ) : friendsLoadState === "error" &&
                friends.length === 0 ? null : onlineFriends.length === 0 ? (
                <p className="text-content-tertiary px-2 text-xs">
                  No friends online.
                </p>
              ) : (
                <SidebarMenu className="gap-1">
                  {onlineFriends.map((friend) => renderFriend(friend, true))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="py-3">
            <SidebarGroupLabel className="text-content-tertiary text-xs font-semibold tracking-widest uppercase">
              Offline ({offlineFriends.length})
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {friendsLoadState !== "loading" &&
              friendsLoadState !== "error" &&
              friends.length === 0 ? (
                <p className="text-content-tertiary px-2 text-xs">
                  Add friends to start a conversation.
                </p>
              ) : offlineFriends.length === 0 ? (
                <p className="text-content-tertiary px-2 text-xs">
                  Everyone is online.
                </p>
              ) : (
                <SidebarMenu className="gap-1">
                  {offlineFriends.map((friend) => renderFriend(friend, false))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-border border-t px-3 py-3">
          <UserChannelConnectionStatus connectionStatus={connectionStatus} />
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
                      variant="dark"
                    />
                    <span className="truncate font-semibold">{userName}</span>
                    <ChevronsUpDown className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
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
                    <div className="flex min-w-0 flex-col gap-1 leading-none">
                      <span className="truncate font-semibold">{userName}</span>
                      {user?.email && (
                        <span className="text-content-tertiary truncate text-xs">
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
