"use client";

import * as React from "react";
import * as RadixToast from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";

export const ToastProvider = RadixToast.Provider;
export const ToastRoot = RadixToast.Root;
export const ToastAction = RadixToast.Action;
export const ToastClose = RadixToast.Close;

export function ToastViewport({ className, ...props }: RadixToast.ToastViewportProps) {
  return (
    <RadixToast.Viewport
      className={cn(
        "fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[100vw]",
        className
      )}
      {...props}
    />
  );
}

type ToastVariant = "default" | "success" | "warning" | "error";

interface ToastProps extends RadixToast.ToastProps {
  variant?: ToastVariant;
  title: string;
  description?: string;
}

const variantClasses: Record<ToastVariant, string> = {
  default: "bg-navy-900 text-content-inverse border-navy-800",
  success: "bg-surface-1 text-content-primary border-success/30",
  warning: "bg-surface-1 text-content-primary border-warning/30",
  error:   "bg-surface-1 text-content-primary border-error/30",
};

const accentClasses: Record<ToastVariant, string> = {
  default: "bg-gold-500",
  success: "bg-success",
  warning: "bg-warning",
  error:   "bg-error",
};

export function Toast({ variant = "default", title, description, className, ...props }: ToastProps) {
  return (
    <ToastRoot
      className={cn(
        "relative flex gap-3 rounded border shadow-md px-4 py-3 overflow-hidden",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full",
        "data-[state=open]:slide-in-from-bottom-full",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      <div className={cn("absolute left-0 inset-y-0 w-1", accentClasses[variant])} />
      <div className="flex flex-col gap-1 min-w-0">
        <RadixToast.Title className="text-sm font-semibold leading-tight">{title}</RadixToast.Title>
        {description && (
          <RadixToast.Description className="text-xs opacity-80 leading-snug">{description}</RadixToast.Description>
        )}
      </div>
      <RadixToast.Close className="ml-auto shrink-0 opacity-60 hover:opacity-100 transition-opacity text-sm">
        ✕
      </RadixToast.Close>
    </ToastRoot>
  );
}
