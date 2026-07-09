"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { X, Minus, ChevronUp, Check, CheckCheck } from "lucide-react";
import { UserAvatar } from "./user-avatar";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import {
  applyMessageEvent,
  applyReadToEvent,
  mergeInitialHistory,
  type ChatMessage,
} from "./apply-message-event";
import {
  NEVER_EMITTED,
  TYPING_HOLD_MS,
  isTypingActive,
  shouldEmitTyping,
} from "./chat-typing-state";

type Message = ChatMessage;

interface User {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

interface Props {
  user: User;
  currentUserId: string;
  sidebarCollapsed: boolean;
  onClose: () => void;
}

// 100ms tick that re-evaluates the `typingUntil` window without triggering
// a re-render every frame.
const TYPING_TICK_MS = 100;

export function ChatWidget({ user, currentUserId, sidebarCollapsed, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [typingUntil, setTypingUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const lastTypingEmitRef = useRef<number>(NEVER_EMITTED);
  const lastReadCutoffRef = useRef<string>("");
  const minimizedRef = useRef<boolean>(minimized);
  const { subscribe, send } = useUserChannelEvents();

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    minimizedRef.current = minimized;
  }, [minimized]);

  useEffect(() => {
    setLoading(true);
    apiGet<{ data: Message[] }>(`/api/messages/${user.id}`)
      .then((json) => {
        const history = json.data || [];
        setMessages((prev) => mergeInitialHistory(history, prev));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user.id]);

  useEffect(() => {
    return subscribe("message:new", (event) => {
      setMessages((prev) => applyMessageEvent(prev, event.message, user.id));
    });
  }, [subscribe, user.id]);

  // OPT-359 — typing indicator. Filter to the open conversation's partner
  // so a typing event from a third-party DM doesn't leak into this widget.
  useEffect(() => {
    return subscribe("chat:typing_received", (event) => {
      if (event.fromUserId !== user.id) return;
      setTypingUntil((prev) =>
        prev === null || event.until > prev ? event.until : prev,
      );
    });
  }, [subscribe, user.id]);

  // OPT-359 — read receipts. Filter the same way: only events from the
  // open conversation's partner update *my own* messages' readAt.
  useEffect(() => {
    return subscribe("chat:read_to", (event) => {
      if (event.fromUserId !== user.id) return;
      setMessages((prev) =>
        applyReadToEvent(prev, currentUserId, event.throughCreatedAt),
      );
    });
  }, [subscribe, user.id, currentUserId]);

  // 100ms tick — re-evaluates whether `typingUntil` has passed. Only
  // mounted while a typing window is active so the widget stays idle when
  // nobody's typing.
  useEffect(() => {
    if (typingUntil === null) return;
    if (typingUntil <= Date.now()) {
      setTypingUntil(null);
      return;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, TYPING_TICK_MS);
    return () => clearInterval(timer);
  }, [typingUntil]);

  useEffect(() => {
    if (typingUntil !== null && typingUntil <= now) {
      setTypingUntil(null);
    }
  }, [now, typingUntil]);

  const markAsRead = useCallback(() => {
    const hasUnreadIncoming = messagesRef.current.some(
      (m) => m.fromUserId === user.id && m.readAt === null,
    );
    if (!hasUnreadIncoming) return;
    const cutoff = new Date().toISOString();
    if (cutoff <= lastReadCutoffRef.current) return;
    lastReadCutoffRef.current = cutoff;
    void apiPost<{ data: { updated: number } }>(
      `/api/messages/${user.id}/read`,
      { throughCreatedAt: cutoff },
    ).catch(() => {
      // Non-fatal — the next mount/restore call will retry the cutoff.
      lastReadCutoffRef.current = "";
    });
  }, [user.id]);

  const refreshMessages = useCallback(async () => {
    if (minimizedRef.current) return;
    const current = messagesRef.current;
    const lastMsg = current[current.length - 1];
    let after = lastMsg ? lastMsg.createdAt : new Date(0).toISOString();
    try {
      // The server caps each ?after page (OPT-375) and sets `more` when the
      // window overflowed; page forward from the last returned message. The
      // iteration cap bounds one reconciliation pass — anything beyond it
      // lands on the next visibility change.
      for (let page = 0; page < 5; page++) {
        const json = await apiGet<{ data: Message[]; more?: boolean }>(
          `/api/messages/${user.id}?after=${encodeURIComponent(after)}`,
        );
        if (json.data?.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = json.data.filter((m) => !seen.has(m.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
          after = json.data[json.data.length - 1].createdAt;
        }
        if (!json.more) break;
      }
    } catch {
      // Non-fatal — push remains authoritative; the next restore can retry.
    }
  }, [user.id]);

  // Mark-on-mount: fire after history loads if there are incoming messages.
  // Must happen post-load so we know whether there's anything to mark.
  useEffect(() => {
    if (loading || minimized) return;
    markAsRead();
  }, [loading, minimized, markAsRead]);

  // Mark-on-new-message: when a `message:new` lands while expanded, treat
  // the user's continued attention as a read signal.
  useEffect(() => {
    if (loading || minimized) return;
    if (messages.length === 0) return;
    markAsRead();
  }, [messages, loading, minimized, markAsRead]);

  useEffect(() => {
    if (loading) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void refreshMessages();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loading, refreshMessages]);

  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      inputRef.current?.focus();
    }
  }, [minimized, messages]);

  const send_ = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!body.trim() || sending) return;
      setSending(true);
      try {
        const json = await apiPost<{ data: Message }>(`/api/messages/${user.id}`, { body: body.trim() });
        setMessages((prev) => [...prev, json.data]);
        setBody("");
      } finally {
        setSending(false);
      }
    },
    [body, user.id, sending],
  );

  const handleBodyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBody(e.target.value);
      const nowMs = Date.now();
      if (!shouldEmitTyping(nowMs, lastTypingEmitRef.current)) return;
      lastTypingEmitRef.current = nowMs;
      send({
        type: "chat:typing",
        toUserId: user.id,
        until: nowMs + TYPING_HOLD_MS,
      });
    },
    [send, user.id],
  );

  const displayName = user.username || user.name;
  const showTyping = isTypingActive(typingUntil, now);

  return (
    <div
      className={cn(
        "fixed bottom-0 z-40 flex w-80 flex-col rounded-t-lg border border-b-0 border-border shadow-xl",
        sidebarCollapsed ? "right-10" : "right-64",
      )}
    >
      {/* Header */}
      <div
        className="flex cursor-pointer items-center gap-2 rounded-t-lg bg-navy-900 px-3 py-2"
        onClick={() => setMinimized((v) => !v)}
      >
        <UserAvatar user={user} size="sm" variant="dark" />
        <span className="flex-1 truncate text-sm font-semibold text-content-inverse">
          {displayName}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
          className="size-6 text-content-inverse/60 hover:text-content-inverse hover:bg-transparent"
          title={minimized ? "Expand" : "Minimize"}
        >
          {minimized ? <ChevronUp className="size-3" /> : <Minus className="size-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="size-6 text-content-inverse/60 hover:text-content-inverse hover:bg-transparent"
          title="Close"
        >
          <X className="size-3" />
        </Button>
      </div>

      {/* Body */}
      {!minimized && (
        <>
          {/* Messages */}
          <div className="h-80 overflow-y-auto bg-surface-1 px-3 py-3 space-y-2">
            {loading && (
              <p className="py-6 text-center text-xs text-content-tertiary">
                Loading...
              </p>
            )}
            {!loading && messages.length === 0 && (
              <p className="py-6 text-center text-xs text-content-tertiary">
                No messages yet. Say something!
              </p>
            )}
            {messages.map((msg) => {
              const isMe = msg.fromUserId === currentUserId;
              return (
                <div
                  key={msg.id}
                  className={cn("flex", isMe ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-lg px-3 py-2 text-xs",
                      isMe
                        ? "bg-navy-900 text-content-inverse"
                        : "bg-surface-2 text-content-primary",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                    {isMe && (
                      <div
                        className="mt-1 flex justify-end text-content-inverse/60"
                        aria-label={msg.readAt ? "Read" : "Sent"}
                      >
                        {msg.readAt ? (
                          <CheckCheck className="size-3" />
                        ) : (
                          <Check className="size-3" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {showTyping && (
            <div className="px-3 py-1 text-xs italic text-content-tertiary">
              {displayName} is typing…
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={send_}
            className="flex gap-2 border-t border-border bg-surface-1 px-3 py-2"
          >
            <Input
              ref={inputRef}
              type="text"
              value={body}
              onChange={handleBodyChange}
              placeholder={`Message ${displayName}...`}
              className="h-8 flex-1 bg-surface-2 text-xs"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!body.trim() || sending}
            >
              Send
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
