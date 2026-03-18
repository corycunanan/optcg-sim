"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { SocialSidebar, type SidebarUser } from "./social-sidebar";
import { ChatWidget } from "./chat-widget";

export function SocialShell() {
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [chatUser, setChatUser] = useState<SidebarUser | null>(null);

  if (!session?.user) return null;

  return (
    <>
      <SocialSidebar
        collapsed={collapsed}
        onCollapse={setCollapsed}
        onOpenChat={setChatUser}
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
