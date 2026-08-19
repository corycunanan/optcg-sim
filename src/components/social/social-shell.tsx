"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSidebar } from "@/components/ui/sidebar";
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
  const { isMobile, setOpenMobile } = useSidebar();
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
              --social-rail-width, so they cannot drift apart.

              `hidden md:block` (OPT-663): below `md` the rail is a drawer over
              the page, not a column beside it, so an unconditional 280px
              spacer left ~110px of a 390px viewport for the page itself. The
              split is CSS, not JS, so it is right on the first paint. */}
          <div
            data-slot="social-rail-spacer"
            className="w-social-rail hidden shrink-0 md:block"
            aria-hidden="true"
          />
          <SocialSidebar
            onOpenChat={(user) => {
              // The chat widget docks under the drawer's scrim, so a chat
              // opened from the drawer would be invisible. Closing is a no-op
              // at md and above, where the drawer never opens.
              setOpenMobile(false);
              setChatUser(user);
            }}
          />
          {chatUser && (
            <ChatWidget
              user={chatUser}
              currentUserId={session.user.id}
              sidebarCollapsed={isMobile}
              onClose={() => setChatUser(null)}
            />
          )}
        </>
      )}
    </>
  );
}
