import type { ReactNode } from "react";

import { ChamferFrame } from "@/components/ui/chamfer-frame";
import { cn } from "@/lib/utils";

/**
 * The one navbar dropdown surface (OPT-648).
 *
 * Every panel that hangs off the navbar — the Decks and Cards menus, the
 * account menu, and the notification panel — renders through this component so
 * the treatment cannot drift between them:
 *
 * - **Shape:** chamfered polygon, 8px cut, top-left + bottom-right. Chrome is
 *   angular so the rounded card silhouette stays unique
 *   (`docs/design/SHAPE-LANGUAGE.md`). 8px is the control step, which is the
 *   scale these menus actually read at, and it leaves the diagonal clear of the
 *   first and last row's inset focus outline.
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
  /** Layout classes for the rectangular frame root. */
  className?: string;
  /** Classes for the clipped surface — sizing and inner padding go here. */
  surfaceClassName?: string;
  children: ReactNode;
}) {
  return (
    <ChamferFrame
      data-slot="navbar-dropdown-surface"
      cut="md"
      edge="neutral"
      className={className}
      surfaceClassName={cn(
        "bg-popover text-popover-foreground",
        surfaceClassName
      )}
    >
      {children}
    </ChamferFrame>
  );
}
