"use client";

import { useCallback } from "react";
import { useZonePosition } from "@/contexts/zone-position-context";

/** Registers a DOM element as a zone position anchor. */
export function ZoneRef({ zoneKey, children, style, className }: {
  zoneKey: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const zonePos = useZonePosition();
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) zonePos.register(zoneKey, node);
      else zonePos.unregister(zoneKey);
    },
    [zoneKey, zonePos],
  );
  return <div ref={ref} style={style} className={className}>{children}</div>;
}
