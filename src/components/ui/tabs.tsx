"use client";

import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const TabsRoot = RadixTabs.Root;

export function TabsList({ className, ...props }: RadixTabs.TabsListProps) {
  return (
    <RadixTabs.List
      className={cn(
        "inline-flex items-center gap-1 rounded bg-surface-2 p-1",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: RadixTabs.TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "inline-flex items-center justify-center rounded px-3 py-1.5 text-sm font-medium transition-colors",
        "text-content-secondary hover:text-content-primary",
        "data-[state=active]:bg-surface-1 data-[state=active]:text-content-primary data-[state=active]:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: RadixTabs.TabsContentProps) {
  return (
    <RadixTabs.Content
      className={cn("focus-visible:outline-none", className)}
      {...props}
    />
  );
}
