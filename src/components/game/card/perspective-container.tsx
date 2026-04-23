"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Outer wrapper that establishes a 3D perspective for the card. The
 * primitive can safely apply `rotateY` to its inner faces without warping
 * because the perspective origin is owned here.
 *
 * Kept minimal — layout + sizing. Motion, state, and face rendering are
 * handled by `<CardFaces>` inside.
 */
type PerspectiveContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  width: number;
  height: number;
};

export const PerspectiveContainer = React.forwardRef<
  HTMLDivElement,
  PerspectiveContainerProps
>(function PerspectiveContainer(
  { width, height, className, style, children, ...rest },
  ref,
) {
  // `...rest` is load-bearing: Radix's `<TooltipTrigger asChild>` clones the
  // child and spreads `onPointerEnter` / `onPointerLeave` / `onFocus` onto it.
  // Without the spread, tooltips silently don't fire on any `<Card>` consumer.
  return (
    <div
      ref={ref}
      {...rest}
      className={cn("relative [perspective:1000px]", className)}
      style={{ width, height, ...style }}
    >
      {children}
    </div>
  );
});
