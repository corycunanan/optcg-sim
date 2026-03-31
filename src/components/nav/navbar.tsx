"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
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

  if (!session?.user) return null;
  if (pathname.startsWith("/game/")) return null;

  const cardsActive =
    pathname.startsWith("/admin/cards") || pathname.startsWith("/admin/sets");
  const decksActive = pathname.startsWith("/decks");
  const playActive =
    pathname.startsWith("/lobbies") || pathname.startsWith("/game");

  const triggerStyles =
    "bg-transparent text-content-inverse/70 hover:bg-white/10 hover:text-content-inverse focus:bg-white/10 focus:text-content-inverse data-popup-open:bg-white/10 data-popup-open:text-content-inverse data-popup-open:hover:bg-white/15 data-open:bg-white/10 data-open:text-content-inverse data-open:hover:bg-white/15";
  const activeTriggerStyles =
    "bg-white/10 text-content-inverse hover:bg-white/15";

  const linkStyles =
    "text-sm font-medium hover:bg-accent/10 focus:bg-accent/10 rounded-md px-3 py-2";

  return (
    <nav className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-8 border-b border-black/20 bg-surface-nav px-6">
      {/* Logo */}
      <Link
        href="/"
        className="shrink-0 font-display text-lg font-bold tracking-tight text-content-inverse"
      >
        OPTCG
      </Link>

      {/* Nav links */}
      <NavigationMenu viewport={false}>
        <NavigationMenuList className="gap-1">
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/"
                className={cn(
                  navigationMenuTriggerStyle(),
                  triggerStyles,
                  pathname === "/" && activeTriggerStyles,
                )}
              >
                Home
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuTrigger
              className={cn(
                triggerStyles,
                cardsActive && activeTriggerStyles,
              )}
            >
              Cards
            </NavigationMenuTrigger>
            <NavigationMenuContent className="bg-surface-nav border border-white/10">
              <ul className="flex w-48 flex-col gap-1 p-1">
                <li>
                  <NavigationMenuLink asChild>
                    <Link href="/admin/cards" className={linkStyles}>
                      All Cards
                    </Link>
                  </NavigationMenuLink>
                </li>
                <li>
                  <NavigationMenuLink asChild>
                    <Link href="/admin/sets" className={linkStyles}>
                      Sets
                    </Link>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/lobbies"
                className={cn(
                  navigationMenuTriggerStyle(),
                  triggerStyles,
                  playActive && activeTriggerStyles,
                )}
              >
                Play
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>

          <NavigationMenuItem>
            <NavigationMenuTrigger
              className={cn(
                triggerStyles,
                decksActive && activeTriggerStyles,
              )}
            >
              Decks
            </NavigationMenuTrigger>
            <NavigationMenuContent className="bg-surface-nav border border-white/10">
              <ul className="flex w-48 flex-col gap-1 p-1">
                <li>
                  <NavigationMenuLink asChild>
                    <Link href="/decks" className={linkStyles}>
                      My Decks
                    </Link>
                  </NavigationMenuLink>
                </li>
                <li>
                  <NavigationMenuLink asChild>
                    <Link href="/decks/new" className={linkStyles}>
                      + New Deck
                    </Link>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
  );
}
