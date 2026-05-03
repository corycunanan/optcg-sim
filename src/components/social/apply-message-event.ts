import type { SerializedMessage } from "@/types/realtime";

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  fromUserId: string;
  /**
   * OPT-359 — receipt timestamp. Drives the sender-side ✓ vs ✓✓ render.
   * Null until the recipient marks the message read.
   */
  readAt: string | null;
}

/**
 * Reducer for `message:new` events on a single chat-widget conversation.
 * Accepts a message iff `conversationUserId` is on either end of it — that
 * way the gate is robust to fanout policy changes (e.g. notifying the
 * sender's own tabs as well as the recipient). Already-rendered ids are
 * dropped so the sender's optimistic append after POST wins the race
 * against the server push.
 */
export function applyMessageEvent(
  current: ChatMessage[],
  message: SerializedMessage,
  conversationUserId: string,
): ChatMessage[] {
  if (
    message.fromUserId !== conversationUserId &&
    message.toUserId !== conversationUserId
  ) {
    return current;
  }
  if (current.some((m) => m.id === message.id)) return current;
  return [
    ...current,
    {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      fromUserId: message.fromUserId,
      readAt: message.readAt,
    },
  ];
}

/**
 * OPT-359 — reducer for `chat:read_to` events. Marks the current user's
 * own messages (i.e., those they sent in this conversation) created
 * at-or-before `throughCreatedAt` as read. No-op for messages already
 * carrying a `readAt` (don't overwrite earlier timestamps with later
 * ones).
 */
export function applyReadToEvent(
  current: ChatMessage[],
  myUserId: string,
  throughCreatedAt: string,
): ChatMessage[] {
  let changed = false;
  const next = current.map((m) => {
    if (m.fromUserId !== myUserId) return m;
    if (m.readAt !== null) return m;
    if (m.createdAt > throughCreatedAt) return m;
    changed = true;
    return { ...m, readAt: throughCreatedAt };
  });
  return changed ? next : current;
}

/**
 * Merge the initial history GET response with whatever pushed-during-fetch
 * messages already landed in component state. Without this, a push that
 * arrives before the GET resolves would be erased by `setMessages(history)`
 * and only reappear when the 60s reconciliation backstop runs.
 */
export function mergeInitialHistory(
  history: ChatMessage[],
  pushedDuringFetch: ChatMessage[],
): ChatMessage[] {
  if (pushedDuringFetch.length === 0) return history;
  const seen = new Set(history.map((m) => m.id));
  const fresh = pushedDuringFetch.filter((m) => !seen.has(m.id));
  return fresh.length === 0 ? history : [...history, ...fresh];
}
