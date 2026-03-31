import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap border border-transparent transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-navy-900 text-content-inverse",
        secondary: "bg-surface-2 text-content-primary",
        outline: "border-border text-content-primary bg-transparent",
        success: "bg-success-soft text-success border-success/20",
        warning: "bg-warning-soft text-warning border-warning/20",
        error: "bg-error-soft text-error border-error/20",
        "card-red": "bg-card-red/15 text-card-red border-card-red/25",
        "card-blue": "bg-card-blue/15 text-card-blue border-card-blue/25",
        "card-green": "bg-card-green/15 text-card-green border-card-green/25",
        "card-purple": "bg-card-purple/15 text-card-purple border-card-purple/25",
        "card-black": "bg-card-black/15 text-card-black border-card-black/25",
        "card-yellow": "bg-card-yellow/15 text-card-yellow border-card-yellow/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
