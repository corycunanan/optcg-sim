"use client";

import { LogOut, Palette, UserRound } from "lucide-react";
import { signOut } from "next-auth/react";
import { DeckNavigationGuardLink } from "@/components/deck-builder/deck-navigation-guard";
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

interface NavbarAccountMenuProps {
  user: {
    username?: string | null;
    name?: string | null;
    image?: string | null;
  };
  theme?: ThemeName | null;
}

const accountItemStyles =
  "text-content-primary hover:bg-surface-2 hover:text-content-inverse focus:bg-surface-2 focus:text-content-inverse focus-visible:ring-2 focus-visible:ring-border-focus flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm";

export function NavbarAccountMenu({ user, theme }: NavbarAccountMenuProps) {
  const displayName = user.username || user.name || "Pirate";
  const resolvedTheme = resolveThemeName(theme);
  const themeLabel =
    resolvedTheme.charAt(0).toUpperCase() + resolvedTheme.slice(1);

  return (
    <NavigationMenu viewport={false} className="flex-none">
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger
            aria-label={`Account menu for ${displayName}`}
            className="text-content-primary hover:bg-surface-2 focus:bg-surface-2 focus-visible:ring-border-focus data-popup-open:bg-surface-2 data-open:bg-surface-2 bg-transparent px-1 focus-visible:ring-2"
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
          </NavigationMenuTrigger>
          <NavigationMenuContent className="border-border bg-surface-nav border ring-0">
            <ul className="flex w-48 flex-col gap-1 p-1">
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
                  className="text-content-primary flex items-center gap-2 rounded-md px-3 py-2 text-sm"
                >
                  <Palette className="size-4" aria-hidden="true" />
                  <span>Theme</span>
                  <span className="text-content-tertiary ml-auto text-xs">
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
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
