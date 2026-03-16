# M2 — Social

> Friend system, direct messaging, and game lobbies.

---

## Scope

M2 adds the social layer: users can find and friend each other, exchange direct messages in real time, and create or join game lobbies. This phase builds the connective tissue between the deck builder (M1) and the simulator (M3).

### Deliverables

- [ ] Friend search, request, accept/decline flow
- [ ] Friend list with online/in-game status indicators
- [ ] Real-time direct messaging between friends
- [ ] Lobby creation (select deck, format, visibility)
- [ ] Lobby browser (public lobbies) and invite system
- [ ] WebSocket infrastructure for real-time features

---

## Architecture (M2-Specific)

```
┌──────────────────────────────────────────────────────────┐
│   Next.js App                                            │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐│
│  │ Friends     │  │ Messaging   │  │ Lobbies          ││
│  │ • Search    │  │ • Inbox     │  │ • Create         ││
│  │ • Requests  │  │ • Convo     │  │ • Browse         ││
│  │ • List      │  │ • Real-time │  │ • Invite/Join    ││
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘│
│         │                │                   │           │
└─────────┼────────────────┼───────────────────┼───────────┘
          │ REST           │ REST + WS         │ REST + WS
          │                │                   │
┌─────────▼────────────────▼───────────────────▼───────────┐
│   API Server                                              │
│   • /api/friends/*                                        │
│   • /api/messages/*                                       │
│   • /api/lobbies/*                                        │
│                                                           │
│   WebSocket Server (co-located or separate)               │
│   • Presence tracking (online/in-game status)             │
│   • Message delivery                                      │
│   • Lobby state updates                                   │
└───────────────┬──────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────┐
│   PostgreSQL                                              │
│   + friends, friend_requests, messages, lobbies tables    │
└──────────────────────────────────────────────────────────┘
```

**Key decision:** M2 introduces WebSocket infrastructure. This is the same WebSocket layer the game server will use in M3, so the foundation built here carries forward.

---

## Implementation Plan

### 1. Database Schema (New Tables)

```prisma
model FriendRequest {
  id          String              @id @default(uuid())
  fromUserId  String
  toUserId    String
  status      FriendRequestStatus @default(PENDING)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  fromUser    User                @relation("SentRequests", fields: [fromUserId], references: [id])
  toUser      User                @relation("ReceivedRequests", fields: [toUserId], references: [id])

  @@unique([fromUserId, toUserId])
}

model Friendship {
  id          String   @id @default(uuid())
  userAId     String
  userBId     String
  createdAt   DateTime @default(now())

  userA       User     @relation("FriendshipsA", fields: [userAId], references: [id])
  userB       User     @relation("FriendshipsB", fields: [userBId], references: [id])

  @@unique([userAId, userBId])
}

model Message {
  id          String   @id @default(uuid())
  fromUserId  String
  toUserId    String
  body        String
  read        Boolean  @default(false)
  createdAt   DateTime @default(now())

  fromUser    User     @relation("SentMessages", fields: [fromUserId], references: [id])
  toUser      User     @relation("ReceivedMessages", fields: [toUserId], references: [id])

  @@index([fromUserId, toUserId, createdAt])
}

model Lobby {
  id          String       @id @default(uuid())
  hostUserId  String
  hostDeckId  String
  format      String       @default("Standard")
  visibility  LobbyVisibility @default(PUBLIC)
  status      LobbyStatus  @default(WAITING)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  host        User         @relation("HostedLobbies", fields: [hostUserId], references: [id])
  hostDeck    Deck         @relation("LobbyHostDeck", fields: [hostDeckId], references: [id])
  invites     LobbyInvite[]
  guest       LobbyGuest?
}

model LobbyGuest {
  id          String  @id @default(uuid())
  lobbyId     String  @unique
  userId      String
  deckId      String

  lobby       Lobby   @relation(fields: [lobbyId], references: [id], onDelete: Cascade)
  user        User    @relation(fields: [userId], references: [id])
  deck        Deck    @relation(fields: [deckId], references: [id])
}

model LobbyInvite {
  id          String            @id @default(uuid())
  lobbyId     String
  userId      String
  status      LobbyInviteStatus @default(PENDING)
  createdAt   DateTime          @default(now())

  lobby       Lobby             @relation(fields: [lobbyId], references: [id], onDelete: Cascade)
  user        User              @relation(fields: [userId], references: [id])

  @@unique([lobbyId, userId])
}

enum FriendRequestStatus {
  PENDING
  ACCEPTED
  DECLINED
}

enum LobbyVisibility {
  PUBLIC
  INVITE_ONLY
}

enum LobbyStatus {
  WAITING
  READY
  IN_GAME
  CLOSED
}

enum LobbyInviteStatus {
  PENDING
  ACCEPTED
  DECLINED
}
```

