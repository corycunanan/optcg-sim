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

interface Deck {
  id: string;
  name: string;
}

interface LobbyInvite {
  id: string;
  lobby: {
    id: string;
    format: string;
    host: SidebarUser;
    hostDeck: Deck;
  };
}

interface MyLobby {
  id: string;
  format: string;
  visibility: string;
  hostDeck: Deck;
  guest: { user: SidebarUser; deck: Deck } | null;
}

interface OpenLobby {
  id: string;
  format: string;
  host: SidebarUser;
  hostDeck: Deck;
}

type SidebarMode = "friends" | "play";

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconPeople({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-4 w-4", className)}>
      <path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM.07 16.18a8 8 0 0 1 13.86 0A1 1 0 0 1 13 17H1a1 1 0 0 1-.93-1.82zm15.7-1.49a9.5 9.5 0 0 1 4.16 2.17A1 1 0 0 1 19 18.5h-3.27a9.02 9.02 0 0 0-1.83-4.73 5 5 0 0 1 1.87.92z" />
    </svg>
  );
}

function IconSwords({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cn("h-4 w-4", className)}>
      <path fillRule="evenodd" d="M2 3a1 1 0 0 1 1-1h4a1 1 0 0 1 .707.293L14 8.586l1.293-1.293a1 1 0 1 1 1.414 1.414L15.414 10l1.293 1.293a1 1 0 0 1-1.414 1.414L14 11.414l-1.707 1.707A1 1 0 0 1 12 13H8a1 1 0 0 1-.707-.293L6 11.414l-1.293 1.293a1 1 0 0 1-1.414-1.414L4.586 10 3.293 8.707A1 1 0 0 1 3 8V3zm2 1v3.586l1 1L8.414 11H11.586L13 9.586l1-1V4H4z" clipRule="evenodd" />
    </svg>
  );
}

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

// ─── Props ─────────────────────────────────────────────────────────────────────

interface SocialSidebarProps {
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  onOpenChat: (user: SidebarUser) => void;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function SocialSidebar({ collapsed, onCollapse, onOpenChat }: SocialSidebarProps) {
  // Friends state
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SidebarUser[]>([]);
  const [pendingSent, setPendingSent] = useState<Set<string>>(new Set());

  // Context menu (right-click on friend)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    userId: string;
  } | null>(null);

