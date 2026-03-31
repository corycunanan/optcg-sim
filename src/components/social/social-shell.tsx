"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SocialSidebar, type SidebarUser } from "./social-sidebar";
import { ChatWidget } from "./chat-widget";

export function SocialShell() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const isGame = pathname.startsWith("/game/");
  const [chatUser, setChatUser] = useState<SidebarUser | null>(null);

  if (!session?.user) return null;
  if (isGame) return null;

  return (
    <SidebarProvider>
      <SocialSidebar onOpenChat={setChatUser} />
      {chatUser && (
        <ChatWidget
          user={chatUser}
          currentUserId={session.user.id}
          sidebarCollapsed={false}
          onClose={() => setChatUser(null)}
        />
      )}
    </SidebarProvider>
  );
}
