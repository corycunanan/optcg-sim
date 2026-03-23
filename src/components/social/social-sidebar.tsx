"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
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

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconAddFriend({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-4 w-4", className)}>
      <path d="M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6a5 5 0 0 1 10 0H3zm13-5v-2h-2V8h2V6h1v2h2v1h-2v2h-1z" />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-4 w-4", className)}>
      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function IconChevronLeft({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-4 w-4", className)}>
      <path fillRule="evenodd" d="M12.707 5.293a1 1 0 0 1 0 1.414L9.414 10l3.293 3.293a1 1 0 0 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 0z" clipRule="evenodd" />
    </svg>
  );
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; userId: string } | null>(null);

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

  useEffect(() => {
    if (!contextMenu) return;
    function dismiss() { setContextMenu(null); }
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [contextMenu]);

  const search = useCallback(async (q: string) => {
    setSearchQ(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setSearchResults(data.data || []);
  }, []);

  const removeFriend = useCallback(async (userId: string) => {
    setContextMenu(null);
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
        <button
          onClick={() => onCollapse(false)}
          title="Expand"
          className="rounded p-1 text-content-inverse/50 transition-colors hover:bg-navy-800 hover:text-content-inverse"
        >
          <IconChevronLeft />
        </button>
        {incoming.length > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-navy-900">
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
        <button
          onClick={() => { setAddOpen((v) => !v); setSearchQ(""); setSearchResults([]); }}
          title="Add friend"
          className={cn(
            "rounded p-1 transition-colors",
            addOpen ? "text-gold-500" : "text-content-inverse/50 hover:bg-navy-800 hover:text-content-inverse",
          )}
        >
          <IconAddFriend />
        </button>
        <button
          onClick={() => onCollapse(true)}
          title="Collapse"
          className="rounded p-1 text-content-inverse/50 transition-colors hover:bg-navy-800 hover:text-content-inverse"
        >
          <IconChevronRight />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Add friend search */}
        {addOpen && (
          <div className="border-b border-navy-700 px-3 py-3 space-y-2">
            <input
              type="text"
              value={searchQ}
              onChange={(e) => search(e.target.value)}
              placeholder="Search by username…"
              className="w-full rounded-md bg-navy-800 px-3 py-2 text-xs text-content-inverse placeholder:text-content-inverse/40 focus:outline-none"
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
                  <button
                    onClick={() => handleFriendRequest(req.id, "accept")}
                    title="Accept"
                    className="rounded px-1 py-1 text-xs font-bold text-gold-500 transition-colors hover:text-gold-400"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => handleFriendRequest(req.id, "decline")}
                    title="Decline"
                    className="rounded px-1 py-1 text-xs text-content-inverse/40 transition-colors hover:text-content-inverse/70"
                  >
                    ✗
                  </button>
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
                <button
                  key={friendshipId}
                  onClick={() => onOpenChat(user)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, userId: user.id });
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-navy-800"
                >
                  <div className="relative shrink-0">
                    <UserAvatar user={user} size="sm" variant="dark" />
                    <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-navy-900 bg-navy-500" />
                  </div>
                  <span className="truncate text-xs font-medium text-content-inverse">
                    {user.username || user.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-36 rounded-lg border border-border bg-background py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => removeFriend(contextMenu.userId)}
            className="block w-full px-4 py-2 text-left text-sm text-error transition-colors hover:bg-error-soft"
          >
            Unfriend
          </button>
        </div>
      )}
    </aside>
  );
}