  // Lobby state
  const [lobbyInvites, setLobbyInvites] = useState<LobbyInvite[]>([]);
  const [myLobby, setMyLobby] = useState<MyLobby | null>(null);
  const [openLobbies, setOpenLobbies] = useState<OpenLobby[]>([]);
  const [userDecks, setUserDecks] = useState<Deck[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDeckId, setCreateDeckId] = useState("");
  const [createFormat, setCreateFormat] = useState("Standard");
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinDeckId, setJoinDeckId] = useState("");

  const [mode, setMode] = useState<SidebarMode>("friends");

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

  const fetchLobbyData = useCallback(async () => {
    const res = await fetch("/api/lobbies/status");
    if (res.ok) {
      const data = await res.json();
      setLobbyInvites(data.invites || []);
      setMyLobby(data.myLobby || null);
      setOpenLobbies(data.openLobbies || []);
    }
  }, []);

  const fetchDecks = useCallback(async () => {
    const res = await fetch("/api/decks");
    if (res.ok) {
      const data = await res.json();
      const decks: Deck[] = (data.data || []).map((d: Deck) => ({ id: d.id, name: d.name }));
      setUserDecks(decks);
      if (decks.length > 0) {
        setCreateDeckId(decks[0].id);
        setJoinDeckId(decks[0].id);
      }
    }
  }, []);

  useEffect(() => {
    fetchFriendsData();
    fetchLobbyData();
    fetchDecks();
    const interval = setInterval(() => {
      fetchFriendsData();
      fetchLobbyData();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchFriendsData, fetchLobbyData, fetchDecks]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    function dismiss() { setContextMenu(null); }
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [contextMenu]);

  // ── Friend actions ──────────────────────────────────────────────────────────

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

  // ── Lobby actions ───────────────────────────────────────────────────────────

  const createLobby = useCallback(async () => {
    if (!createDeckId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/lobbies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: createDeckId, format: createFormat, visibility: "PUBLIC" }),
      });
      if (res.ok) {
        setCreateOpen(false);
        fetchLobbyData();
      }
    } finally {
      setCreating(false);
    }
  }, [createDeckId, createFormat, fetchLobbyData]);

  const cancelLobby = useCallback(async () => {
    if (!myLobby) return;
    await fetch(`/api/lobbies/${myLobby.id}`, { method: "DELETE" });
    setMyLobby(null);
    fetchLobbyData();
  }, [myLobby, fetchLobbyData]);

  const joinLobby = useCallback(async (lobbyId: string) => {
    if (!joinDeckId) return;
    const res = await fetch(`/api/lobbies/${lobbyId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckId: joinDeckId }),
    });
    if (res.ok) {
      setJoiningId(null);
      fetchLobbyData();
    }
  }, [joinDeckId, fetchLobbyData]);

  const handleLobbyInvite = useCallback(
    async (inviteId: string, lobbyId: string, action: "accept" | "decline") => {
      await fetch(`/api/lobbies/${lobbyId}/invite/${inviteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setLobbyInvites((prev) => prev.filter((i) => i.id !== inviteId));
      if (action === "accept") fetchLobbyData();
    },
    [fetchLobbyData],
  );

  const totalBadge = incoming.length + lobbyInvites.length;
  const friendIds = new Set(friends.map((f) => f.user.id));

  // ── Collapsed strip ─────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <aside className="sticky top-16 z-20 flex h-[calc(100vh-4rem)] w-10 shrink-0 flex-col items-center border-l border-navy-700 bg-navy-900 py-3 gap-3">
        <button
          onClick={() => onCollapse(false)}
          title="Expand social panel"
          className="rounded p-1 text-content-inverse/50 transition-colors hover:bg-navy-800 hover:text-content-inverse"
        >
          <IconChevronLeft />
        </button>
        {totalBadge > 0 && (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-navy-900">
            {totalBadge > 9 ? "9+" : totalBadge}
          </span>
        )}
      </aside>
    );
  }

  // ── Full sidebar ─────────────────────────────────────────────────────────────

  return (
    <aside className="sticky top-16 z-20 flex h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-l border-navy-700 bg-navy-900 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-1 border-b border-navy-700 px-3 py-3">
        <button
          onClick={() => setMode("friends")}
          title="Friends"
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
            mode === "friends"
              ? "bg-navy-800 text-content-inverse"
              : "text-content-inverse/50 hover:bg-navy-800 hover:text-content-inverse",
          )}
        >
          <IconPeople />
          {incoming.length > 0 && (
            <span className="flex h-3 w-3 items-center justify-center rounded-full bg-gold-500 text-[9px] font-bold text-navy-900">
              {incoming.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setMode("play")}
          title="Play"
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
            mode === "play"
              ? "bg-navy-800 text-content-inverse"
              : "text-content-inverse/50 hover:bg-navy-800 hover:text-content-inverse",
          )}
        >
          <IconSwords />
          {lobbyInvites.length > 0 && (
            <span className="flex h-3 w-3 items-center justify-center rounded-full bg-gold-500 text-[9px] font-bold text-navy-900">
              {lobbyInvites.length}
            </span>
          )}
        </button>

        <div className="flex-1" />

        {mode === "friends" && (
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
        )}

        <button
          onClick={() => onCollapse(true)}
          title="Collapse"
          className="rounded p-1 text-content-inverse/50 transition-colors hover:bg-navy-800 hover:text-content-inverse"
        >
          <IconChevronRight />
        </button>
      </div>

      {/* ── FRIENDS MODE ─────────────────────────────────────────── */}
      {mode === "friends" && (
        <div className="flex flex-1 flex-col overflow-hidden">

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

          <div className="flex-1 overflow-y-auto px-2 py-3">
            <SectionLabel>
              Friends{friends.length > 0 ? ` (${friends.length})` : ""}
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
      )}

      {/* ── CONTEXT MENU (right-click on friend) ─────────────────── */}
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

      {/* ── PLAY MODE ────────────────────────────────────────────── */}
      {mode === "play" && (
        <div className="flex flex-1 flex-col overflow-y-auto">

          {lobbyInvites.length > 0 && (
            <div className="border-b border-navy-700 px-3 py-3">
              <SectionLabel>Game Invites ({lobbyInvites.length})</SectionLabel>
              <div className="space-y-2">
                {lobbyInvites.map((invite) => (
                  <div key={invite.id} className="rounded-lg bg-navy-800 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={invite.lobby.host} size="sm" variant="dark" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium text-content-inverse">
                          {invite.lobby.host.username || invite.lobby.host.name}
                        </p>
                        <p className="text-xs text-content-inverse/50">
                          {invite.lobby.hostDeck.name} · {invite.lobby.format}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => handleLobbyInvite(invite.id, invite.lobby.id, "accept")}
                        className="flex-1 rounded-md bg-gold-500 py-1 text-xs font-semibold text-navy-900 transition-colors hover:bg-gold-400"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleLobbyInvite(invite.id, invite.lobby.id, "decline")}
                        className="rounded-md border border-navy-700 px-3 py-1 text-xs text-content-inverse/50 transition-colors hover:bg-navy-700"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myLobby && (
            <div className="border-b border-navy-700 px-3 py-3">
              <SectionLabel>My Lobby</SectionLabel>
              <div className="rounded-lg bg-navy-800 px-3 py-3">
                <p className="text-xs font-medium text-content-inverse">{myLobby.hostDeck.name}</p>
                <p className="text-xs text-content-inverse/50">
                  {myLobby.format} · {myLobby.visibility === "PUBLIC" ? "Public" : "Invite Only"}
                </p>
                {myLobby.guest ? (
                  <div className="mt-2 flex items-center gap-2">
                    <UserAvatar user={myLobby.guest.user} size="sm" variant="dark" />
                    <span className="text-xs text-content-inverse">
                      {myLobby.guest.user.username || myLobby.guest.user.name} joined!
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-xs italic text-content-inverse/50">
                    Waiting for opponent…
                  </p>
                )}
                <button
                  onClick={cancelLobby}
                  className="mt-2 w-full rounded-md border border-navy-700 py-1 text-xs text-content-inverse/50 transition-colors hover:bg-navy-700 hover:text-content-inverse"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {!myLobby && (
            <div className="border-b border-navy-700 px-3 py-3">
              {!createOpen ? (
                <button
                  onClick={() => setCreateOpen(true)}
                  disabled={userDecks.length === 0}
                  className="w-full rounded-md bg-gold-500 py-2 text-xs font-semibold text-navy-900 transition-colors hover:bg-gold-400 disabled:opacity-40"
                >
                  {userDecks.length === 0 ? "No decks — build one first" : "+ Create Lobby"}
                </button>
              ) : (
                <div className="space-y-2">
                  <SectionLabel>New Lobby</SectionLabel>
                  <select
                    value={createDeckId}
                    onChange={(e) => setCreateDeckId(e.target.value)}
                    className="w-full rounded-md bg-navy-800 px-3 py-2 text-xs text-content-inverse focus:outline-none"
                  >
                    {userDecks.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <select
                    value={createFormat}
                    onChange={(e) => setCreateFormat(e.target.value)}
                    className="w-full rounded-md bg-navy-800 px-3 py-2 text-xs text-content-inverse focus:outline-none"
                  >
                    <option>Standard</option>
                    <option>Block</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={createLobby}
                      disabled={creating || !createDeckId}
                      className="flex-1 rounded-md bg-gold-500 py-2 text-xs font-semibold text-navy-900 transition-colors hover:bg-gold-400 disabled:opacity-50"
                    >
                      {creating ? "Creating…" : "Create"}
                    </button>
                    <button
                      onClick={() => setCreateOpen(false)}
                      className="rounded-md border border-navy-700 px-3 py-2 text-xs text-content-inverse/50 transition-colors hover:bg-navy-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 px-3 py-3">
            <SectionLabel>
              Open Lobbies{openLobbies.length > 0 ? ` (${openLobbies.length})` : ""}
            </SectionLabel>
            {openLobbies.length === 0 ? (
              <p className="px-2 text-xs text-content-inverse/40">No open lobbies right now.</p>
            ) : (
              <div className="space-y-2">
                {openLobbies.map((lobby) => (
                  <div key={lobby.id} className="rounded-lg bg-navy-800 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={lobby.host} size="sm" variant="dark" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-medium text-content-inverse">
                          {lobby.host.username || lobby.host.name}
                        </p>
                        <p className="text-xs text-content-inverse/50">
                          {lobby.hostDeck.name} · {lobby.format}
                        </p>
                      </div>
                    </div>
                    {joiningId === lobby.id ? (
                      <div className="mt-2 space-y-2">
                        <select
                          value={joinDeckId}
                          onChange={(e) => setJoinDeckId(e.target.value)}
                          className="w-full rounded-md bg-navy-700 px-2 py-1 text-xs text-content-inverse focus:outline-none"
                        >
                          {userDecks.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={() => joinLobby(lobby.id)}
                            disabled={!joinDeckId}
                            className="flex-1 rounded-md bg-gold-500 py-1 text-xs font-semibold text-navy-900 hover:bg-gold-400 disabled:opacity-50"
                          >
                            Join
                          </button>
                          <button
                            onClick={() => setJoiningId(null)}
                            className="rounded-md border border-navy-700 px-2 py-1 text-xs text-content-inverse/50 hover:bg-navy-700"
                          >
                            ✗
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setJoiningId(lobby.id)}
                        disabled={userDecks.length === 0}
                        className="mt-2 w-full rounded-md bg-navy-700 py-1 text-xs font-medium text-content-inverse transition-colors hover:bg-navy-600 disabled:opacity-40"
                      >
                        Join
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
