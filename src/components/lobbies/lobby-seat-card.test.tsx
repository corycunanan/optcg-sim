// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyRoomDeck } from "@/lib/lobbies/state";

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  apiGet: (...args: unknown[]) => mocks.apiGet(...args),
}));

vi.mock("@/components/social/user-avatar", () => ({
  UserAvatar: ({ showOnline }: { showOnline?: boolean }) => (
    <span
      data-avatar
      data-online={String(Boolean(showOnline))}
      aria-hidden="true"
    >
      L
    </span>
  ),
}));

import { LobbySeatCard } from "./lobby-seat-card";

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

const deckOptions = [
  { ...deck, format: "Standard", totalCards: 51, colors: ["Red"] },
  {
    id: "deck-2",
    name: "Kid Rush",
    leaderId: "OP01-060",
    leaderName: "Eustass Kid",
    leaderImageUrl: "/kid.png",
    format: "Standard",
    totalCards: 51,
    colors: ["Green"],
  },
];

function renderSeat(
  overrides: Partial<Parameters<typeof LobbySeatCard>[0]> = {}
) {
  const props = {
    role: "Host" as const,
    player: { username: "strawhat", name: "Luffy", image: null },
    deck,
    ready: true,
    readyEditable: false,
    readyDisabled: false,
    deckEditable: false,
    decks: deckOptions,
    onDeckChange: vi.fn(),
    onReadyChange: vi.fn(),
    onPreview: vi.fn(),
    previewSide: "left" as const,
    ...overrides,
  };
  render(<LobbySeatCard {...props} />);
  return props;
}

async function openSeatMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole("button", { name: /More actions for/ });
  trigger.focus();
  await user.keyboard("{Enter}");
  return trigger;
}

beforeEach(() => {
  mocks.apiGet.mockReset();
  mocks.apiGet.mockResolvedValue({
    data: {
      id: "deck-2",
      name: "Kid Rush",
      cards: [
        {
          cardId: "OP01-061",
          quantity: 2,
          selectedArtUrl: null,
          card: {
            name: "Kid & Killer",
            type: "Character",
            imageUrl: "/kk.png",
          },
        },
        {
          cardId: "OP01-070",
          quantity: 3,
          selectedArtUrl: null,
          card: { name: "Damned Punk", type: "Event", imageUrl: "/dp.png" },
        },
      ],
    },
  });
});

afterEach(() => cleanup());