**Design notes:**
- `Friendship` is stored with `userAId < userBId` (lexicographic) to avoid duplicate rows
- Messages are indexed on `(fromUserId, toUserId, createdAt)` for efficient conversation queries
- Lobby separates host and guest to enforce exactly 2 players

### 2. Friend System

**API endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users/search?q=username` | Search users by exact or partial username |
| `POST` | `/api/friends/requests` | Send friend request |
| `GET` | `/api/friends/requests` | List pending incoming/outgoing requests |
| `PUT` | `/api/friends/requests/:id` | Accept or decline request |
| `GET` | `/api/friends` | List friends with online status |
| `DELETE` | `/api/friends/:userId` | Remove friend |

**Business rules:**
- Cannot send a request to yourself
- Cannot send a duplicate pending request
- Cannot send a request to an existing friend
- Accepting a request creates a `Friendship` row and deletes the request
- Declining deletes the request
- Removing a friend deletes the `Friendship` row (both directions)

**UI components:**

| Component | Description |
|-----------|-------------|
| `UserSearch` | Search input with debounced results, "Add Friend" button per result |
| `FriendRequests` | Inbox of incoming requests with Accept/Decline buttons |
| `FriendList` | List of friends with online/in-game status dots |
| `FriendContextMenu` | Right-click/long-press: Message, Invite to Game, Remove Friend |

### 3. Presence System

**How online/in-game status works:**

```
User connects via WebSocket
  → Server adds user to presence map: { userId → { status: 'online', connectedAt } }
  → Server broadcasts status to user's friends

User enters a game
  → Server updates presence: { status: 'in-game', gameId }
  → Server broadcasts status to friends

User disconnects (WebSocket close)
  → Server starts 30s grace period (handles page refreshes)
  → If no reconnection → remove from presence map
  → Server broadcasts 'offline' to friends
```

**Implementation:**
- In-memory presence map on the WebSocket server (sufficient for single-instance; Redis if scaling horizontally)
- Friends receive presence updates only for their friends (not global broadcast)
- Client shows green dot (online), amber dot (in-game), or gray dot (offline)

### 4. Direct Messaging

**API endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/messages/conversations` | List conversations (last message, unread count) |
| `GET` | `/api/messages/:userId` | Get message history with a user (paginated) |
| `POST` | `/api/messages/:userId` | Send a message |
| `PUT` | `/api/messages/:messageId/read` | Mark as read |

**Real-time delivery via WebSocket:**

```
Sender types message → POST /api/messages/:userId
  → Server persists message to DB
  → Server pushes message via WebSocket to recipient (if connected)
  → Recipient's client appends message to conversation

If recipient is offline:
  → Message stored in DB
  → Delivered when they next load conversations or connect via WebSocket
```

**UI components:**

| Component | Description |
|-----------|-------------|
| `ConversationList` | Sidebar list of conversations, sorted by last message time |
| `ChatWindow` | Message history with auto-scroll, message input at bottom |
| `MessageBubble` | Individual message with timestamp, read receipt |
| `UnreadBadge` | Notification count on friends/messaging nav items |

**Constraints (v1):**
- Text-only messages (no attachments, no images, no markdown)
- No group messages — 1:1 only
- No message editing or deletion (can add later)
- Messages are retained indefinitely (no TTL)

### 5. Lobby System

**API endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/lobbies` | Create lobby (select deck, format, visibility) |
| `GET` | `/api/lobbies` | List public lobbies (WAITING status only) |
| `GET` | `/api/lobbies/:id` | Get lobby details |
| `POST` | `/api/lobbies/:id/join` | Join a public lobby (select deck) |
| `POST` | `/api/lobbies/:id/invite` | Invite a friend |
| `PUT` | `/api/lobbies/:id/invite/:inviteId` | Accept/decline invite |
| `POST` | `/api/lobbies/:id/ready` | Mark self as ready |
| `POST` | `/api/lobbies/:id/start` | Host starts game (both players must be ready) |
| `DELETE` | `/api/lobbies/:id` | Host closes lobby |

**Lobby lifecycle:**

```
WAITING → (guest joins) → READY → (host clicks start) → IN_GAME → CLOSED
                                                           ↑
                                                   (game ends)
