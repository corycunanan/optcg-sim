import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one navbar dropdown surface (OPT-648).
 *
 * Every panel that hangs off the navbar — the Decks and Cards menus, the
 * account menu, and the notification panel — renders through this component so
 * the treatment cannot drift between them:
 *
 * - **Shape:** a plain rectangle with square corners. Action menus are chrome,
 *   not content: the chamfered silhouette is reserved for cards sitting on
 *   page surfaces, and rounding is reserved for the sanctioned radius scale's
 *   content shapes, so menu chrome stays unornamented.
 * - **Material:** flat, opaque `--surface-overlay` interior with a single
 *   neutral 1px edge. No ring, no blur, no shadow stack — the perimeter is the
 *   only ornament and the interior is dead flat
 *   (`docs/design/MATERIAL-LANGUAGE.md`).
 *
 * The hosting element (a Radix viewport, navigation-menu content, or popover
 * content) is left transparent and unstyled; it only positions and animates.
 */
export function NavbarDropdownSurface({
  className,
  surfaceClassName,
  children,
}: {
  /** Layout classes for the frame root. */
  className?: string;
  /** Classes for the surface — sizing and inner padding go here. */
  surfaceClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="navbar-dropdown-surface"
      className={cn(
        "border-border bg-popover text-popover-foreground overflow-hidden border",
        className,
        surfaceClassName
      )}
    >
      {children}
    </div>
  );
}
