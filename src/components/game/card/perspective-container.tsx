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
export const PerspectiveContainer = React.forwardRef<
  HTMLDivElement,
  {
    width: number;
    height: number;
    className?: string;
    style?: React.CSSProperties;
    onClick?: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    children: React.ReactNode;
  }
>(function PerspectiveContainer(
  { width, height, className, style, onClick, onContextMenu, children },
  ref,
) {
  return (
    <div
      ref={ref}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn("relative [perspective:1000px]", className)}
      style={{ width, height, ...style }}
    >
      {children}
    </div>
  );
});
