/**
 * Deck colour identity — the single definition shared by every surface that
 * shows colour dots for a deck.
 *
 * **Leader-inclusive.** A deck's colour identity is the union of its leader's
 * colours and its main-deck cards' colours. That matches how OPTCG players
 * describe a deck ("red/green Uta"), it matches deck legality — the main deck
 * may only contain colours the leader has — and it is what the dots visually
 * imply when they sit next to the leader art on `/decks`.
 *
 * `GET /api/decks` previously computed a leader-*exclusive* union while the
 * decks page computed a leader-*inclusive* one, so a leader-only draft deck
 * showed colours on the page and none through the API. Both call sites now go
 * through this function (OPT-617); the upcoming colour filter (OPT-620) builds
 * on the leader-inclusive definition.
 *
 * Order is first-seen, leader first, so a deck's dots lead with its leader's
 * colours.
 */
export function collectDeckColors(
  leaderColors: readonly string[],
  cardColors: readonly (readonly string[])[]
): string[] {
  const colors = new Set<string>();

  for (const color of leaderColors) colors.add(color);
  for (const list of cardColors) {
    for (const color of list) colors.add(color);
  }

  return Array.from(colors);
}
