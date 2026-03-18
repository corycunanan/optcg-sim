"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/components/ui/cn";
import { UserAvatar } from "./user-avatar";

interface User {
  id: string;
  username: string | null;
  name: string | null;
  image: string | null;
}

interface Message {
  id: string;
  body: string;
  createdAt: string;
  fromUserId: string;
}

interface Props {
  user: User;
  currentUserId: string;
  sidebarCollapsed: boolean;
  onClose: () => void;
}

export function ChatWidget({ user, currentUserId, sidebarCollapsed, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/messages/${user.id}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.data || []));
  }, [user.id]);

  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      inputRef.current?.focus();
    }
  }, [minimized, messages]);

  const send = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!body.trim() || sending) return;
      setSending(true);
      try {
        const res = await fetch(`/api/messages/${user.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: body.trim() }),
        });
        if (res.ok) {
          const msg = await res.json();
          setMessages((prev) => [...prev, msg]);
          setBody("");
        }
      } finally {
        setSending(false);
      }
    },
    [body, user.id, sending],
  );

  const displayName = user.username || user.name;

  return (
    <div
      className={cn(
        "fixed bottom-0 z-40 flex w-80 flex-col rounded-t-lg border border-b-0 border-border shadow-xl",
        sidebarCollapsed ? "right-10" : "right-64",
      )}
    >
      {/* Header — click to minimize/restore */}
      <div
        className="flex cursor-pointer items-center gap-2 rounded-t-lg bg-navy-900 px-3 py-2"
        onClick={() => setMinimized((v) => !v)}
      >
        <UserAvatar user={user} size="sm" variant="dark" />
        <span className="flex-1 truncate text-sm font-semibold text-content-inverse">
          {displayName}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}
          className="rounded px-1 text-xs text-content-inverse/60 transition-colors hover:text-content-inverse"
          title={minimized ? "Expand" : "Minimize"}
        >
          {minimized ? "▲" : "▼"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="rounded px-1 text-xs text-content-inverse/60 transition-colors hover:text-content-inverse"
          title="Close"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      {!minimized && (
        <>
          {/* Messages */}
          <div className="h-80 overflow-y-auto bg-surface-1 px-3 py-3 space-y-2">
            {messages.length === 0 && (
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
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={send}
            className="flex gap-2 border-t border-border bg-surface-1 px-3 py-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Message ${displayName}…`}
              className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-content-primary placeholder:text-content-tertiary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!body.trim() || sending}
              className="rounded-md bg-navy-900 px-3 py-2 text-xs font-semibold text-content-inverse transition-colors hover:bg-navy-800 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
