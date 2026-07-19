"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { X, Minus, ChevronUp, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
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
import {
  MessageHistoryResponseSchema,
  SendMessageResponseSchema,
} from "@/lib/validators/messages";

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

export function ChatWidget({
  user,
  currentUserId,
  sidebarCollapsed,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);
  const [typingUntil, setTypingUntil] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const activeSendRef = useRef<symbol | null>(null);
  const pendingSendRef = useRef<{
    body: string;
    idempotencyKey: string;
    hadAmbiguousFailure: boolean;
  } | null>(null);
  const historyRequestRef = useRef<symbol | null>(null);
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
    setMessages([]);
    messagesRef.current = [];
    setBody("");
    setSending(false);
    activeSendRef.current = null;
    pendingSendRef.current = null;
    historyRequestRef.current = null;
    setTypingUntil(null);
    lastTypingEmitRef.current = NEVER_EMITTED;
    lastReadCutoffRef.current = "";
    return () => {
      activeSendRef.current = null;
      historyRequestRef.current = null;
    };
  }, [user.id]);

  const loadHistory = useCallback(() => {
    const request = Symbol("history-request");
    historyRequestRef.current = request;
    setLoading(true);
    setHistoryLoadFailed(false);
    void apiGet(`/api/messages/${user.id}`, MessageHistoryResponseSchema)
      .then((json) => {
        if (historyRequestRef.current !== request) return;
        const history = json.data || [];
        setMessages((prev) => mergeInitialHistory(history, prev));
      })
      .catch(() => {
        if (historyRequestRef.current !== request) return;
        setHistoryLoadFailed(true);
      })
      .finally(() => {
        if (historyRequestRef.current === request) {
          setLoading(false);
        }
      });
  }, [user.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

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
        prev === null || event.until > prev ? event.until : prev
      );
    });
  }, [subscribe, user.id]);

  // OPT-359 — read receipts. Filter the same way: only events from the
  // open conversation's partner update *my own* messages' readAt.
  useEffect(() => {
    return subscribe("chat:read_to", (event) => {
      if (event.fromUserId !== user.id) return;
      setMessages((prev) =>
        applyReadToEvent(prev, currentUserId, event.throughCreatedAt)
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
      (m) => m.fromUserId === user.id && m.readAt === null
    );
    if (!hasUnreadIncoming) return;
    const cutoff = new Date().toISOString();
    if (cutoff <= lastReadCutoffRef.current) return;
    lastReadCutoffRef.current = cutoff;
    void apiPost(`/api/messages/${user.id}/read`, {
      throughCreatedAt: cutoff,
    }).catch(() => {
      // Non-fatal — the next mount/restore call will retry the cutoff.
      lastReadCutoffRef.current = "";
    });
  }, [user.id]);

  const refreshMessages = useCallback(async () => {
    if (minimizedRef.current) return;
    const current = messagesRef.current;
    const lastMsg = current[current.length - 1];
    let after = lastMsg ? lastMsg.createdAt : new Date(0).toISOString();
    let afterId = lastMsg?.id ?? "";
    try {
      // The server caps each ?after page (OPT-375) and sets `more` when the
      // window overflowed; page forward from the last returned message using
      // the composite (createdAt, id) cursor so createdAt ties at the page
      // boundary can't be skipped or re-served. The iteration cap bounds one
      // reconciliation pass — anything beyond it lands on the next
      // visibility change.
      for (let page = 0; page < 5; page++) {
        const cursor =
          `after=${encodeURIComponent(after)}` +
          (afterId ? `&afterId=${encodeURIComponent(afterId)}` : "");
        const json = await apiGet(
          `/api/messages/${user.id}?${cursor}`,
          MessageHistoryResponseSchema
        );
        if (json.data?.length > 0) {
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = json.data.filter((m) => !seen.has(m.id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
          const last = json.data[json.data.length - 1];
          after = last.createdAt;
          afterId = last.id;
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
      const messageBody = body.trim();
      if (!messageBody || activeSendRef.current !== null) return;
      const pendingSend =
        pendingSendRef.current?.body === messageBody
          ? pendingSendRef.current
          : {
              body: messageBody,
              idempotencyKey: crypto.randomUUID(),
              hadAmbiguousFailure: false,
            };
      pendingSendRef.current = pendingSend;
      const request = Symbol("send-request");
      activeSendRef.current = request;
      setSending(true);
      try {
        const json = await apiPost(
          `/api/messages/${user.id}`,
          {
            body: messageBody,
            idempotencyKey: pendingSend.idempotencyKey,
          },
          SendMessageResponseSchema
        );
        if (activeSendRef.current !== request) return;
        setMessages((prev) =>
          prev.some((message) => message.id === json.data.id)
            ? prev
            : [...prev, json.data]
        );
        pendingSendRef.current = null;
        setBody("");
      } catch (error) {
        if (activeSendRef.current !== request) return;
        const confirmedNonPersistedFailure =
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500;
        // Once any attempt is ambiguous, a later 4xx cannot prove that the
        // earlier request did not persist. Keep its key until success so a
        // late commit and the eventual retry deduplicate at the database.
        if (confirmedNonPersistedFailure && !pendingSend.hadAmbiguousFailure) {
          pendingSendRef.current = null;
        } else if (!confirmedNonPersistedFailure) {
          pendingSend.hadAmbiguousFailure = true;
        }
        toast.error("Message couldn't be sent. Try again.");
      } finally {
        if (activeSendRef.current === request) {
          activeSendRef.current = null;
          setSending(false);
        }
      }
    },
    [body, user.id]
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
    [send, user.id]
  );

  const displayName = user.username || user.name;
  const showTyping = isTypingActive(typingUntil, now);

  return (
    <div
      className={cn(
        "border-border fixed bottom-0 z-40 flex w-80 flex-col rounded-t-lg border border-b-0 shadow-xl",
        sidebarCollapsed ? "right-10" : "right-16"
      )}
    >
      {/* Header */}
      <div
        className="bg-surface-nav flex cursor-pointer items-center gap-2 rounded-t-lg px-3 py-2"
        onClick={() => setMinimized((v) => !v)}
      >
        <UserAvatar user={user} size="sm" variant="dark" />
        <span className="text-content-inverse flex-1 truncate text-sm font-semibold">
          {displayName}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            setMinimized((v) => !v);
          }}
          className="text-content-inverse/60 hover:text-content-inverse size-6 hover:bg-transparent"
          title={minimized ? "Expand" : "Minimize"}
        >
          {minimized ? (
            <ChevronUp className="size-3" />
          ) : (
            <Minus className="size-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="text-content-inverse/60 hover:text-content-inverse size-6 hover:bg-transparent"
          title="Close"
        >
          <X className="size-3" />
        </Button>
      </div>

      {/* Body */}
      {!minimized && (
        <>
          {/* Messages */}
          <div className="bg-card h-80 space-y-2 overflow-y-auto px-3 py-3">
            {loading && (
              <p
                className="text-content-tertiary py-6 text-center text-xs"
                role="status"
              >
                Loading messages…
              </p>
            )}
            {!loading && historyLoadFailed && (
              <div
                className="flex flex-col items-center gap-3 py-6 text-center"
                role="alert"
              >
                <p className="text-content-tertiary text-xs">
                  Couldn&apos;t load messages.
                </p>
                <Button type="button" size="sm" onClick={loadHistory}>
                  Try again
                </Button>
              </div>
            )}
            {!loading && !historyLoadFailed && messages.length === 0 && (
              <p
                className="text-content-tertiary py-6 text-center text-xs"
                role="status"
              >
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
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-content-primary"
                    )}
                  >
                    <p className="break-words whitespace-pre-wrap">
                      {msg.body}
                    </p>
                    {isMe && (
                      <div
                        className="text-primary-foreground/60 mt-1 flex justify-end"
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
            <div className="text-content-tertiary px-3 py-1 text-xs italic">
              {displayName} is typing…
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={send_}
            className="border-border bg-card flex gap-2 border-t px-3 py-2"
          >
            <Input
              ref={inputRef}
              type="text"
              value={body}
              onChange={handleBodyChange}
              disabled={sending}
              placeholder={`Message ${displayName}...`}
              className="bg-secondary h-8 flex-1 text-xs"
            />
            <Button type="submit" size="sm" disabled={!body.trim() || sending}>
              Send
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
