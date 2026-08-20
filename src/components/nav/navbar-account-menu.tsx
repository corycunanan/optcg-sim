"use client";

import { LogOut, Palette, UserRound } from "lucide-react";
import { signOut } from "next-auth/react";
import { DeckNavigationGuardLink } from "@/components/deck-builder/deck-navigation-guard";
import { NavbarDropdownSurface } from "@/components/nav/navbar-dropdown-surface";
import { navSlabStyles } from "@/components/nav/navbar-slab";
import { UserAvatar } from "@/components/social/user-avatar";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { resolveThemeName, type ThemeName } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface NavbarAccountMenuProps {
  user: {
    username?: string | null;
    name?: string | null;
    image?: string | null;
  };
  theme?: ThemeName | null;
}

// Matches the navbar dropdown item recipe: body-role text (14/400) on a square,
// dead-flat row inside the chamfered panel, with the inset-outline focus idiom.
const accountItemStyles =
  "text-content-primary hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus flex w-full items-center gap-2 px-3 py-2 text-sm";

export function NavbarAccountMenu({ user, theme }: NavbarAccountMenuProps) {
  const displayName = user.username || user.name || "Pirate";
  const resolvedTheme = resolveThemeName(theme);
  const themeLabel =
    resolvedTheme.charAt(0).toUpperCase() + resolvedTheme.slice(1);

  return (
    // The height chain has to be unbroken from the bar down to the trigger or
    // the slab stops short of the nav's edges (OPT-712). `[&>div]:h-full` is the
    // one link in that chain no prop reaches: Radix wraps `NavigationMenuList`'s
    // `<ul>` in an inline-styled indicator-track `<div>` that takes no
    // className, and its auto height would collapse every `h-full` below it.
    <NavigationMenu viewport={false} className="h-full flex-none [&>div]:h-full">
      <NavigationMenuList className="h-full">
        <NavigationMenuItem className="h-full">
          <NavigationMenuTrigger
            aria-label={`Account menu for ${displayName}`}
            // The trigger is a full-height square section of the bar, exactly
            // like a nav link, and holds `bg-surface-2` while its menu is open —
            // including under the pointer, which the shared trigger style would
            // otherwise repaint `bg-muted`.
            className={cn(
              navSlabStyles,
              "text-content-primary gap-2",
              "data-popup-open:bg-surface-2 data-popup-open:text-content-inverse data-popup-open:hover:bg-surface-2 data-open:bg-surface-2 data-open:text-content-inverse data-open:hover:bg-surface-2 data-open:focus:bg-surface-2"
            )}
          >
            <UserAvatar
              user={{
                username: user.username ?? null,
                name: user.name ?? null,
                image: user.image ?? null,
              }}
              size="sm"
              variant="dark"
            />
            <span
              data-slot="navbar-account-name"
              className="hidden max-w-16 truncate text-sm sm:block sm:max-w-24 lg:max-w-40"
            >
              {displayName}
            </span>
          </NavigationMenuTrigger>
          <NavigationMenuContent className="right-0 left-auto">
            <NavbarDropdownSurface>
              <ul className="flex w-48 flex-col p-1">
                <li>
                  <NavigationMenuLink asChild>
                    <DeckNavigationGuardLink
                      href="/onboarding"
                      className={accountItemStyles}
                    >
                      <UserRound className="size-4" aria-hidden="true" />
                      Profile
                    </DeckNavigationGuardLink>
                  </NavigationMenuLink>
                </li>
                <li>
                  <div
                    aria-label={`Theme: ${themeLabel}`}
                    className="text-content-primary flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <Palette className="size-4" aria-hidden="true" />
                    <span>Theme</span>
                    <span className="text-content-tertiary ml-auto text-sm">
                      {themeLabel}
                    </span>
                  </div>
                </li>
                <li>
                  <NavigationMenuLink asChild>
                    <button
                      type="button"
                      onClick={() => void signOut({ callbackUrl: "/" })}
                      className={accountItemStyles}
                    >
                      <LogOut className="size-4" aria-hidden="true" />
                      Sign Out
                    </button>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavbarDropdownSurface>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
