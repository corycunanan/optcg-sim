"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { UserPlus, ChevronRight, ChevronLeft, Check, X, MoreHorizontal } from "lucide-react";
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-widest text-content-inverse/40">
      {children}
    </p>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SocialSidebarProps {
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  onOpenChat: (user: SidebarUser) => void;
  hideNav?: boolean;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function SocialSidebar({ collapsed, onCollapse, onOpenChat, hideNav }: SocialSidebarProps) {
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

  // ── Collapsed strip ────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <aside className={cn(
        "sticky z-20 flex w-10 shrink-0 flex-col items-center border-l border-navy-700 bg-navy-900 py-3 gap-3",
        hideNav ? "top-0 h-screen" : "top-16 h-[calc(100vh-4rem)]",
      )}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onCollapse(false)}
          title="Expand"
          className="text-content-inverse/50 hover:bg-navy-800 hover:text-content-inverse"
        >
          <ChevronLeft className="size-4" />
        </Button>
        {incoming.length > 0 && (
          <span className="flex size-4 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-navy-900">
            {incoming.length > 9 ? "9+" : incoming.length}
          </span>
        )}
      </aside>
    );
  }

  // ── Full sidebar ───────────────────────────────────────────────────────────

  return (
    <aside className={cn(
      "sticky z-20 flex w-64 shrink-0 flex-col border-l border-navy-700 bg-navy-900 overflow-hidden",
      hideNav ? "top-0 h-screen" : "top-16 h-[calc(100vh-4rem)]",
    )}>

      {/* Header */}
      <div className="flex items-center gap-1 border-b border-navy-700 px-3 py-3">
        <span className="flex-1 text-xs font-semibold text-content-inverse/70">Friends</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => { setAddOpen((v) => !v); setSearchQ(""); setSearchResults([]); }}
          title="Add friend"
          className={cn(
            addOpen ? "text-gold-500" : "text-content-inverse/50 hover:bg-navy-800 hover:text-content-inverse",
          )}
        >
          <UserPlus className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onCollapse(true)}
          title="Collapse"
          className="text-content-inverse/50 hover:bg-navy-800 hover:text-content-inverse"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Add friend search */}
        {addOpen && (
          <div className="border-b border-navy-700 px-3 py-3 space-y-2">
            <Input
              type="text"
              value={searchQ}
              onChange={(e) => search(e.target.value)}
              placeholder="Search by username..."
              className="h-8 bg-navy-800 text-xs text-content-inverse placeholder:text-content-inverse/40 border-transparent focus-visible:outline-gold-500"
            />
            {searchResults.length > 0 && (
              <div className="space-y-1">
                {searchResults.map((u) => {
                  const isFriend = friendIds.has(u.id);
                  const alreadySent = pendingSent.has(u.id);
                  return (
                    <div key={u.id} className="flex items-center gap-2 rounded-md px-2 py-2">
                      <UserAvatar user={u} size="sm" variant="dark" />
                      <span className="flex-1 truncate text-xs text-content-inverse">
                        {u.username || u.name}
                      </span>
                      {isFriend ? (
                        <span className="text-xs text-content-inverse/40">Friends</span>
                      ) : alreadySent ? (
                        <span className="text-xs text-content-inverse/40">Sent</span>
                      ) : (
                        <button
                          onClick={() => sendRequest(u.id)}
                          className="text-xs font-medium text-gold-500 transition-colors hover:text-gold-400"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <div className="border-b border-navy-700 px-3 py-3">
            <SectionLabel>Requests ({incoming.length})</SectionLabel>
            <div className="space-y-1">
              {incoming.map((req) => (
                <div key={req.id} className="flex items-center gap-2 rounded-md px-2 py-2">
                  <UserAvatar user={req.fromUser!} size="sm" variant="dark" />
                  <span className="flex-1 truncate text-xs font-medium text-content-inverse">
                    {req.fromUser?.username || req.fromUser?.name}
                  </span>
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
                    className="size-6 text-content-inverse/40 hover:text-content-inverse/70"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends list */}
        <div className="flex-1 overflow-y-auto px-2 py-3">
          <SectionLabel>
            {friends.length > 0 ? `Online (${friends.length})` : "Friends"}
          </SectionLabel>
          {friends.length === 0 ? (
            <p className="px-2 text-xs text-content-inverse/40">
              No friends yet. Use + to add players.
            </p>
          ) : (
            <div className="space-y-0.5">
              {friends.map(({ friendshipId, user }) => (
                <div key={friendshipId} className="group flex items-center">
                  <button
                    onClick={() => onOpenChat(user)}
                    className="flex flex-1 items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-navy-800"
                  >
                    <div className="relative shrink-0">
                      <UserAvatar user={user} size="sm" variant="dark" />
                      <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-navy-900 bg-navy-500" />
                    </div>
                    <span className="truncate text-xs font-medium text-content-inverse">
                      {user.username || user.name}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-6 opacity-0 group-hover:opacity-100 text-content-inverse/40 hover:text-content-inverse"
                      >
                        <MoreHorizontal className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-32">
                      <DropdownMenuItem
                        onClick={() => removeFriend(user.id)}
                        className="text-error focus:text-error"
                      >
                        Unfriend
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
