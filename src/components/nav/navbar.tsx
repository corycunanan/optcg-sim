"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DeckNavigationGuardLink } from "@/components/deck-builder/deck-navigation-guard";
import { NavbarAccountMenu } from "@/components/nav/navbar-account-menu";
import { NavbarNotificationPanel } from "@/components/nav/navbar-notification-panel";
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
  const [activeMenu, setActiveMenu] = useState("");
  // Radix keeps painting the viewport through its exit animation after the
  // value clears, so the just-closed trigger has to stay the CSS anchor or the
  // closing panel snaps to the nav's left edge mid-fade.
  const [lastMenu, setLastMenu] = useState("");

  if (pathname.startsWith("/game/")) return null;

  const handleMenuChange = (value: string) => {
    setActiveMenu(value);
    if (value) setLastMenu(value);
  };

  // Exactly one trigger may carry `anchor-name`: the open menu wins, and the
  // previous one is only used once nothing is open.
  const anchoredMenu = activeMenu || lastMenu;

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
    "font-nav relative bg-transparent px-2 text-base text-content-primary hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse focus-visible:ring-2 focus-visible:ring-border-focus data-popup-open:bg-surface-2 data-popup-open:text-content-inverse data-open:bg-surface-2 data-open:text-content-inverse sm:px-3";
  const activeTriggerStyles =
    "bg-surface-2 text-gold-600 hover:text-gold-600 focus:text-gold-600 data-popup-open:text-gold-600 data-open:text-gold-600";

  const linkStyles =
    "font-nav rounded-md px-2 py-2 text-base text-content-primary hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse focus-visible:ring-2 focus-visible:ring-border-focus sm:px-3";

  return (
    <nav className="bg-surface-nav border-border-accent sticky top-0 z-40 h-16 shrink-0 border-b">
      <div
        data-slot="navbar-content"
        className="mx-auto flex h-full w-full max-w-7xl items-center px-2 sm:px-6"
      >
        <NavigationMenu
          value={activeMenu}
          onValueChange={handleMenuChange}
          className="max-w-none min-w-0 flex-1 justify-start"
        >
          <div
            data-slot="navbar-links-scroller"
            className="min-w-0 flex-1 overflow-x-auto"
          >
            <NavigationMenuList className="w-max justify-start gap-1">
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
                <NavigationMenuLink asChild>
                  <DeckNavigationGuardLink
                    href="/lobbies"
                    aria-current={playActive ? "page" : undefined}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      triggerStyles,
                      playActive && activeTriggerStyles
                    )}
                  >
                    Play
                  </DeckNavigationGuardLink>
                </NavigationMenuLink>
              </NavigationMenuItem>

              <NavigationMenuItem value="decks">
                <NavigationMenuTrigger
                  data-active={decksActive || undefined}
                  aria-current={decksActive ? "page" : undefined}
                  className={cn(
                    triggerStyles,
                    decksActive && activeTriggerStyles,
                    anchoredMenu === "decks" && "navbar-dropdown-anchor"
                  )}
                >
                  Decks
                </NavigationMenuTrigger>
                <NavigationMenuContent>
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

              <NavigationMenuItem value="cards">
                <NavigationMenuTrigger
                  data-active={cardsActive || undefined}
                  aria-current={cardsActive ? "page" : undefined}
                  className={cn(
                    triggerStyles,
                    cardsActive && activeTriggerStyles,
                    anchoredMenu === "cards" && "navbar-dropdown-anchor"
                  )}
                >
                  Cards
                </NavigationMenuTrigger>
                <NavigationMenuContent>
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
            </NavigationMenuList>
          </div>
        </NavigationMenu>

        {sessionStatus !== "unauthenticated" && (
          <div
            data-slot="navbar-actions"
            data-state={sessionStatus === "loading" ? "loading" : "ready"}
            aria-hidden={sessionStatus === "loading" || undefined}
            className="min-w-navbar-actions ml-2 flex h-10 shrink-0 items-center justify-end gap-2"
          >
            {sessionStatus === "authenticated" && session?.user && (
              <NavbarActions user={session.user} />
            )}
          </div>
        )}
      </div>
    </nav>
  );
}

function NavbarActions({
  user,
}: {
  user: NonNullable<ReturnType<typeof useSession>["data"]>["user"];
}) {
  return (
    <>
      <NavbarNotificationPanel />
      <NavbarAccountMenu user={user} theme={user.theme} />
    </>
  );
}
