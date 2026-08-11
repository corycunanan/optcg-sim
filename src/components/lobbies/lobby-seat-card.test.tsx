// @vitest-environment jsdom

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

function seatSection() {
  return screen.getByRole("region", { name: /seat —/ });
}

/** Document-order index of an element within the seat's subtree. */
function orderOf(element: Element) {
  return [...seatSection().querySelectorAll("*")].indexOf(element);
}

/** `GET /api/decks/:id` payload shaped like `DeckDetailResponseSchema`. */
function deckDetail(rawDeckId: string) {
  const deckId = rawDeckId.replace("/api/decks/", "");
  const decks: Record<
    string,
    {
      name: string;
      leader: { id: string; name: string };
      cards: [string, string, number][];
    }
  > = {
    "deck-1": {
      name: "Straw Hat Rush",
      leader: { id: "OP01-001", name: "Monkey.D.Luffy" },
      cards: [["OP01-025", "Roronoa Zoro", 4]],
    },
    "deck-2": {
      name: "Kid Rush",
      leader: { id: "OP01-060", name: "Eustass Kid" },
      cards: [
        ["OP01-061", "Kid & Killer", 2],
        ["OP01-070", "Damned Punk", 3],
      ],
    },
  };
  const source = decks[deckId] ?? decks["deck-1"];

  return {
    data: {
      id: deckId,
      name: source.name,
      leaderId: source.leader.id,
      leaderArtUrl: null,
      leader: {
        id: source.leader.id,
        name: source.leader.name,
        type: "Leader",
        imageUrl: `/${source.leader.id}.png`,
      },
      cards: source.cards.map(([id, name, quantity]) => ({
        cardId: id,
        quantity,
        selectedArtUrl: null,
        card: { id, name, type: "Character", imageUrl: `/${id}.png` },
      })),
    },
  };
}

function cardDetail() {
  return {
    data: {
      id: "OP01-025",
      name: "Roronoa Zoro",
      type: "Character",
      color: ["Red"],
      cost: 3,
      power: 5000,
      counter: 1000,
      life: null,
      imageUrl: "/card.png",
      banStatus: "LEGAL",
      blockNumber: 1,
      traits: ["Straw Hat Crew"],
      attribute: ["Slash"],
      effectText: "This Character gains +1000 power.",
      triggerText: null,
      rarity: "R",
      originSet: "OP01",
      effectSchema: null,
      artVariants: [],
      cardSets: [],
    },
  };
}

function requestedDeckId(url: string) {
  return url.replace("/api/decks/", "");
}

function deckRequests(deckId: string) {
  return mocks.apiGet.mock.calls.filter(
    ([url]) => requestedDeckId(url as string) === deckId
  ).length;
}

/**
 * The pane fetches the seated deck as soon as the modal opens, so per-call
 * mock overrides would land on `deck-1`. These target `deck-2` — the deck the
 * viewer switches to — and leave everything else on the happy path.
 */
function overrideDeck2(handler: (attempt: number) => unknown) {
  let attempt = 0;
  mocks.apiGet.mockImplementation(async (url: string) => {
    if (requestedDeckId(url) !== "deck-2") return deckDetail(url);
    attempt += 1;
    return handler(attempt);
  });
}

function failDeck2Once() {
  overrideDeck2((attempt) => {
    if (attempt === 1) throw new Error("network");
    return deckDetail("deck-2");
  });
}

function deferDeck2(pending: () => Promise<unknown>) {
  overrideDeck2((attempt) =>
    attempt === 1 ? pending() : deckDetail("deck-2")
  );
}

beforeEach(() => {
  mocks.apiGet.mockReset();
  mocks.apiGet.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/cards/")) return cardDetail();
    return deckDetail(requestedDeckId(url));
  });
});

afterEach(() => cleanup());

