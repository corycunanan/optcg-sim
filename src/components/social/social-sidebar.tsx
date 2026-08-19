"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  UserPlus,
  MoreHorizontal,
  Search,
  MessageCircle,
  X,
} from "lucide-react";
import {
  FRIENDS_DRAWER_ID,
  FRIENDS_DRAWER_TOGGLE_ID,
} from "./friends-drawer-toggle";
import { UserAvatar } from "./user-avatar";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import {
  MIN_SUBSTRING_SEARCH_LENGTH,
  normalizeSubstringSearchQuery,
} from "@/lib/search-query";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import { UserChannelConnectionStatus } from "@/components/realtime/user-channel-connection-status";
import {
  applyFriendEvent,
  type FriendEntry,
  type SidebarUser,
} from "./apply-friend-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
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
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SidebarUser[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [pendingSent, setPendingSent] = useState<Set<string>>(new Set());
  const [sendingRequests, setSendingRequests] = useState<Set<string>>(
    new Set()
  );
  const [friendToRemove, setFriendToRemove] = useState<SidebarUser | null>(
    null
  );
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);
  const [friendsLoadState, setFriendsLoadState] =
    useState<LoadState>("loading");
  const searchRequestId = useRef(0);
  const fetchEpoch = useRef(0);
  const pendingMutations = useRef(new Set<string>());
  const { subscribe, connectionStatus, presence, trackPresence } =
    useUserChannelEvents();
  // OPT-663: below `md` the rail has no column of its own, so the same content
  // renders inside a drawer the navbar opens. `SidebarProvider` (root layout)
  // is the shared owner of that open state.
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  const fetchFriendsData = useCallback(async () => {
    const epoch = fetchEpoch.current;
    setFriendsLoadState("loading");

    try {
      const response = await apiGet("/api/friends", FriendsResponseSchema);
      if (epoch !== fetchEpoch.current) return;
      setFriends(response.data || []);
      setFriendsLoadState("success");
    } catch {
      if (epoch !== fetchEpoch.current) return;
      setFriendsLoadState("error");
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
    const unsubAccepted = subscribe("friend:request_accepted", (event) => {
      setFriends((prev) => applyFriendEvent(prev, event));
      // The user we sent a request to is now a friend — drop "Request sent".
      // `isFriend` already takes precedence in the search dropdown, but
      // keeping `pendingSent` in sync avoids a stale entry leaking out later.
      setPendingSent((prev) => removeFromSet(prev, event.friendship.user.id));
    });
    const unsubDeclined = subscribe("friend:request_declined", (event) => {
      // Without this, the sender keeps seeing "Request sent" until a full
      // reload because reconciliation fetches friends, not `pendingSent`.
      setPendingSent((prev) => removeFromSet(prev, event.toUserId));
    });
    const unsubRemoved = subscribe("friend:removed", (event) => {
      setFriends((prev) => applyFriendEvent(prev, event));
    });
    return () => {
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

  const friendIds = new Set(friends.map((f) => f.user.id));
  const normalizedSearchQ = normalizeSubstringSearchQuery(searchQ);
  const loadFailed = friendsLoadState === "error";
  const loadPending = friendsLoadState === "loading";

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

  const railBody = (
    <>
      <SidebarHeader className="border-border-accent border-b px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-content-primary text-xl">Friends</h2>
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
                  className="h-8"
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
                            <span className="text-content-tertiary">
                              Friends
                            </span>
                          ) : isSending ? (
                            <span className="text-content-tertiary">
                              Sending…
                            </span>
                          ) : alreadySent ? (
                            <span className="text-content-tertiary">
                              Request sent
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
                    <p className="text-content-tertiary mt-2 text-center text-sm">
                      Enter at least 3 characters
                    </p>
                  )}
                {normalizedSearchQ.length >= MIN_SUBSTRING_SEARCH_LENGTH &&
                  searchState === "loading" && (
                    <p className="text-content-tertiary mt-2 text-center text-sm">
                      Searching…
                    </p>
                  )}
                {normalizedSearchQ.length >= MIN_SUBSTRING_SEARCH_LENGTH &&
                  searchState === "error" && (
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <span className="text-error text-sm">Search failed.</span>
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
                    <p className="text-content-tertiary mt-2 text-center text-sm">
                      No users found
                    </p>
                  )}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Drawer only (OPT-663): the docked rail has no dismissed
                  state, so there is nothing for a close control to do there. */}
            {isMobile && (
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-content-secondary hover:text-content-primary size-8"
                  aria-label="Close friends"
                  title="Close friends"
                >
                  <X className="size-4" />
                </Button>
              </SheetClose>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {loadFailed && (
          <SidebarGroup>
            <SidebarGroupLabel>Friends unavailable</SidebarGroupLabel>
            <SidebarGroupContent className="space-y-2 px-2">
              <p className="text-sm opacity-60">
                We couldn&apos;t load all friendship data. Check your connection
                and try again.
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
          <SidebarGroupLabel className="text-content-tertiary font-semibold tracking-widest uppercase">
            Online ({onlineCount})
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {friendsLoadState === "loading" && friends.length === 0 ? (
              <p className="text-content-tertiary px-2 text-sm">
                Loading friends…
              </p>
            ) : friendsLoadState === "error" &&
              friends.length === 0 ? null : onlineFriends.length === 0 ? (
              <p className="text-content-tertiary px-2 text-sm">
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
          <SidebarGroupLabel className="text-content-tertiary font-semibold tracking-widest uppercase">
            Offline ({offlineFriends.length})
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {friendsLoadState !== "loading" &&
            friendsLoadState !== "error" &&
            friends.length === 0 ? (
              <p className="text-content-tertiary px-2 text-sm">
                Add friends to start a conversation.
              </p>
            ) : offlineFriends.length === 0 ? (
              <p className="text-content-tertiary px-2 text-sm">
                Everyone is online.
              </p>
            ) : (
              <SidebarMenu className="gap-1">
                {offlineFriends.map((friend) => renderFriend(friend, false))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        <UserChannelConnectionStatus connectionStatus={connectionStatus} />
      </SidebarContent>
    </>
  );

  return (
    <TooltipProvider>
      {isMobile ? (
        <Sheet open={openMobile} onOpenChange={setOpenMobile}>
          <SheetContent
            id={FRIENDS_DRAWER_ID}
            side="right"
            // The header already carries a close control sized like its
            // siblings; the primitive's floating X would land on top of them.
            showCloseButton={false}
            // `social-rail` keeps the gold edge the docked rail is known by.
            // The width and max-width repeat the primitive's `data-[side]`
            // modifier because an unmodified `w-*` loses to it on specificity.
            className="social-rail bg-surface-nav data-[side=right]:w-social-rail gap-0 data-[side=right]:sm:max-w-none"
            // Radix would focus the first control in the panel, ringing "Add
            // friend" gold on open — an action nobody asked for. Focus the
            // panel itself: the drawer is announced, and Tab still walks in.
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById(FRIENDS_DRAWER_ID)?.focus();
            }}
            // Radix hands focus back to its own `Dialog.Trigger`, and this
            // drawer has none — the control that opens it lives in the navbar,
            // a different subtree. Without this, Escape drops focus on <body>.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById(FRIENDS_DRAWER_TOGGLE_ID)?.focus();
            }}
          >
            {/* The visible "Friends" heading below is a plain `h2`, so the
                dialog still needs its own accessible name. */}
            <SheetHeader className="sr-only">
              <SheetTitle>Friends</SheetTitle>
              <SheetDescription>
                Your friends list, presence, and requests.
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col">{railBody}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Sidebar
          side="right"
          collapsible="none"
          // The rail hangs below the full-width navbar: `top-navbar` is the
          // navbar's own height token, so the two cannot drift apart, and z-30
          // keeps the rail under the nav (z-40) rather than over it. `h-auto`
          // replaces the primitive's `h-full` so the top/bottom insets — not a
          // 100vh height that would overhang the viewport — size the rail.
          //
          // `hidden md:flex` is the CSS half of the OPT-663 split: it holds
          // even in the frame before any hook has read the viewport, so a
          // narrow screen never flashes a 280px rail over the page.
          className="social-rail bg-surface-nav w-social-rail top-navbar fixed right-0 bottom-0 z-30 hidden h-auto border-l md:flex"
        >
          {railBody}
        </Sidebar>
      )}

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
