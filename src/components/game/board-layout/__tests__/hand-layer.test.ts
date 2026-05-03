// OPT-364: cards drawn into a face-up hand stayed invisible after the
// deck-to-hand flight finished, because the previous "newly arrived" tracker
// (`useFieldArrivals`) cached arrivals across every render until the hand id
// list mutated again. `computeFreshlyAdded` replaces that with a stateless
// diff against a per-`HandLayer`-instance "seen" set that's reconciled after
// each commit (in `HandLayer`'s `useEffect`).

import { describe, expect, it } from "vitest";
import { computeFreshlyAdded } from "../hand-layer";

describe("computeFreshlyAdded", () => {
  it("returns every id on the first render (seen set empty)", () => {
    const fresh = computeFreshlyAdded(new Set(), ["a", "b"]);
    expect(fresh).toEqual(new Set(["a", "b"]));
  });

  it("returns only the newly added id when one card is appended", () => {
    const fresh = computeFreshlyAdded(new Set(["a"]), ["a", "b"]);
    expect(fresh).toEqual(new Set(["b"]));
  });

  it("returns an empty set when nothing changed (the bug from OPT-364)", () => {
    // After the deck-to-hand flight commits the drawn id into seenIds, a
    // subsequent render with the same ids must not re-flag the card as
    // freshly added — otherwise it stays hidden until the next id mutation.
    const fresh = computeFreshlyAdded(new Set(["a", "b"]), ["a", "b"]);
    expect(fresh.size).toBe(0);
  });

  it("ignores removed ids — only ids new to current count as fresh", () => {
    const fresh = computeFreshlyAdded(new Set(["a", "b"]), ["a"]);
    expect(fresh.size).toBe(0);
  });

  it("handles a perspective flip where every visible id is new", () => {
    // Solitaire flips perspective from Side 1 to Side 2; HandLayer's
    // `seenIdsRef` for the new instance starts empty (the first commit will
    // populate it). On that first render every Side 2 id is "fresh", which
    // is the same situation as a fresh page render — neither hides the
    // hand permanently because the post-commit reconcile populates the set.
    const fresh = computeFreshlyAdded(new Set(), ["x", "y", "z"]);
    expect(fresh).toEqual(new Set(["x", "y", "z"]));
  });

  it("does not mutate the seen set", () => {
    const seen = new Set(["a"]);
    computeFreshlyAdded(seen, ["a", "b"]);
    expect(seen).toEqual(new Set(["a"]));
  });
});
