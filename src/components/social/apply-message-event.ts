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
