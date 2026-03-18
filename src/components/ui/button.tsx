import * as React from "react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-navy-900 text-content-inverse hover:bg-navy-800 active:bg-navy-900 border border-navy-900 hover:border-navy-800",
  secondary:
    "bg-surface-1 text-content-primary hover:bg-surface-2 active:bg-surface-3 border border-border hover:border-border-strong",
  ghost:
    "bg-transparent text-content-secondary hover:bg-surface-2 hover:text-content-primary border border-transparent",
  destructive:
    "bg-red-600 text-content-inverse hover:bg-red-500 active:bg-red-600 border border-red-600 hover:border-red-500",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-base gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded font-semibold transition-colors cursor-pointer",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
