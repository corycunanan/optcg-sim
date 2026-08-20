import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Variants whose fill or border draws a solid silhouette, so a cast reads as
 * the control sitting on the page rather than a rectangle floating under
 * nothing. `ghost` and `link` are excluded: see the elevation notes below.
 */
const RAISED_VARIANTS = ["default", "outline", "destructive", "gold"] as const

/**
 * Sizes wide enough to carry a cast. The icon sizes are square 32-40px
 * controls, where a 4px hard offset is a slab rather than a shadow, so they
 * stay flat at every variant.
 */
const RAISED_SIZES = ["default", "sm", "lg"] as const

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,translate,box-shadow] cursor-pointer select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-card text-card-foreground border border-border hover:bg-secondary hover:border-border-strong",
        outline:
          "bg-transparent text-gold-500 border border-gold-500 hover:bg-secondary hover:text-gold-400 hover:border-gold-400",
        ghost:
          "bg-transparent text-content-secondary border border-transparent hover:bg-secondary hover:text-content-primary",
        destructive:
          "bg-red-600 text-navy-900 border border-red-600 hover:bg-red-500 hover:border-red-500 focus-visible:outline-navy-900",
        gold:
          "bg-gold-500 text-navy-900 border border-gold-500 hover:bg-gold-400 hover:border-gold-400 focus-visible:outline-navy-900",
        link: "text-gold-500 underline-offset-4 hover:text-gold-400 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 font-semibold",
        sm: "h-8 px-3",
        lg: "h-12 px-6 text-base font-semibold",
        icon: "size-10",
        "icon-sm": "size-8",
      },
      /**
       * Opt out of the cast when the button already sits on a surface that
       * casts — a dialog or sheet panel at `shadow-lg`, a popover at
       * `shadow-md`. A child casting `shadow-md` inside a `shadow-lg` panel
       * inverts the ladder, and a hard offset inside an `overflow-hidden`
       * parent is clipped to a stub. `flat` is the surface's answer, not the
       * button's preference: reach for it only where the parent already casts.
       */
      elevation: {
        raised: "",
        flat: "",
      },
    },
    compoundVariants: [
      {
        variant: [...RAISED_VARIANTS],
        size: [...RAISED_SIZES],
        elevation: "raised",
        class: "shadow-sm hover:shadow-md motion-safe:hover:lift",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      elevation: "raised",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  elevation = "raised",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-elevation={elevation}
      className={cn(buttonVariants({ variant, size, elevation, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
