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

export function SocialShell() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isGame = pathname.startsWith("/game/");
  const [chatUser, setChatUser] = useState<SidebarUser | null>(null);

  if (!session?.user) return null;
  if (isGame) return null;

  return (
    <>
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
  );
}
