import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors cursor-pointer outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-navy-900 text-content-inverse border border-navy-900 hover:bg-navy-800 hover:border-navy-800",
        secondary:
          "bg-surface-1 text-content-primary border border-border hover:bg-surface-2 hover:border-border-strong",
        outline:
          "bg-transparent text-navy-900 border border-navy-900 hover:bg-navy-100",
        ghost:
          "bg-transparent text-content-secondary border border-transparent hover:bg-surface-2 hover:text-content-primary",
        destructive:
          "bg-red-600 text-content-inverse border border-red-600 hover:bg-red-500 hover:border-red-500",
        gold:
          "bg-gold-500 text-navy-900 border border-gold-500 hover:bg-gold-400 hover:border-gold-400",
        link: "text-navy-900 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
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
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
