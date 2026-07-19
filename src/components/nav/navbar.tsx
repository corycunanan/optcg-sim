"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
  const { data: session } = useSession();
  const pathname = usePathname();

  if (pathname.startsWith("/game/")) return null;

  const cardsActive =
    pathname.startsWith("/cards") ||
    pathname.startsWith("/sets") ||
    pathname.startsWith("/admin/cards") ||
    pathname.startsWith("/admin/sets");
  const decksActive = pathname.startsWith("/decks");
  const playActive =
    pathname.startsWith("/lobbies") || pathname.startsWith("/game");
  const sandboxActive = pathname.startsWith("/sandbox");

  const triggerStyles =
    "bg-transparent text-content-inverse/70 hover:bg-white/10 hover:text-content-inverse focus:bg-white/10 focus:text-content-inverse data-popup-open:bg-white/10 data-popup-open:text-content-inverse data-popup-open:hover:bg-white/15 data-open:bg-white/10 data-open:text-content-inverse data-open:hover:bg-white/15";
  const activeTriggerStyles =
    "bg-white/10 text-content-inverse hover:bg-white/15";

  const linkStyles =
    "text-sm font-medium hover:bg-accent/10 focus:bg-accent/10 rounded-md px-3 py-2";

  return (
    <nav className="bg-surface-nav sticky top-0 z-40 flex h-16 shrink-0 items-center gap-8 border-b border-black/20 px-6">
      {/* Logo */}
      <DeckNavigationGuardLink
        href="/"
        className="font-display text-content-inverse shrink-0 text-lg font-bold tracking-tight"
      >
        OPTCG
      </DeckNavigationGuardLink>

      {/* Nav links */}
      <NavigationMenu viewport={false}>
        <NavigationMenuList className="gap-1">
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <DeckNavigationGuardLink
                href="/"
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
              className={cn(triggerStyles, cardsActive && activeTriggerStyles)}
            >
              Cards
            </NavigationMenuTrigger>
            <NavigationMenuContent className="bg-surface-nav border border-white/10">
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

          {session?.user && (
            <>
              <NavigationMenuItem>
                <NavigationMenuLink asChild>
                  <DeckNavigationGuardLink
                    href="/lobbies"
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
                <NavigationMenuLink asChild>
                  <DeckNavigationGuardLink
                    href="/sandbox"
                    className={cn(
                      navigationMenuTriggerStyle(),
                      triggerStyles,
                      sandboxActive && activeTriggerStyles
                    )}
                  >
                    Sandbox
                  </DeckNavigationGuardLink>
                </NavigationMenuLink>
              </NavigationMenuItem>

              <NavigationMenuItem>
                <NavigationMenuTrigger
                  className={cn(
                    triggerStyles,
                    decksActive && activeTriggerStyles
                  )}
                >
                  Decks
                </NavigationMenuTrigger>
                <NavigationMenuContent className="bg-surface-nav border border-white/10">
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
            </>
          )}
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  );
}
