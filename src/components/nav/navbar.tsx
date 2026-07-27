"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DeckNavigationGuardLink } from "@/components/deck-builder/deck-navigation-guard";
import { useUserChannelEvents } from "@/components/realtime/user-channel-provider";
import { NavbarAccountMenu } from "@/components/nav/navbar-account-menu";
import { NavbarNotificationBell } from "@/components/nav/navbar-notification-bell";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();

  if (pathname.startsWith("/game/")) return null;

  const isRouteWithin = (route: string) =>
    pathname === route || pathname.startsWith(`${route}/`);
  const cardsActive =
    isRouteWithin("/cards") ||
    isRouteWithin("/sets") ||
    isRouteWithin("/admin/cards") ||
    isRouteWithin("/admin/sets");
  const decksActive = isRouteWithin("/decks");
  const playActive = isRouteWithin("/lobbies") || isRouteWithin("/game");

  const triggerStyles =
    "font-nav bg-transparent px-2 text-base text-content-primary hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse focus-visible:ring-2 focus-visible:ring-border-focus data-popup-open:bg-surface-2 data-popup-open:text-content-inverse data-open:bg-surface-2 data-open:text-content-inverse data-[active]:text-accent sm:px-3";
  const activeTriggerStyles =
    "text-accent hover:text-gold-400 focus:text-gold-400";
  const playTriggerStyles =
    "bg-gold-500 text-navy-900 hover:bg-gold-400 hover:text-navy-900 focus:bg-gold-400 focus:text-navy-900";

  const linkStyles =
    "font-nav rounded-md px-2 py-2 text-base text-content-primary hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse focus-visible:ring-2 focus-visible:ring-border-focus sm:px-3";

  return (
    <nav className="bg-surface-nav border-border sticky top-0 z-40 flex h-16 shrink-0 items-center border-b px-2 sm:px-6">
      <NavigationMenu
        viewport={false}
        className="max-w-none min-w-0 flex-1 justify-start overflow-x-auto"
      >
        <NavigationMenuList className="gap-1">
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <DeckNavigationGuardLink
                href="/lobbies"
                aria-current={playActive ? "page" : undefined}
                className={cn(
                  navigationMenuTriggerStyle(),
                  triggerStyles,
                  playTriggerStyles
                )}
              >
                Play
              </DeckNavigationGuardLink>
            </NavigationMenuLink>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <DeckNavigationGuardLink
                href="/"
                aria-current={pathname === "/" ? "page" : undefined}
                className={cn(
                  navigationMenuTriggerStyle(),
                  triggerStyles,
                  pathname === "/" && activeTriggerStyles
                )}
              >
                Home
              </DeckNavigationGuardLink>
            </NavigationMenuLink>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuTrigger
              data-active={cardsActive || undefined}
              className={cn(triggerStyles, cardsActive && activeTriggerStyles)}
            >
              Cards
            </NavigationMenuTrigger>
            <NavigationMenuContent className="border-border bg-popover border ring-0">
              <ul className="flex w-48 flex-col gap-1 p-1">
                <li>
                  <NavigationMenuLink asChild>
                    <DeckNavigationGuardLink
                      href="/cards"
                      className={linkStyles}
                    >
                      All Cards
                    </DeckNavigationGuardLink>
                  </NavigationMenuLink>
                </li>
                <li>
                  <NavigationMenuLink asChild>
                    <DeckNavigationGuardLink
                      href="/sets"
                      className={linkStyles}
                    >
                      Sets
                    </DeckNavigationGuardLink>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuTrigger
              data-active={decksActive || undefined}
              className={cn(triggerStyles, decksActive && activeTriggerStyles)}
            >
              Decks
            </NavigationMenuTrigger>
            <NavigationMenuContent className="border-border bg-popover border ring-0">
              <ul className="flex w-48 flex-col gap-1 p-1">
                <li>
                  <NavigationMenuLink asChild>
                    <DeckNavigationGuardLink
                      href="/decks"
                      className={linkStyles}
                    >
                      My Decks
                    </DeckNavigationGuardLink>
                  </NavigationMenuLink>
                </li>
                <li>
                  <NavigationMenuLink asChild>
                    <DeckNavigationGuardLink
                      href="/decks/new"
                      className={linkStyles}
                    >
                      + New Deck
                    </DeckNavigationGuardLink>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>

      {sessionStatus === "authenticated" && session?.user && (
        <NavbarActions user={session.user} />
      )}
    </nav>
  );
}

function NavbarActions({
  user,
}: {
  user: NonNullable<ReturnType<typeof useSession>["data"]>["user"];
}) {
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const { notificationInbox } = useUserChannelEvents();

  return (
    <div
      data-slot="navbar-actions"
      className="ml-2 flex shrink-0 items-center gap-2"
    >
      <NavbarNotificationBell
        unreadCount={notificationInbox.unreadCount}
        open={notificationPanelOpen}
        onOpenChange={setNotificationPanelOpen}
      />
      <NavbarAccountMenu user={user} theme={user.theme} />
    </div>
  );
}
