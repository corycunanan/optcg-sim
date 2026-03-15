# OPTCG Simulator — Learnings

A running log of decisions, discoveries, and hard-won lessons accumulated as the project grows. Add entries as you encounter them — rule of thumb: if you had to stop and think about it, or if it would surprise a future contributor, write it down.

---

## Format

Each entry should include:
- **Date** — when this was discovered/decided
- **Area** — which part of the system it applies to (e.g. Data Pipeline, Effect Engine, Deck Builder)
- **Learning** — what was learned or decided, and why

---

## Entries

### 2026-03-15 — Data Model: `subtype` renamed to `traits`

**Area:** Card Data Model

The `subtype` field was renamed to `traits` to better reflect OPTCG terminology. In the game, the bracketed text on cards (e.g. `[Straw Hat Crew]`) is officially referred to as "traits," not subtypes. Using the game's own vocabulary reduces cognitive load and avoids confusion with other TCG conventions.

---

### 2026-03-15 — Data Model: `set` added to `ArtVariant`

**Area:** Card Data Model

`ArtVariant` now includes a `set` field because alternate art versions of a card (e.g. Parallel, SEC) are sometimes released in a different set than the base card. Without this field, it was impossible to correctly attribute a variant to its release set.

---

<!-- Add new entries above this line -->
