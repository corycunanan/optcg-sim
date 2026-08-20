"use client";

import { Users } from "lucide-react";
import {
  navSlabIconBoxStyles,
  navSlabOpenStyles,
  navSlabStyles,
} from "@/components/nav/navbar-slab";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * DOM id the drawer panel carries so this toggle can own `aria-controls`.
 * Shared from here — the drawer is code-split behind `next/dynamic`, so the
 * navbar must not import anything out of `social-sidebar`.
 */
export const FRIENDS_DRAWER_ID = "friends-drawer";

/**
 * DOM id this toggle carries so the drawer can hand focus back on close.
 * Radix restores focus to its own `Dialog.Trigger`, and this control cannot be
 * one: it renders in the navbar, a different subtree from the drawer.
 */
export const FRIENDS_DRAWER_TOGGLE_ID = "friends-drawer-toggle";

/**
 * Opens the friends rail as a drawer below `md`, where the rail no longer has
 * a column of its own. Hidden from `md` up: the rail is on screen there, so a
 * control that opens it would be a second way to see what is already visible.
 *
 * State lives in `SidebarProvider` (mounted in the root layout) because the bar
 * and the rail are siblings — this is the same `openMobile` the drawer reads.
 */
export function FriendsDrawerToggle() {
  const { openMobile, setOpenMobile } = useSidebar();

  // Same slab as the nav links and the notification bell (OPT-712), so the bar
  // hovers as one surface rather than a link row plus a tray of pills. `Button
  // variant="ghost"` is gone with it: the slab overrode that recipe's radius,
  // height, width, padding, transition, and hover colors outright.
  return (
    <button
      id={FRIENDS_DRAWER_TOGGLE_ID}
      type="button"
      aria-label="Friends"
      aria-haspopup="dialog"
      aria-expanded={openMobile}
      aria-controls={FRIENDS_DRAWER_ID}
      onClick={() => setOpenMobile(!openMobile)}
      className={cn(
        navSlabStyles,
        "text-content-secondary md:hidden",
        // Held while the drawer is on screen, matching the bell's open paint
        // and the active link's section.
        openMobile && navSlabOpenStyles
      )}
    >
      <span className={navSlabIconBoxStyles}>
        {/* Sized here rather than inherited: without `Button` nothing upstream
            normalizes a bare lucide glyph to 16px. */}
        <Users className="size-4" aria-hidden="true" />
      </span>
    </button>
  );
}
