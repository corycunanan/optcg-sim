"use client";

import { useCallback, type HTMLAttributes } from "react";
import { useZonePosition } from "@/contexts/zone-position-context";

/** Registers a DOM element as a zone position anchor. */
export function ZoneRef({ zoneKey, children, ...props }: {
  zoneKey: string;
  children: React.ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const zonePos = useZonePosition();
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) zonePos.register(zoneKey, node);
      else zonePos.unregister(zoneKey);
    },
    [zoneKey, zonePos],
  );
  return <div ref={ref} {...props}>{children}</div>;
}