```

**Real-time updates via WebSocket:**
- When a guest joins, both players' clients update
- Ready status changes are broadcast
- Lobby browser auto-refreshes via WebSocket (new lobbies appear, full lobbies disappear)
- Invite notifications pushed to invited user

**UI components:**

| Component | Description |
|-----------|-------------|
| `CreateLobbyModal` | Select deck (from saved decks), format, visibility |
| `LobbyBrowser` | List of public lobbies with host name, format, join button |
| `LobbyRoom` | Pre-game screen showing host + guest, deck info, ready status |
| `InviteModal` | Friend list with invite buttons |

**Rules:**
- Host must have a valid deck saved
- Guest must select a valid deck when joining
- Both decks must be valid for the selected format
- A lobby auto-closes after 30 minutes of inactivity (no guest joins)

---

## WebSocket Infrastructure

M2 introduces the WebSocket layer that will also power the game simulator in M3.

**Technology choice: Socket.io**
- Automatic reconnection with exponential backoff
- Room management (per-lobby, per-game)
- Namespace separation (`/social` for presence/messaging, `/game` for simulator)
- Fallback to long-polling if WebSocket is blocked

**Connection flow:**
```
Client authenticates via REST → receives JWT
Client connects to WebSocket with JWT in auth handshake
Server validates JWT → associates socket with userId
Server adds user to presence map
Server subscribes user to friend-update rooms
```

**Namespace design:**

| Namespace | Purpose | Events |
|-----------|---------|--------|
| `/social` | Presence, messaging, lobby updates | `presence:update`, `message:new`, `lobby:update`, `invite:new` |
| `/game` | Game state sync (M3) | `game:state`, `game:action`, `game:prompt` |

**Deployment:**
- In M2, WebSocket server can be co-located with the API (same process) for simplicity
- In M3, the game server separates into its own process (long-running, stateful)

---

## Roadmap

| Step | Task | Est. |
|------|------|------|
| 1 | Add friend/message/lobby tables to Prisma schema + migrate | 0.5 day |
| 2 | Set up WebSocket server (Socket.io) with auth | 1 day |
| 3 | Implement presence system | 1 day |
| 4 | Build friend request API + UI | 1–2 days |
| 5 | Build friend list with online status | 0.5 day |
| 6 | Build messaging API + real-time delivery | 1–2 days |
| 7 | Build messaging UI (conversation list, chat window) | 1–2 days |
| 8 | Build lobby CRUD API | 1 day |
| 9 | Build lobby browser + lobby room UI | 1–2 days |
| 10 | Build invite system (send, accept, decline) | 0.5 day |
| 11 | Integration testing (friend → message → create lobby → invite → join) | 1 day |

**Total estimate: ~10–13 days**

---

## Acceptance Criteria

- [ ] User can search for another user by username and send a friend request
- [ ] Friend requests can be accepted or declined; accepted requests appear in friend list
- [ ] Friend list shows real-time online/in-game/offline status
- [ ] Messages are delivered in real time to online friends
- [ ] Offline messages are visible when the recipient loads the conversation
- [ ] User can create a lobby, selecting from their saved decks
- [ ] Public lobbies appear in the lobby browser
- [ ] Invited friends receive a notification and can join the lobby
- [ ] Both players in a lobby can ready up; host can start the game (game transition is a stub in M2 — actual game logic is M3)
- [ ] WebSocket reconnection works (refresh page → still online, messages still arrive)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| WebSocket server scaling (single instance) | Can't handle many concurrent users | Sufficient for MVP; add Redis adapter for Socket.io when scaling horizontally |
| Presence flickers on page refresh | Confusing UX for friends | 30-second grace period before marking offline |
| Message ordering issues with real-time + DB | Messages appear out of order | Use `createdAt` timestamp from server (not client); sort client-side by timestamp |
| Lobby stale state (host leaves without closing) | Orphaned lobbies clutter browser | Auto-close lobbies after 30min inactivity; clean up on host disconnect |

---

## Dependencies

- M0 complete (auth, users table)
- M1 complete (decks — needed for lobby deck selection)

---

_Last updated: 2026-03-15_