describe("LobbySeatCard composition", () => {
  it("stacks menu, identity, leader, and readiness in that order", () => {
    renderSeat({ deckEditable: true, readyEditable: true });

    const menu = screen.getByRole("button", { name: /More actions for/ });
    const name = screen.getByRole("heading", { name: "strawhat" });
    const leader = screen.getByRole("button", {
      name: "Change deck — Straw Hat Rush",
    });
    const readyControl = screen.getByRole("button", { name: /Ready/ });

    expect(orderOf(menu)).toBeLessThan(orderOf(name));
    expect(orderOf(name)).toBeLessThan(orderOf(leader));
    expect(orderOf(leader)).toBeLessThan(orderOf(readyControl));
  });

  it("sits directly on the page surface with no wrapping panel", () => {
    renderSeat();

    const section = seatSection();
    expect(section.className).toContain("gap-y-3");
    expect(section.className).toContain("lg:gap-4");
    expect(section.className).not.toMatch(/(^|\s)(border|rounded|bg-)/);
    // The internal dividers went with the panel.
    const dividers = [...section.querySelectorAll("*")].filter((node) =>
      node.classList.contains("border-b")
    );
    expect(dividers).toHaveLength(0);
    expect(section.querySelector("header")).toBeNull();
  });

  it("keeps the leader caption inside its gap-3 art group", () => {
    renderSeat();

    const section = seatSection();
    const group = section.querySelector("[data-leader-art-caption-group]");
    const caption = screen.getByText("Leader").parentElement;

    expect(group).not.toBeNull();
    expect(group?.classList).toContain("gap-3");
    expect(group?.contains(caption)).toBe(true);
    expect(caption?.parentElement).toBe(group);
    expect(caption?.parentElement).not.toBe(section);
  });

  it("keeps the deck list out of the seat", () => {
    renderSeat();

    expect(screen.queryByText("Deck list")).toBeNull();
    expect(screen.queryByText("Characters")).toBeNull();
    expect(screen.queryByText(/Roronoa Zoro/)).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.querySelector("footer")).toBeNull();
  });

  it("reserves rounded-full for people and status dots, not chrome", () => {
    renderSeat({ readyEditable: true, deckEditable: true });

    const pills = [...seatSection().querySelectorAll("*")].filter((node) =>
      node.className.toString().split(/\s+/).includes("rounded-full")
    );
    // Only the readiness dot, and it is decorative.
    expect(pills).toHaveLength(1);
    expect(pills[0].getAttribute("aria-hidden")).toBe("true");
  });

  it("labels the leader slot and names the leader card", () => {
    renderSeat();

    expect(screen.getByText("Leader")).toBeDefined();
    expect(screen.getByText("Monkey.D.Luffy")).toBeDefined();
    const leader = screen.getByRole("button", {
      name: "Preview Straw Hat Rush",
    });
    // A fixed thumbnail in the compact row; the stack's one flexible member
    // from `lg`, where height drives width through the card ratio.
    expect(leader.className).toContain("w-24");
    expect(leader.className).toContain("lg:w-auto");
    expect(leader.className).toContain("lg:flex-1");
    expect(leader.className).toContain("lg:max-h-[16.75rem]");
    expect(leader.className).toContain("aspect-card");
    expect(screen.getByText("Leader").parentElement?.className).toContain(
      "lg:w-48"
    );
  });

  it("gives every leader-art state the same flexible box", () => {
    const boxes = ["w-24", "lg:w-auto", "lg:flex-1", "lg:max-h-[16.75rem]"];

    renderSeat({ deck: null, deckEditable: true });
    const picker = screen.getByRole("button", { name: "Choose a deck" });
    for (const box of boxes) expect(picker.className).toContain(box);
    cleanup();

    // The other seat's empty slot is inert, so it is asserted through the DOM
    // rather than a role.
    renderSeat({ deck: null, deckEditable: false });
    const placeholder = seatSection().querySelector(
      "[aria-hidden='true'].aspect-card"
    );
    expect(placeholder).not.toBeNull();
    for (const box of boxes)
      expect(placeholder!.className).toContain(box);
  });

  it("re-flows the seat without disturbing its reading order", () => {
    renderSeat({ deckEditable: true, readyEditable: true });

    // Placement only: the grid moves the groups into a row below `lg` while
    // the DOM stays in the order the stacked layout paints, and the placement
    // properties stop applying once the seat is a flex column.
    const section = seatSection();
    expect(section.className).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
    expect(section.className).toContain("lg:flex");
    expect(section.className).toContain("lg:flex-col");

    expect(
      screen.getByRole("button", { name: /More actions for/ }).className
    ).toContain("col-start-3");
    const leaderGroup = section.querySelector(
      "[data-leader-art-caption-group]"
    );
    expect(leaderGroup?.className).toContain("col-start-1");
    expect(leaderGroup?.className).toContain("row-start-1");
    expect(
      screen.getByRole("button", { name: /Ready/ }).className
    ).toContain("row-start-3");
  });

  it("spends its rhythm only where the viewport can afford it", () => {
    renderSeat();

    // The frame never scrolls, so the stack's full spacing is gated on height
    // as well as width.
    expect(seatSection().className).toContain(
      "lg:[@media(min-height:50rem)]:gap-5"
    );
  });

  it("stacks the player name above the role eyebrow", () => {
    renderSeat();

    const name = screen.getByRole("heading", { name: "strawhat" });
    const eyebrow = screen.getByText("Host");

    expect(orderOf(name)).toBeLessThan(orderOf(eyebrow));
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
});

describe("LobbySeatCard readiness", () => {
  it.each([
    [true, "Ready", "bg-success"],
    [false, "Ready up", "bg-content-tertiary"],
  ])(
    "renders a ready-up button carrying the status dot (ready=%s)",
    (ready, label, dotClass) => {
      renderSeat({ ready, readyEditable: true });

      const button = screen.getByRole("button", { name: label });
      expect(button.getAttribute("aria-pressed")).toBe(String(ready));
      // Readiness is live status, never the gold focal action.
      expect(button.getAttribute("data-variant")).toBe("default");
      expect(button.className).not.toContain("bg-gold");
      expect(button.className).not.toContain("rounded-full");

      const dot = button.querySelector("span[aria-hidden='true']");
      expect(dot?.className).toContain(dotClass);
    }
  );

  it("toggles readiness for the seat owner", async () => {
    const user = userEvent.setup();
    const props = renderSeat({ ready: false, readyEditable: true });

    await user.click(screen.getByRole("button", { name: "Ready up" }));

    expect(props.onReadyChange).toHaveBeenCalledWith(true);
  });

  it("toggles readiness back off from the ready state", async () => {
    const user = userEvent.setup();
    const props = renderSeat({ ready: true, readyEditable: true });

    await user.click(screen.getByRole("button", { name: "Ready" }));

    expect(props.onReadyChange).toHaveBeenCalledWith(false);
  });

  it("blocks the toggle while the seat cannot act", async () => {
    const user = userEvent.setup();
    const props = renderSeat({
      ready: false,
      readyEditable: true,
      readyDisabled: true,
    });

    const button = screen.getByRole("button", { name: "Ready up" });
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.click(button);

    expect(props.onReadyChange).not.toHaveBeenCalled();
  });

  it.each([
    [true, "Ready"],
    [false, "Not ready"],
  ])(
    "reads the other seat's readiness as status, not a control (ready=%s)",
    (ready, label) => {
      renderSeat({ ready, readyEditable: false });

      expect(screen.queryByRole("button", { name: /Ready/ })).toBeNull();
      const status = screen.getByText(label);
      expect(status.hasAttribute("data-seat-ready-status")).toBe(true);
      expect(status.className).toContain("uppercase");
    }
  );
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

    const section = seatSection();
    expect(section.className).toContain("opacity-60");
    expect(section.className).not.toContain("pointer-events-none");

    await user.click(
      screen.getByRole("button", { name: "Preview Straw Hat Rush" })
    );
    expect(props.onPreview).toHaveBeenCalledWith("deck-1");

    await openSeatMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Preview deck" }));
    expect(props.onPreview).toHaveBeenCalledTimes(2);
  });

  it("drops the trigger but holds its slot when no action applies", () => {
    // A guest looking at a host who has not picked a deck: no preview, no
    // host-only items, nothing to put in the menu.
    renderSeat({ deck: null, deckEditable: false });

    expect(
      screen.queryByRole("button", { name: /More actions for/ })
    ).toBeNull();

    // The group rhythm survives, so this seat still lines up with the one
    // beside it. Four children: the leader's art and caption share one group
    // so their spacing remains fixed while the art absorbs free space.
    const section = seatSection();
    expect(section.children).toHaveLength(4);

    const placeholder = section.firstElementChild!;
    expect(placeholder.hasAttribute("data-seat-menu-placeholder")).toBe(true);
    // Reserves the icon button's box without becoming a control.
    expect(placeholder.className).toContain("size-10");
    expect(placeholder.getAttribute("aria-hidden")).toBe("true");
    expect(placeholder.tagName).toBe("SPAN");
    expect(placeholder.hasAttribute("tabindex")).toBe(false);
    expect(placeholder.textContent).toBe("");
  });

  it("keeps the same group rhythm whether or not the menu renders", () => {
    renderSeat({ deck: null, deckEditable: false });
    const withoutMenu = seatSection().children.length;
    cleanup();

    renderSeat({ deckEditable: true, readyEditable: true });
    expect(seatSection().children).toHaveLength(withoutMenu);
  });
});

