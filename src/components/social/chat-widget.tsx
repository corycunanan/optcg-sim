"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Minus, ChevronUp } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/messages/${user.id}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user.id]);

  useEffect(() => {
    if (loading) return;
    const interval = setInterval(async () => {
      if (minimized) return;
      const current = messagesRef.current;
      const lastMsg = current[current.length - 1];
      const after = lastMsg ? lastMsg.createdAt : new Date(0).toISOString();
      try {
        const res = await fetch(`/api/messages/${user.id}?after=${encodeURIComponent(after)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.data?.length > 0) {
          setMessages((prev) => [...prev, ...data.data]);
        }
      } catch {
        // ignore poll errors silently
      }
    }, 5_000);
    return () => clearInterval(interval);
  }, [user.id, loading, minimized]);

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
          const json = await res.json();
          setMessages((prev) => [...prev, json.data]);
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
            <Input
              ref={inputRef}
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
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
