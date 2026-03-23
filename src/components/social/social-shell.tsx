"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { SocialSidebar, type SidebarUser } from "./social-sidebar";
import { ChatWidget } from "./chat-widget";

export function SocialShell() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isGame = pathname.startsWith("/game/");
  const [collapsed, setCollapsed] = useState(isGame);
  const [chatUser, setChatUser] = useState<SidebarUser | null>(null);

  useEffect(() => {
    if (isGame) setCollapsed(true);
  }, [isGame]);

  if (!session?.user) return null;

  return (
    <>
      <SocialSidebar
        collapsed={collapsed}
        onCollapse={setCollapsed}
        onOpenChat={setChatUser}
        hideNav={isGame}
      />
      {chatUser && (
        <ChatWidget
          user={chatUser}
          currentUserId={session.user.id}
          sidebarCollapsed={collapsed}
          onClose={() => setChatUser(null)}
        />
      )}
    </>
  );
}
