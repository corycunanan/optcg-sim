import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  error,
  ...props
}: React.ComponentProps<"input"> & { error?: boolean }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-content-primary transition-colors placeholder:text-content-tertiary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        error && "border-error",
        className
      )}
      {...props}
    />
  )
}

export { Input }
