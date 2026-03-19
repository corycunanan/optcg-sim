import * as React from "react";
import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
};

export function Input({ error, className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded border bg-surface-1 px-3 py-2 text-sm text-content-primary",
        "placeholder:text-content-tertiary",
        "transition-colors",
        "hover:border-border-strong",
        "focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-navy-900/10",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        error
          ? "border-error focus:border-error focus:ring-error/10"
          : "border-border",
        className
      )}
      {...props}
    />
  );
}
