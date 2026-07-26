// @vitest-environment jsdom

import { useRef, useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LobbyRoomState } from "@/lib/lobbies/state";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/components/social/user-avatar", () => ({
  UserAvatar: () => <span aria-hidden="true">avatar</span>,
}));

import { SpectatorsModal } from "./spectators-modal";

const spectator: LobbyRoomState["spectators"][number] = {
  id: "spectator-1",
  username: "nami",
  name: "Nami",
  image: null,
};

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button type="button">Before dialog</button>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
      >
        View spectators (1)
      </button>
      <SpectatorsModal
        lobbyId="lobby-1"
        open={open}
        spectatorCount={1}
        spectators={[spectator]}
        viewerRole="guest"
        returnFocusRef={triggerRef}
        onOpenChange={setOpen}
        onRefresh={async () => null}
      />
      <button type="button">After dialog</button>
    </>
  );
}

afterEach(() => cleanup());

describe("SpectatorsModal Radix integration", () => {
  it("traps Tab and Shift+Tab inside the real modal dialog", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const afterDialog = screen.getByRole("button", { name: "After dialog" });

    await user.click(
      screen.getByRole("button", { name: "View spectators (1)" })
    );
    const title = screen.getByRole("heading", { name: "Spectators (1)" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(title);

    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(close);

    afterDialog.focus();
    expect(document.activeElement).toBe(close);
  });

  it("closes on Escape and returns focus to the count button", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", {
      name: "View spectators (1)",
    });

    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeDefined();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
