import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap border border-transparent transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-accent-fill-border",
        secondary: "bg-secondary text-secondary-foreground border-border-strong",
        outline: "border-border text-content-primary bg-transparent",
        success: "bg-success-soft text-success border-success/20",
        warning: "bg-warning-soft text-warning border-warning/20",
        error: "bg-error-soft text-error border-error/20",
        "card-red": "border-card-red-border bg-card-red text-white",
        "card-blue": "border-card-blue-border bg-card-blue text-white",
        "card-green": "border-card-green-border bg-card-green text-white",
        "card-purple": "border-card-purple-border bg-card-purple text-white",
        "card-black": "border-card-black-border bg-card-black text-white",
        "card-yellow": "border-card-yellow-border bg-card-yellow text-card-yellow-fg",
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
