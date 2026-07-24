"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DeckNavigationGuardLink } from "@/components/deck-builder/deck-navigation-guard";
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
    "font-nav bg-transparent text-base text-content-primary hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse focus-visible:ring-2 focus-visible:ring-border-focus data-popup-open:bg-surface-2 data-popup-open:text-content-inverse data-open:bg-surface-2 data-open:text-content-inverse data-[active]:text-accent";
  const activeTriggerStyles =
    "text-accent hover:text-gold-400 focus:text-gold-400";

  const linkStyles =
    "font-nav rounded-md px-3 py-2 text-base text-content-primary hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse focus-visible:ring-2 focus-visible:ring-border-focus";

  return (
    <nav className="bg-surface-nav border-border sticky top-0 z-40 flex h-16 shrink-0 items-center border-b px-6">
      <NavigationMenu viewport={false} className="flex-none">
        <NavigationMenuList className="gap-1">
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

      <div
        data-slot="navbar-actions"
        className="ml-auto flex items-center gap-2"
      />
    </nav>
  );
}
