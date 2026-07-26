import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardNavbar, type BoardNavbarProps } from "./board-navbar";

vi.mock("./nav-menu", () => ({
  NavMenu: ({
    onConcede,
    spectator,
  }: {
    onConcede?: () => void;
    spectator?: boolean;
  }) => (
    <button
      aria-label="Game menu"
      data-concede-reachable={String(!!onConcede)}
      data-spectator={String(!!spectator)}
    />
  ),
}));

const baseProps: BoardNavbarProps = {
  turnNumber: 3,
  isMyTurn: true,
  phaseLabel: "MAIN",
  interactionMode: "full",
  playerIndex: 0,
  connectionStatus: "connected",
  onLeave: vi.fn(),
  onConcede: vi.fn(),
  matchClosed: false,
};

let renderer: ReactTestRenderer | null = null;

function renderNavbar(overrides: Partial<BoardNavbarProps> = {}) {
  const element = <BoardNavbar {...baseProps} {...overrides} />;
  act(() => {
    if (renderer) renderer.update(element);
    else renderer = create(element);
  });
  if (!renderer) throw new Error("BoardNavbar renderer did not mount");
  return renderer.root;
}

function announcementText(root: ReactTestRenderer["root"]): string {
  return root
    .findByProps({ "data-testid": "board-status-announcement" })
    .children.join("");
}

function srOnlySpanText(root: ReactTestRenderer["root"]): string[] {
  return root
    .findAll(
      (node) => node.type === "span" && node.props.className === "sr-only"
    )
    .map((node) => node.children.join(""));
}

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
});

describe("BoardNavbar accessibility", () => {
  it("labels navbar chrome, turn state, player identity, and connection status", () => {
    const root = renderNavbar();

    expect(root.findByType("nav").props["aria-label"]).toBe(
      "Game board status and controls"
    );
    expect(
      root.findByProps({ role: "group", "aria-label": "Turn and phase status" })
    ).toBeDefined();
    expect(srOnlySpanText(root)).toEqual([
      "Turn 3",
      "Your Turn",
      "Current phase: MAIN",
      "You are Player 1",
    ]);

    const connection = root.findByProps({
      role: "status",
      "aria-label": "Connection status: connected",
    });
    expect(connection).toBeDefined();
  });

  it("updates the polite live region when the turn and phase change", () => {
    let root = renderNavbar();
    const liveRegion = root.findByProps({
      "data-testid": "board-status-announcement",
    });

    expect(liveRegion.props.role).toBe("status");
    expect(liveRegion.props["aria-live"]).toBe("polite");
    expect(liveRegion.props["aria-atomic"]).toBe("true");
    expect(announcementText(root)).toBe("Turn 3. Your turn. MAIN");

    root = renderNavbar({
      turnNumber: 4,
      isMyTurn: false,
      phaseLabel: "REFRESH",
    });
    expect(announcementText(root)).toBe("Turn 4. Opponent's turn. REFRESH");

    root = renderNavbar({
      turnNumber: 4,
      isMyTurn: false,
      phaseLabel: "DRAW",
    });
    expect(announcementText(root)).toBe("Turn 4. Opponent's turn. DRAW");
  });

  it("labels interaction-mode badges without announcing a response when no prompt exists", () => {
    let root = renderNavbar({ interactionMode: "spectator" });
    expect(
      root.findByProps({
        role: "note",
        "aria-label": "Spectator mode: viewing only",
      })
    ).toBeDefined();
    expect(
      root.findByProps({ "aria-label": "Game menu" }).props[
        "data-concede-reachable"
      ]
    ).toBe("false");
    expect(announcementText(root)).toBe("Turn 3. Watching. MAIN");
    expect(srOnlySpanText(root)).toContain("Watching");
    expect(
      root.findByProps({ "aria-label": "Game menu" }).props["data-spectator"]
    ).toBe("true");

    root = renderNavbar({ interactionMode: "responseOnly" });
    expect(
      root.findByProps({
        role: "note",
        "aria-label": "Response mode: respond to the current prompt",
      })
    ).toBeDefined();
    expect(announcementText(root)).toBe("Turn 3. Your turn. MAIN");
  });
});
