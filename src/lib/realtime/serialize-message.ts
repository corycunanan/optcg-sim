import type { SerializedMessage } from "@/types/realtime";

/**
 * Wire shape for `message:new` payloads. `createdAt` is an ISO string; the
 * channel sends JSON, so the recipient never sees a `Date` instance.
 */
export interface MessageWithSender {
  id: string;
  fromUserId: string;
  toUserId: string;
  body: string;
  createdAt: Date;
  fromUser: {
    id: string;
    username: string | null;
    name: string | null;
    image: string | null;
  };
}

export function serializeMessageForEvent(
  message: MessageWithSender,
): SerializedMessage {
  return {
    id: message.id,
    fromUserId: message.fromUserId,
    toUserId: message.toUserId,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    fromUser: {
      id: message.fromUser.id,
      username: message.fromUser.username,
      name: message.fromUser.name,
      image: message.fromUser.image,
    },
  };
}
