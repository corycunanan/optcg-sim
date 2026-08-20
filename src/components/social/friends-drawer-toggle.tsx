"use client";

import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

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

  return (
    <Button
      id={FRIENDS_DRAWER_TOGGLE_ID}
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Friends"
      aria-haspopup="dialog"
      aria-expanded={openMobile}
      aria-controls={FRIENDS_DRAWER_ID}
      onClick={() => setOpenMobile(!openMobile)}
      className="text-content-secondary md:hidden"
    >
      <Users aria-hidden="true" />
    </Button>
  );
}