describe("LobbySeatCard empty leader slot", () => {
  it("turns the empty slot into the deck picker on your own seat", async () => {
    const user = userEvent.setup();
    renderSeat({ deck: null, deckEditable: true });

    expect(screen.getByText("Leader")).toBeDefined();
    expect(screen.getByText("Choose a deck")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Choose a deck" }));

    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Change deck" })).toBeDefined();
  });

  it("waits quietly on the other seat's deck", () => {
    renderSeat({ deck: null, deckEditable: false });

    expect(screen.getByText("Waiting on their deck")).toBeDefined();
    expect(screen.queryByRole("button", { name: /deck/i })).toBeNull();
  });
});

describe("LobbySeatCard deck switching", () => {
  it("opens the change-deck modal from the leader card when editable", async () => {
    const user = userEvent.setup();
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );

    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Change deck" })).toBeDefined();
  });

  it("previews the seated deck as a card-art grid with counts", async () => {
    const user = userEvent.setup();
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    const dialog = await screen.findByRole("dialog");
    const pane = within(dialog);

    // Leader plus one ×4 character — the leader is a grid entry, not a
    // separate thumbnail beside the pane title. One stack per distinct card
    // carries the whole group's accessible name; the art inside is decorative.
    expect(
      await pane.findByRole("button", { name: "Monkey.D.Luffy, 1 copy" })
    ).toBeDefined();
    const zoro = pane.getByRole("button", { name: "Roronoa Zoro, 4 copies" });
    expect(zoro.querySelectorAll("img")).toHaveLength(4);
    expect(
      [...zoro.querySelectorAll("img")].every(
        (image) => image.getAttribute("alt") === ""
      )
    ).toBe(true);

    // The visible ×N caption is decorative — the count is in the stack label.
    expect(pane.getByText("×4").getAttribute("aria-hidden")).toBe("true");
    expect(pane.getByText("×1")).toBeDefined();

    // The grouped text list is gone from this pane.
    expect(pane.queryByText("Characters")).toBeNull();
  });

  it("presents the art on a bare pane with a plain modal title", async () => {
    const user = userEvent.setup();
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    const dialog = await screen.findByRole("dialog");
    const pane = within(dialog);
    await pane.findByRole("button", { name: "Roronoa Zoro, 4 copies" });

    // Title uses the shared DialogTitle default, not the display face.
    const title = pane.getByRole("heading", { name: "Change deck" });
    expect(title.className).not.toContain("font-display");
    expect(title.className).not.toContain("uppercase");

    // No rail eyebrow and no pane header — the rail keeps its accessible name.
    expect(pane.queryByText("Decks")).toBeNull();
    expect(pane.queryByText(/cards$/)).toBeNull();
    expect(pane.getByRole("group", { name: "Your decks" })).toBeDefined();

    // The grid keeps its own scroll region; no panel chrome around it.
    const scroller = dialog.querySelector<HTMLElement>(".overflow-y-auto.p-2");
    expect(scroller).not.toBeNull();
    expect(scroller?.className).not.toContain("bg-surface-3");
    expect(scroller?.className).not.toContain("border");
  });

  it("follows the shape semantics: angular chrome, rounded cards", async () => {
    const user = userEvent.setup();
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    const dialog = await screen.findByRole("dialog");
    const pane = within(dialog);
    await pane.findByRole("button", { name: "Roronoa Zoro, 4 copies" });

    // Chrome is square: the rail and its dense rows carry no card radius.
    const rail = pane.getByRole("group", { name: "Your decks" });
    expect(rail.className).not.toMatch(/(^|\s)rounded/);
    for (const row of pane.getAllByRole("button", { name: /Rush|Nami/ })) {
      expect(row.className).not.toMatch(/(^|\s)rounded/);
    }

    // Card silhouettes keep their radius — that is the figure-ground point.
    const art = dialog.querySelector("img");
    expect(art?.parentElement?.className).toMatch(/(^|\s)rounded/);
  });

  it("steps the rail elevation one direction from rest to selected", async () => {
    const user = userEvent.setup();
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    const pane = within(await screen.findByRole("dialog"));

    // The rail carries neither fill nor border — it sits on the modal
    // surface, and the selected row's tint is the only delimitation.
    const rail = pane.getByRole("group", { name: "Your decks" });
    expect(rail.className).not.toContain("bg-surface");
    expect(rail.className).not.toContain("border");

    // Rest → hover → selected lightens: modal surface, surface-2, surface-3.
    const selected = pane.getByRole("button", { name: /Straw Hat Rush/ });
    const unselected = pane.getByRole("button", { name: /Kid Rush/ });
    expect(selected.getAttribute("aria-pressed")).toBe("true");
    expect(selected.className).toContain("bg-surface-3");
    expect(unselected.className).not.toContain("bg-surface-3");
    expect(unselected.className).toContain("hover:bg-surface-2");
  });

  it("renders the card tooltip as a Tier-5 information surface", async () => {
    const user = userEvent.setup();
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    const dialog = await screen.findByRole("dialog");
    const zoro = await within(dialog).findByRole("button", {
      name: "Roronoa Zoro, 4 copies",
    });

    zoro.focus();
    await screen.findByText(/OP01-025/);

    const tooltip = document.querySelector<HTMLElement>("[data-tier5-surface]");
    expect(tooltip).not.toBeNull();
    // Square, flat, opaque, unglowing — Tier 5 opts out of panel treatment.
    expect(tooltip?.className).toContain("rounded-none");
    expect(tooltip?.className).toContain("shadow-none");
    expect(tooltip?.className).toContain("bg-surface-info");
    expect(tooltip?.className).toContain("edge-info");

    // Numeric values are white; no per-stat hue competing with card art.
    // Frame 82 anatomy puts the wide-tracked label above its value.
    const power = within(tooltip!).getByText("Power").nextElementSibling;
    expect(power?.className).toContain("text-content-primary");
    expect(tooltip?.innerHTML).not.toContain("text-green-600");
    expect(tooltip?.innerHTML).not.toContain("text-purple-600");
  });

  it("puts every card stack in the keyboard path with its tooltip", async () => {
    const user = userEvent.setup();
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    const dialog = await screen.findByRole("dialog");
    const pane = within(dialog);
    const zoro = await pane.findByRole("button", {
      name: "Roronoa Zoro, 4 copies",
    });

    // Tab order reaches the stack — it is a real button, not a bare div.
    const reached: Element[] = [];
    for (let step = 0; step < 20 && !reached.includes(zoro); step += 1) {
      await user.tab();
      if (document.activeElement) reached.push(document.activeElement);
    }
    expect(reached).toContain(zoro);

    // Radix opens the hover card on focus, so the cost/power/effect text is
    // reachable without a pointer.
    expect(await screen.findByText(/OP01-025/)).toBeDefined();
  });

  it("swaps the grid to the previewed deck without committing", async () => {
    const user = userEvent.setup();
    const props = renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /Kid Rush/ }));

    expect(
      await screen.findByRole("button", { name: "Eustass Kid, 1 copy" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Kid & Killer, 2 copies" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Damned Punk, 3 copies" })
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Roronoa Zoro/ })).toBeNull();
    expect(props.onDeckChange).not.toHaveBeenCalled();
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
    expect(
      await screen.findByRole("button", { name: "Kid & Killer, 2 copies" })
    ).toBeDefined();
    expect(props.onDeckChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Use this deck" }));

    expect(props.onDeckChange).toHaveBeenCalledWith("deck-2");
  });

  it("announces the preview pane while it loads", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    deferDeck2(() => new Promise((resolve) => (release = resolve)));
    renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /Kid Rush/ }));

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Loading Kid Rush list");

    await act(async () => {
      release(deckDetail("deck-2"));
    });
    expect(
      await screen.findByRole("button", { name: "Kid & Killer, 2 copies" })
    ).toBeDefined();
  });

  it("surfaces a retryable error instead of poisoning the deck cache", async () => {
    const user = userEvent.setup();
    failDeck2Once();
    const props = renderSeat({ deckEditable: true });

    await user.click(
      screen.getByRole("button", { name: "Change deck — Straw Hat Rush" })
    );
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /Kid Rush/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load this deck list.");
    // A failure must not read as an empty deck.
    expect(screen.queryByText("This deck has no cards yet")).toBeNull();

    // Retry refetches rather than serving a cached empty grouping.
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByRole("button", { name: "Kid & Killer, 2 copies" })
    ).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(deckRequests("deck-2")).toBe(2);

    await user.click(screen.getByRole("button", { name: "Use this deck" }));
    expect(props.onDeckChange).toHaveBeenCalledWith("deck-2");
  });

  it("retries a failed deck on the next visit to the modal", async () => {
    const user = userEvent.setup();
    failDeck2Once();
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

    expect(
      await screen.findByRole("button", { name: "Kid & Killer, 2 copies" })
    ).toBeDefined();
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
