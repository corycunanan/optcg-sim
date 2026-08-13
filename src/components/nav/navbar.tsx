"use client";

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
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();

  if (pathname.startsWith("/game/")) return null;

  const isRouteWithin = (route: string) =>
    pathname === route || pathname.startsWith(`${route}/`);

  // Four plain links, no menus (OPT-680). The destinations the dropdowns used
  // to list are reached from the pages themselves — /decks/new from the deck
  // list, /sets from the card browser — but they still light the section they
  // belong to, so an active route never leaves the nav with nothing marked.
  const navLinks = [
    { href: "/", label: "Home", isActive: pathname === "/" },
    {
      href: "/lobbies",
      label: "Play",
      isActive: isRouteWithin("/lobbies") || isRouteWithin("/game"),
    },
    { href: "/decks", label: "Decks", isActive: isRouteWithin("/decks") },
    {
      href: "/cards",
      label: "Cards",
      isActive:
        isRouteWithin("/cards") ||
        isRouteWithin("/sets") ||
        isRouteWithin("/admin/cards") ||
        isRouteWithin("/admin/sets"),
    },
  ];

  // OPT-681: a nav link is a full-height section of the bar, not a pill riding
  // inside it. `h-full` — not a literal `h-navbar` — keeps the block inside the
  // nav's border box, so the gold bottom rule stays unbroken beneath it.
  // `rounded-none` squares it off: a block that meets both edges of the bar has
  // no free corner left to round, and the 2px chrome radius applied to the two
  // corners that remain would read as a rendering artifact rather than intent.
  //
  // The geometry is overridden here rather than in the shared
  // `navigationMenuTriggerStyle()` because the account-menu trigger renders
  // through that same style and must stay a compact control in the actions
  // cluster.
  //
  // Focus: the shared style's inset outline (`focus-visible:outline-2
  // -outline-offset-2 outline-border-focus`) is the navbar's standardized
  // indicator and draws inside the block, so it survives at full height without
  // a ring layered on top of it. Nothing here sets `outline-none` — in Tailwind
  // v4 that sets `--tw-outline-style: none` and would defeat the indicator.
  const navLinkStyles =
    "font-nav flex h-full items-center justify-center rounded-none bg-transparent px-3 py-0 text-base text-content-primary hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse sm:px-4";
  const activeNavLinkStyles =
    "bg-surface-2 text-gold-600 hover:text-gold-600 focus:text-gold-600";

  return (
    // The bar itself is edge to edge (OPT-649) and sits above the friends
    // rail. Its content spans the full viewport too — links on the left edge,
    // account actions pinned to the right edge, above the rail — so the
    // actions cluster never reserves the rail's column the way page content
    // does.
    <nav className="bg-surface-nav border-border-accent h-navbar sticky top-0 z-40 shrink-0 border-b">
      <div
        data-slot="navbar-content"
        className="flex h-full w-full items-center px-2 sm:px-6"
      >
        {/* `viewport={false}`: with the menus gone there is no panel left for
            Radix to measure, position, or animate — only the link row. */}
        <NavigationMenu
          viewport={false}
          className="h-full max-w-none min-w-0 flex-1 justify-start"
        >
          <div
            data-slot="navbar-links-scroller"
            // The height chain from the nav down to each link has to be
            // unbroken, or the sections stop short of the bar's edges.
            // `[&>div]:h-full` is the one link in that chain we cannot reach
            // through a component prop: Radix wraps `NavigationMenuList`'s
            // `<ul>` in an inline-styled indicator-track `<div>` that takes no
            // className, and its auto height would make every `h-full` below it
            // resolve to auto.
            //
            // The scrollbar is hidden rather than left to the global styling:
            // at narrow widths a classic 8px horizontal bar would shorten this
            // scroller's content box and lift every section off the nav's
            // bottom edge.
            className="h-full min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>div]:h-full"
          >
            {/* No gap: adjacent sections have to touch, or the nav background
                shows through between them as a seam. */}
            <NavigationMenuList className="h-full w-max justify-start">
              {navLinks.map(({ href, label, isActive }) => (
                <NavigationMenuItem key={href} className="h-full">
                  <NavigationMenuLink asChild>
                    <DeckNavigationGuardLink
                      href={href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        navigationMenuTriggerStyle(),
                        navLinkStyles,
                        isActive && activeNavLinkStyles
                      )}
                    >
                      {label}
                    </DeckNavigationGuardLink>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
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
