"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const gameButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded text-sm font-bold whitespace-nowrap transition-colors cursor-pointer outline-none select-none focus-visible:ring-2 focus-visible:ring-gb-accent-blue focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
  {
    variants: {
      variant: {
        /** Navy background, bright text — primary CTA */
        primary:
          "bg-gb-accent-navy text-white border border-gb-accent-navy hover:bg-gb-accent-navy hover:opacity-90",
        /** Amber tint background, amber text — modal confirm actions */
        amber:
          "bg-gb-accent-amber/15 text-gb-accent-amber border border-gb-accent-amber/30 hover:bg-gb-accent-amber/25 hover:border-gb-accent-amber/60",
        /** Green tint background, green text — phase actions, accent CTAs */
        green:
          "bg-gb-accent-green/15 text-gb-accent-green border border-gb-accent-green/30 hover:bg-gb-accent-green/20 hover:border-gb-accent-green/50",
        /** Raised surface, neutral text — secondary/alternative actions */
        secondary:
          "bg-gb-surface-raised text-gb-text border border-gb-border-strong hover:bg-gb-surface-raised hover:border-gb-text-muted hover:text-gb-text-bright",
        /** Subtle red text, raised surface — destructive actions */
        danger:
          "bg-gb-surface-raised text-gb-accent-red border border-gb-accent-red/30 hover:bg-gb-surface-raised hover:border-gb-accent-red/50",
        /** Transparent, dim text — hide buttons, subtle navigation */
        ghost:
          "bg-transparent text-gb-text-dim border border-transparent hover:text-gb-text hover:bg-gb-surface-raised",
      },
      size: {
        default: "h-8 px-3 text-xs",
        sm: "h-auto px-2 py-1 text-xs",
        lg: "h-12 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

function GameButton({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof gameButtonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="game-button"
      className={cn(gameButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { GameButton, gameButtonVariants };
