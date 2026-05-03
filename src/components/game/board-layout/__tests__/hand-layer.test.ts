// OPT-364: cards drawn into a face-up hand stayed invisible after the
// deck-to-hand flight finished, because the previous "newly arrived" tracker
// (`useFieldArrivals`) cached arrivals across every render until the hand id
// list mutated again. `computeFreshlyAdded` replaces that with a stateless
// diff against a per-`HandLayer`-instance "seen" set, and `reconcileSeenIds`
// is the post-commit reducer that produces the next seen set (or the same
// reference when nothing changed, so React skips an extra render).

import { describe, expect, it } from "vitest";
import { computeFreshlyAdded, reconcileSeenIds } from "../hand-layer";

describe("computeFreshlyAdded", () => {
  it("returns every id when seen is empty (e.g. transient state mid-mount)", () => {
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

  it("does not mutate the seen set", () => {
    const seen = new Set(["a"]);
    computeFreshlyAdded(seen, ["a", "b"]);
    expect(seen).toEqual(new Set(["a"]));
  });
});

describe("reconcileSeenIds", () => {
  it("returns the same reference when current matches prev (avoids re-render)", () => {
    const prev = new Set(["a", "b"]);
    const next = reconcileSeenIds(prev, ["a", "b"]);
    expect(next).toBe(prev);
  });

  it("treats id-order differences as a match (set membership only)", () => {
    const prev = new Set(["a", "b"]);
    const next = reconcileSeenIds(prev, ["b", "a"]);
    expect(next).toBe(prev);
  });

  it("returns a fresh set when an id was added", () => {
    const prev = new Set(["a"]);
    const next = reconcileSeenIds(prev, ["a", "b"]);
    expect(next).not.toBe(prev);
    expect(next).toEqual(new Set(["a", "b"]));
  });

  it("returns a fresh set when an id was removed (e.g. card played)", () => {
    const prev = new Set(["a", "b"]);
    const next = reconcileSeenIds(prev, ["a"]);
    expect(next).not.toBe(prev);
    expect(next).toEqual(new Set(["a"]));
  });

  it("returns a fresh set on perspective flip (full id replacement)", () => {
    const prev = new Set(["s1a", "s1b"]);
    const next = reconcileSeenIds(prev, ["s2a", "s2b"]);
    expect(next).not.toBe(prev);
    expect(next).toEqual(new Set(["s2a", "s2b"]));
  });
});

describe("HandLayer convergence (render → commit → render)", () => {
  // These tests model the React lifecycle for `HandLayer`'s seen-set:
  //   * render N: read `seenIds`, compute `freshlyAdded` for this render
  //   * commit N: post-commit effect calls `reconcileSeenIds`, returning the
  //     next `seenIds` reference (same ref means no re-render)
  //   * render N+1: see if the next render flips the card to visible
  //
  // The pre-fix bug was that `seenIds` lived in a `useRef`, so the commit-time
  // update never scheduled the N+1 render — every initial render or
  // perspective flip would hide the entire hand permanently.

  function step(prevSeen: ReadonlySet<string>, cardIds: readonly string[]) {
    const freshlyAdded = computeFreshlyAdded(prevSeen, cardIds);
    const nextSeen = reconcileSeenIds(prevSeen, cardIds);
    return { freshlyAdded, nextSeen, scheduledRerender: nextSeen !== prevSeen };
  }

  it("reveals a drawn card on the second render after it appears", () => {
    let seen: ReadonlySet<string> = new Set(["a", "b"]);

    // Draw "c" → first render hides it (placeholder behind the flight).
    const r1 = step(seen, ["a", "b", "c"]);
    expect(r1.freshlyAdded).toEqual(new Set(["c"]));
    expect(r1.scheduledRerender).toBe(true);
    seen = r1.nextSeen;

    // Second render after commit: card no longer freshly added; visibility is
    // now driven solely by `inFlightInstanceIds` (out of scope here).
    const r2 = step(seen, ["a", "b", "c"]);
    expect(r2.freshlyAdded.size).toBe(0);
    expect(r2.scheduledRerender).toBe(false);
  });

  it("reveals every card on perspective flip after one reconcile", () => {
    // Solitaire flips perspective from Side 1 to Side 2 with both hands
    // populated. Without the state-driven reconcile, the first render hides
    // every Side 2 card and nothing schedules a re-render — cards stay
    // hidden until the player triggers another state change.
    let seen: ReadonlySet<string> = new Set(["s1a", "s1b"]);

    const r1 = step(seen, ["s2a", "s2b"]);
    expect(r1.freshlyAdded).toEqual(new Set(["s2a", "s2b"]));
    expect(r1.scheduledRerender).toBe(true);
    seen = r1.nextSeen;

    const r2 = step(seen, ["s2a", "s2b"]);
    expect(r2.freshlyAdded.size).toBe(0);
    expect(r2.scheduledRerender).toBe(false);
  });

  it("stays converged across stable renders (no extra re-render churn)", () => {
    // After convergence, repeated renders with the same id list must not
    // cycle back through hidden — and `reconcileSeenIds` must keep returning
    // the same reference so React's setState bails out of re-rendering.
    let seen: ReadonlySet<string> = new Set(["a"]);

    for (let i = 0; i < 3; i++) {
      const r = step(seen, ["a"]);
      expect(r.freshlyAdded.size).toBe(0);
      expect(r.scheduledRerender).toBe(false);
      seen = r.nextSeen;
    }
  });
});
