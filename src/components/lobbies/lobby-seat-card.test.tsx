// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LobbyRoomDeck } from "@/lib/lobbies/state";
import { LobbySeatCard } from "./lobby-seat-card";

vi.mock("@/components/social/user-avatar", () => ({
  UserAvatar: () => <span aria-hidden="true">L</span>,
}));

const deck: LobbyRoomDeck = {
  id: "deck-1",
  name: "Straw Hat Rush",
  leaderId: "OP01-001",
  leaderName: "Monkey.D.Luffy",
  leaderImageUrl: "/leader.png",
  contents: {
    characters: [
      {
        id: "OP01-025",
        name: "Roronoa Zoro",
        quantity: 4,
        imageUrl: "/card.png",
      },
    ],
    events: [],
    stages: [],
  },
};

afterEach(() => cleanup());

describe("LobbySeatCard card preview", () => {
  it.each(["left", "right"] as const)(
    "portals the %s-side preview outside an overflow-hidden frame",
    async (previewSide) => {
      const user = userEvent.setup();

      render(
        <main data-overflow-ancestor className="overflow-hidden">
          <LobbySeatCard
            role={previewSide === "left" ? "Host" : "Guest"}
            player={{ username: "strawhat", name: "Luffy", image: null }}
            deck={deck}
            ready
            readyEditable={false}
            readyDisabled={false}
            deckEditable={false}
            decks={[]}
            deckPlaceholder="Choose a deck"
            onDeckChange={vi.fn()}
            onReadyChange={vi.fn()}
            onPreview={vi.fn()}
            previewSide={previewSide}
          />
        </main>
      );

      await user.hover(screen.getByRole("button", { name: /Roronoa Zoro/ }));

      await waitFor(() => {
        const preview = document.querySelector<HTMLElement>(
          `[data-lobby-card-preview="${previewSide}"]`
        );
        expect(preview).not.toBeNull();
        expect(preview?.closest("[data-overflow-ancestor]")).toBeNull();
      });
    }
  );
});
