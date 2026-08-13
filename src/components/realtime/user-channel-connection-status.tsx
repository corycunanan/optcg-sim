"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import type { ConnectionStatus } from "@/types/realtime";

export const RECONNECTING_STATUS_DELAY_MS = 3_000;

interface UserChannelConnectionStatusProps {
  connectionStatus: ConnectionStatus;
}

export function UserChannelConnectionStatus({
  connectionStatus,
}: UserChannelConnectionStatusProps) {
  if (connectionStatus !== "disconnected") return null;

  return <DelayedReconnectingStatus />;
}

export function DelayedReconnectingStatus() {
  const [showReconnecting, setShowReconnecting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowReconnecting(true);
    }, RECONNECTING_STATUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!showReconnecting) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-gold-500/40 bg-gold-500/10 px-2 py-2 text-sm font-medium text-sidebar-foreground"
    >
      <WifiOff className="size-4 shrink-0 text-gold-500" aria-hidden="true" />
      <span className="truncate">Reconnecting...</span>
    </div>
  );
}
