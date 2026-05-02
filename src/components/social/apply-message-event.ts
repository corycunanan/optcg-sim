import type { SerializedMessage } from "@/types/realtime";

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  fromUserId: string;
}

/**
 * Reducer for `message:new` events on a single chat-widget conversation.
 * Returns `current` unchanged when the event isn't for this conversation
 * partner or when the id is already rendered — the sender's own optimistic
 * append after POST wins the race against the server push.
 */
export function applyMessageEvent(
  current: ChatMessage[],
  message: SerializedMessage,
  conversationUserId: string,
): ChatMessage[] {
  if (message.fromUserId !== conversationUserId) return current;
  if (current.some((m) => m.id === message.id)) return current;
  return [
    ...current,
    {
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      fromUserId: message.fromUserId,
    },
  ];
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
