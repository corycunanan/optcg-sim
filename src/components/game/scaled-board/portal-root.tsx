const DEFAULT_PORTAL_ID = "overlay-root";

export interface PortalRootProps {
  id?: string;
}

export function PortalRoot({ id = DEFAULT_PORTAL_ID }: PortalRootProps) {
  return <div id={id} />;
}

export function getPortalContainer(
  id: string = DEFAULT_PORTAL_ID,
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(id);
}