describe("LobbySeatCard header", () => {
  it("stacks the player name above the role eyebrow", () => {
    renderSeat();

    const name = screen.getByRole("heading", { name: "strawhat" });
    const eyebrow = screen.getByText("Host");

    expect(
      name.compareDocumentPosition(eyebrow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(eyebrow.className).toContain("text-gold-600");
    expect(eyebrow.className).toContain("uppercase");
  });

  it("threads lobby presence through to the avatar dot", () => {
    renderSeat({ online: true });

    expect(
      document.querySelector("[data-avatar]")?.getAttribute("data-online")
    ).toBe("true");
  });

  it("leaves the avatar dot off when the seat is offline", () => {
    renderSeat({ online: false });

    expect(
      document.querySelector("[data-avatar]")?.getAttribute("data-online")
    ).toBe("false");
  });

  it.each([
    [true, "Ready", "bg-success"],
    [false, "Not ready", "bg-content-tertiary"],
  ])(
    "renders an uppercase status-dot ready pill (ready=%s)",
    (ready, label, dotClass) => {
      renderSeat({ ready });

      const pill = screen.getByText(label);
      expect(pill.className).toContain("uppercase");
      const dot = pill.querySelector("span[aria-hidden='true']");
      expect(dot?.className).toContain(dotClass);
      expect(dot?.className).toContain("rounded-full");
    }
  );

  it("keeps the ready pill interactive when the viewer owns the seat", async () => {
    const user = userEvent.setup();
    const props = renderSeat({ ready: false, readyEditable: true });

    await user.click(screen.getByRole("button", { name: /Not ready/ }));

    expect(props.onReadyChange).toHaveBeenCalledWith(true);
  });
});

describe("LobbySeatCard overflow menu", () => {
  it("offers Change deck on a seat the viewer can edit", async () => {
    const user = userEvent.setup();
    renderSeat({ deckEditable: true });

    await openSeatMenu(user);

    expect(screen.getByRole("menuitem", { name: /Change deck/ })).toBeDefined();
    expect(screen.queryByRole("menuitem", { name: "Preview deck" })).toBeNull();
  });

  it("offers Preview deck on a seat the viewer cannot edit", async () => {
    const user = userEvent.setup();
    const props = renderSeat({ deckEditable: false });

    await openSeatMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Preview deck" }));

    expect(props.onPreview).toHaveBeenCalledWith("deck-1");
  });

  it("appends caller-supplied role actions below the deck entry", async () => {
    const user = userEvent.setup();
    renderSeat({
      deckEditable: true,
      menuItems: <button role="menuitem">Disband party</button>,
    });

    await openSeatMenu(user);

    expect(
      screen.getByRole("menuitem", { name: "Disband party" })
    ).toBeDefined();
  });

  it("keeps preview affordances live on a dimmed in-game seat", async () => {
    const user = userEvent.setup();
    // The in-game shape: dimmed, nothing editable, preview still meaningful.
    const props = renderSeat({ dimmed: true, deckEditable: false });

    const section = screen.getByRole("region", { name: /Host seat/ });
    expect(section.className).toContain("opacity-50");
    expect(section.className).not.toContain("pointer-events-none");

    await user.click(
      screen.getByRole("button", { name: "Preview Straw Hat Rush" })
    );
    expect(props.onPreview).toHaveBeenCalledWith("deck-1");

    await openSeatMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Preview deck" }));
    expect(props.onPreview).toHaveBeenCalledTimes(2);
  });

  it("hides the trigger entirely when no action applies to the seat state", () => {
    renderSeat({ deck: null, deckEditable: false });

    expect(
      screen.queryByRole("button", { name: /More actions for/ })
    ).toBeNull();
  });
});

describe("LobbySeatCard deck switching", () => {
  it("no longer renders a footer deck selector", () => {
    renderSeat({ deckEditable: true });

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.querySelector("footer")).toBeNull();
  });

  it("opens the change-deck modal from the leader card when editable", async () => {
    const user = userEvent.setup();
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );

    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Change deck" })).toBeDefined();
  });

  it("previews instead of switching from the leader card when locked", async () => {
    const user = userEvent.setup();
    const props = renderSeat({ deckEditable: false });

    await user.click(
      screen.getByRole("button", { name: "Preview Straw Hat Rush" })
    );

    expect(props.onPreview).toHaveBeenCalledWith("deck-1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("commits the previewed deck only when the viewer confirms", async () => {
    const user = userEvent.setup();
    const props = renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    await screen.findByRole("dialog");

    // The seated deck is already in use, so the commit stays disabled.
    expect(
      screen
        .getByRole("button", { name: "Use this deck" })
        .hasAttribute("disabled")
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: /Kid Rush/ }));
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalled());
    expect(await screen.findByText("Kid & Killer")).toBeDefined();
    expect(props.onDeckChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Use this deck" }));

    expect(props.onDeckChange).toHaveBeenCalledWith("deck-2");
  });

  it("announces the preview pane while it loads", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    mocks.apiGet.mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /Kid Rush/ }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Loading Kid Rush list");

    await act(async () => {
      release({ data: { id: "deck-2", name: "Kid Rush", cards: [] } });
    });
  });

  it("surfaces a retryable error instead of poisoning the deck cache", async () => {
    const user = userEvent.setup();
    mocks.apiGet.mockRejectedValueOnce(new Error("network"));
    const props = renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /Kid Rush/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load this deck list.");
    // A failure must not read as an empty deck.
    expect(screen.queryByText("Deck list unavailable")).toBeNull();

    // Retry refetches rather than serving a cached empty grouping.
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Kid & Killer")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.apiGet).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole("button", { name: "Use this deck" }));
    expect(props.onDeckChange).toHaveBeenCalledWith("deck-2");
  });

  it("retries a failed deck on the next visit to the modal", async () => {
    const user = userEvent.setup();
    mocks.apiGet.mockRejectedValueOnce(new Error("network"));
    renderSeat({ deckEditable: true });

    const openModal = async () =>
      user.click(
        screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
      );

    await openModal();
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /Kid Rush/ }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await openModal();
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /Kid Rush/ }));

    expect(await screen.findByText("Kid & Killer")).toBeDefined();
  });

  it("discards the preview on cancel", async () => {
    const user = userEvent.setup();
    const props = renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /Kid Rush/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(props.onDeckChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

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
