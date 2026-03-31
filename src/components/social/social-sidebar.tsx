"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { UserPlus, Check, X, MoreHorizontal } from "lucide-react";
import { UserAvatar } from "./user-avatar";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SidebarUser {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

interface FriendEntry {
  friendshipId: string;
  user: SidebarUser;
}

interface FriendRequest {
  id: string;
  fromUser?: SidebarUser;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SocialSidebarProps {
  onOpenChat: (user: SidebarUser) => void;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function SocialSidebar({ onOpenChat }: SocialSidebarProps) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SidebarUser[]>([]);
  const [pendingSent, setPendingSent] = useState<Set<string>>(new Set());

  const fetchFriendsData = useCallback(async () => {
    const [friendsRes, requestsRes] = await Promise.all([
      fetch("/api/friends"),
      fetch("/api/friends/requests"),
    ]);
    if (friendsRes.ok) {
      const data = await friendsRes.json();
      setFriends(data.data || []);
    }
    if (requestsRes.ok) {
      const data = await requestsRes.json();
      setIncoming(data.incoming || []);
    }
  }, []);

  useEffect(() => {
    fetchFriendsData();
    const t = setInterval(fetchFriendsData, 30_000);
    return () => clearInterval(t);
  }, [fetchFriendsData]);

  const search = useCallback(async (q: string) => {
    setSearchQ(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setSearchResults(data.data || []);
  }, []);

  const removeFriend = useCallback(async (userId: string) => {
    await fetch(`/api/friends/${userId}`, { method: "DELETE" });
    setFriends((prev) => prev.filter((f) => f.user.id !== userId));
  }, []);

  const sendRequest = useCallback(async (toUserId: string) => {
    setPendingSent((p) => new Set(p).add(toUserId));
    await fetch("/api/friends/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId }),
    });
  }, []);

  const handleFriendRequest = useCallback(
    async (id: string, action: "accept" | "decline") => {
      await fetch(`/api/friends/requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setIncoming((prev) => prev.filter((r) => r.id !== id));
      if (action === "accept") fetchFriendsData();
    },
    [fetchFriendsData],
  );

  const friendIds = new Set(friends.map((f) => f.user.id));

  return (
    <Sidebar side="right" collapsible="none">
      {/* Header */}
      <SidebarHeader className="flex-row items-center justify-between">
        <span className="text-xs font-semibold">Friends</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => { setAddOpen((v) => !v); setSearchQ(""); setSearchResults([]); }}
          title="Add friend"
          className={addOpen ? "text-gold-500" : ""}
        >
          <UserPlus className="size-4" />
        </Button>
      </SidebarHeader>

      <SidebarContent>
        {/* Add friend search */}
        {addOpen && (
          <>
            <SidebarGroup>
              <SidebarGroupContent className="space-y-2">
                <Input
                  type="text"
                  value={searchQ}
                  onChange={(e) => search(e.target.value)}
                  placeholder="Search by username..."
                  className="h-8 text-xs"
                />
                {searchResults.length > 0 && (
                  <SidebarMenu>
                    {searchResults.map((u) => {
                      const isFriend = friendIds.has(u.id);
                      const alreadySent = pendingSent.has(u.id);
                      return (
                        <SidebarMenuItem key={u.id}>
                          <SidebarMenuButton className="cursor-default">
                            <UserAvatar user={u} size="sm" variant="dark" />
                            <span className="truncate">
                              {u.username || u.name}
                            </span>
                          </SidebarMenuButton>
                          {isFriend ? (
                            <SidebarMenuBadge className="text-xs opacity-50">Friends</SidebarMenuBadge>
                          ) : alreadySent ? (
                            <SidebarMenuBadge className="text-xs opacity-50">Sent</SidebarMenuBadge>
                          ) : (
                            <SidebarMenuAction onClick={() => sendRequest(u.id)}>
                              <UserPlus className="size-4 text-gold-500" />
                            </SidebarMenuAction>
                          )}
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                )}
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
          </>
        )}

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Requests ({incoming.length})</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {incoming.map((req) => (
                    <SidebarMenuItem key={req.id}>
                      <SidebarMenuButton className="cursor-default">
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
            {friends.length > 0 ? `Online (${friends.length})` : "Friends"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {friends.length === 0 ? (
              <p className="px-2 text-xs opacity-50">
                No friends yet. Use + to add players.
              </p>
            ) : (
              <SidebarMenu>
                {friends.map(({ friendshipId, user }) => (
                  <SidebarMenuItem key={friendshipId}>
                    <SidebarMenuButton onClick={() => onOpenChat(user)}>
                      <UserAvatar user={user} size="sm" variant="dark" showOnline />
                      <span className="truncate">
                        {user.username || user.name}
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
                          onClick={() => removeFriend(user.id)}
                          className="text-error focus:text-error"
                        >
                          Unfriend
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
