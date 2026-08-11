"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import type { SidebarUser } from "./social-sidebar";

const SocialSidebar = dynamic(
  () => import("./social-sidebar").then((mod) => mod.SocialSidebar),
  { ssr: false }
);
const ChatWidget = dynamic(
  () => import("./chat-widget").then((mod) => mod.ChatWidget),
  { ssr: false }
);
const LobbyInviteToasts = dynamic(
  () =>
    import("@/components/lobbies/lobby-invite-toast").then(
      (mod) => mod.LobbyInviteToasts
    ),
  { ssr: false }
);

export function SocialShell() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isGame = pathname.startsWith("/game/");
  const [chatUser, setChatUser] = useState<SidebarUser | null>(null);

  if (!session?.user) return null;

  return (
    <>
      {/* Lobby invite toasts surface even on /game/* — a friend inviting you
          while you're mid-game is a valid (if rare) flow, and the toast is
          non-blocking. */}
      <LobbyInviteToasts />
      {!isGame && (
        <>
          {/* In-flow spacer reserving the fixed rail's column. Both read
              --social-rail-width, so they cannot drift apart. */}
          <div className="w-social-rail shrink-0" aria-hidden="true" />
          <SocialSidebar onOpenChat={setChatUser} />
          {chatUser && (
            <ChatWidget
              user={chatUser}
              currentUserId={session.user.id}
              sidebarCollapsed={false}
              onClose={() => setChatUser(null)}
            />
          )}
        </>
      )}
    </>
  );
}
