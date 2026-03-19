import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "card-red"
  | "card-blue"
  | "card-green"
  | "card-purple"
  | "card-black"
  | "card-yellow";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-surface-3 text-content-secondary border-border",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  error:   "bg-error-soft text-error border-error/20",
  "card-red":    "bg-card-red text-content-inverse border-transparent",
  "card-blue":   "bg-card-blue text-content-inverse border-transparent",
  "card-green":  "bg-card-green text-content-inverse border-transparent",
  "card-purple": "bg-card-purple text-content-inverse border-transparent",
  "card-black":  "bg-card-black text-content-inverse border-transparent",
  "card-yellow": "bg-card-yellow text-content-primary border-transparent",
};

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border leading-none",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
