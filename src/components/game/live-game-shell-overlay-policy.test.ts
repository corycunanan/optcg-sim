import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("LiveGameShell overlay composition policy", () => {
  it("has one overlay mount and no direct modal, dialog, overlay, or focus-scope JSX", () => {
    const source = readFileSync(
      new URL("./live-game-shell.tsx", import.meta.url),
      "utf8"
    );
    const overlayMounts = source.match(/<GameOverlayGate\b/g) ?? [];
    const bypassingElements =
      source.match(
        /^\s*<(?:[A-Z][A-Za-z0-9]*(?:Dialog|Modal|Overlay)|FocusScope)\b/gm
      ) ?? [];

    expect(overlayMounts).toHaveLength(1);
    expect(bypassingElements).toEqual([]);
    expect(source).not.toContain("createPortal");
    expect(source).not.toContain("@radix-ui/");
    expect(source).not.toContain("@/components/ui/dialog");
  });

  it("keeps every board modal, dialog, overlay, or focus scope in the interactive gate", () => {
    const source = readFileSync(
      new URL("./board-layout/board-layout.tsx", import.meta.url),
      "utf8",
    );
    const gateStart = source.indexOf("{interactiveBoardOverlaysEnabled && (");
    const passiveLayerStart = source.indexOf("<CardAnimationLayer", gateStart);

    expect(gateStart).toBeGreaterThan(-1);
    expect(passiveLayerStart).toBeGreaterThan(gateStart);

    const overlayElements =
      source.match(
        /^\s*<(?:[A-Z][A-Za-z0-9]*(?:Dialog|Modal|Overlay)|FocusScope)\b/gm,
      ) ?? [];
    const gatedOverlayElements =
      source
        .slice(gateStart, passiveLayerStart)
        .match(
          /^\s*<(?:[A-Z][A-Za-z0-9]*(?:Dialog|Modal|Overlay)|FocusScope)\b/gm,
        ) ?? [];

    expect(overlayElements).toEqual(gatedOverlayElements);
  });
});
