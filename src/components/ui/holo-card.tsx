"use client";

import type { ReactNode } from "react";
import { useCardTilt } from "@/hooks/use-card-tilt";
import { cn } from "@/lib/utils";
import type { HoloEffect } from "@/types/cards";
import "./holo-card.css";

interface HoloCardProps {
  effect?: HoloEffect;
  className?: string;
  children: ReactNode;
}

/**
 * Wrapper that adds a pointer-driven holofoil + 3D tilt to its child surface
 * (typically a card image). Pass `effect="none"` to render a transparent
 * pass-through with no listeners attached — safe to mount unconditionally and
 * gate by rarity at the call site.
 *
 * Border-radius is inherited from `className` (`rounded-card` for a raw card
 * face, per docs/design/SHAPE-LANGUAGE.md §The card radius) so the shine/glare
 * layers and the inner clip stay in sync with the surface. `border-radius:
 * inherit` copies the computed value, so the percentage travels and each
 * inset-0 layer resolves it against its own identically sized box.
 */
export function HoloCard({ effect = "none", className, children }: HoloCardProps) {
  const enabled = effect !== "none";
  const { containerRef, handlers } = useCardTilt({ enabled });

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={containerRef}
      data-effect={effect}
      data-active="false"
      className={cn("holo-card", className)}
      {...handlers}
    >
      <div className="holo-card__inner">
        {children}
        <div className="holo-card__shine" aria-hidden="true" />
        <div className="holo-card__glare" aria-hidden="true" />
      </div>
    </div>
  );
}
