# Solitaire Mode — Scope & Plan

**Status:** Ready to start (gate ticket OPT-298 in Todo)
**Created:** 2026-04-24
**Owner:** Cory Cunanan
**Linear project:** [Solitaire Mode](https://linear.app/optcg-sim/project/solitaire-mode-da74ba26f65a)
**Action Plan + cross-session handoffs:** [`docs/project/handoffs/solitaire-mode.md`](handoffs/solitaire-mode.md)

> This doc is the **architectural source of truth**. Ticket descriptions reference it; the handoff doc tracks ticket-by-ticket execution. Use [`/ticket OPT-XXX`](../../.claude/skills/ticket/SKILL.md) to start any of the tickets below.

---

## Summary

A single-player mode where one authenticated user picks two decks and plays both sides of a game, with the perspective auto-flipping on turn handoff. Reuses the existing game engine (Durable Object, action pipeline, effect resolver) without modification — the work is almost entirely client-side and a thin slice of new server glue.

---

## Goals

- One user selects **two decks** and plays both sides of a full OPTCG game
- Turns auto-alternate on phase END (already true in the engine)
- Useful for **playtesting deck matchups, learning interactions, recording scenarios, testing new effect schemas**

## Non-goals (v1)

- AI opponent (this is solitaire, not PvE)
- Saved scenario replay / "set up a specific board state" sandbox
- Networked spectators
- Hot-seat local multiplayer (do not generalize the abstraction)
- Hotkeys for perspective flip

---

## UX flow

**Entry:** New top-level route `/solitaire`, parallel to `/lobbies`, linked from the game hub / home.

**Setup screen:**
- Two deck pickers (Side A / Side B), reusing the existing deck selector component
- "Choose starting side" radio: A / B / random
- Optional cosmetic coin-flip button
- **Start Game** → creates the game and routes to `/game/[id]?mode=solitaire`

**In-game:**
- Reuse `board-scaffold.tsx` unchanged. Visual convention stays: **controlled side at bottom**.
- **Perspective auto-flips on turn end** so the newly active side is always at the bottom
- **Manual "Flip perspective" button** in the game header for reactive decisions on the inactive side (blockers, counters, trigger reveals)
- **Reactive prompts auto-flip** to the side being prompted
- **"Solitaire" badge** in the header so the player is never confused about mode
- Concede ends the whole game (no per-side concede)

### Flip animation

Simple fade-to-black, fade-back-in. **No 3D rotation, no perspective transform, no card-flip metaphor.** The board is the same board — only "which side is mine" changes — so the transition should communicate "scene cut", not "physical rotation".

Approximate timing: ~150ms fade-out, brief hold, ~150ms fade-in. Use existing motion presets from M5 Phase 0; do not introduce new easing curves.

---

## Architecture — recommended approach

**One browser session, two WebSocket connections, zero engine changes.**

1. **`POST /api/solitaire/start`** — mirrors the relevant parts of `src/app/api/lobbies/join/route.ts`:
   - `player1Id === player2Id === session.user.id`
   - Creates `game_sessions` row with a `mode: "SOLITAIRE"` marker (new column or metadata JSON)
   - Posts the standard `GameInitPayload` to the DO — DO is unchanged
2. **Token minting** — extend `/api/game/token` to accept `?playerIndex=0|1` and embed it as a JWT claim. The DO currently resolves `playerIndex` by matching `userId` against the two slots (`workers/game/src/GameSession.ts:746-762`); with identical user IDs in solitaire it must trust the explicit claim. **Gate this on `mode === "SOLITAIRE"` in the DO's token validator** so it can't be used as a seat-swap exploit in normal games.
3. **Client opens two WebSockets** (one per index). The DO already supports multiple WS per player and runs `filterStateForPlayer` per connection — so each WS naturally receives its own side's full hand/deck/life. The client renders whichever side matches the current perspective.
4. **Action sending** routes through the WS matching the current perspective. Reactive prompts carry a `playerIndex`, which tells the client which WS to respond on and triggers the auto-flip.

### Why not the alternatives

- **God-mode single view** (one WS, see-everything flag) would require disabling `filterStateForPlayer` for solo, adding a new action-submission path that declares its side, and breaking an otherwise clean invariant. Higher server risk for no UX gain.
- **Server-side AI / scripted opponent** is a different feature (PvE), not solitaire.

---

## Decisions (locked in)

| # | Question | Decision |
|---|----------|----------|
| 1 | Should solitaire games persist in game history? | **Yes**, filtered by `mode` so they don't contaminate any future stats/ranking. |
| 2 | Can Side A and Side B be the same deck? | **Yes** — mirror-match testing is a core use case. |
| 3 | Refresh / reconnect behavior? | Refresh reopens both WS. Perspective resets to whichever side is currently active. |
| 4 | "Pause & study" mode (halt auto-flip)? | **No** — the manual Flip button covers it. |
| 5 | Hotkeys for perspective flip? | **Deferred.** |

---

## Phased plan

Tickets are tracked in the [Solitaire Mode Linear project](https://linear.app/optcg-sim/project/solitaire-mode-da74ba26f65a). Execution order, status, and inter-ticket handoffs live in [`handoffs/solitaire-mode.md`](handoffs/solitaire-mode.md).

| Phase | Ticket | Title | Estimate |
|-------|--------|-------|----------|
| 1 — Backend | [OPT-298](https://linear.app/optcg-sim/issue/OPT-298) | Init endpoint + token `playerIndex` claim + `mode` column | 3 pts (~2–3 days) |
| 2 — Refactor | [OPT-300](https://linear.app/optcg-sim/issue/OPT-300) | Make `use-game-session` safe to mount twice in one tree | 2 pts (~1–2 days) |
| 2 — Entry UX | [OPT-299](https://linear.app/optcg-sim/issue/OPT-299) | `/solitaire` route + dual deck picker | 2 pts (~1–2 days) |
| 3 — Composite hook | [OPT-301](https://linear.app/optcg-sim/issue/OPT-301) | `useSolitaireSession` + perspective state machine | 3 pts (~1.5–2 days) |
| 3 — Board wiring | [OPT-302](https://linear.app/optcg-sim/issue/OPT-302) | Mode branch + Flip button + fade-to-black | 3 pts (~1–1.5 days) |
| 4 — Polish | [OPT-303](https://linear.app/optcg-sim/issue/OPT-303) | History filter, lobby/feed exclusion, refresh QA, dogfood | 2 pts (~1–2 days) |

**Total estimate: ~1.5–2 weeks of focused work.** OPT-298 is the gate ticket; everything else depends on it. OPT-299 (entry UX) and OPT-300 (refactor) can be done in parallel once OPT-298 lands. OPT-303 dogfoods the entire flow and closes the project.

---

## Risks & watch-outs

- **Dual-WS state management is the main risk.** Two reducers receiving updates from two sockets can produce visual glitches during the perspective swap if events arrive out of order. **Mitigation:** serialize perspective transitions on the `turn.activePlayerIndex` change, not on raw WS events. The fade-to-black naturally hides any transient mismatch.
- **`playerIndex` token claim is a privilege escalation primitive** if leaked into normal games. The DO must accept it **only when the game's `mode === "SOLITAIRE"`**. Add an integration test for the negative case.
- **Reactive prompts during the inactive side's turn** (block, counter, trigger reveal) are the usability cliff. Auto-flip-on-prompt must be tested against every prompt type in `workers/game/src/engine/prompts.ts` — none should silently target the wrong side.
- **Don't generalize.** Resist the urge to make this a general "multi-seat" abstraction. Solitaire is the feature; hot-seat / shared-screen / async play are separate products.

---

## Touchpoints reference

Quick map of files most likely to be touched, mapped to the ticket that owns each change:

| Layer | File | Change | Ticket |
|-------|------|--------|--------|
| DB schema | `prisma/schema.prisma` | Add `mode` to `game_sessions` | [OPT-298](https://linear.app/optcg-sim/issue/OPT-298) |
| API | `src/app/api/solitaire/start/route.ts` | New | [OPT-298](https://linear.app/optcg-sim/issue/OPT-298) |
| API | `src/app/api/game/token/route.ts` | Accept `playerIndex` query param | [OPT-298](https://linear.app/optcg-sim/issue/OPT-298) |
| Worker | `workers/game/src/GameSession.ts` (~746–762) | Trust `playerIndex` claim when mode is solitaire | [OPT-298](https://linear.app/optcg-sim/issue/OPT-298) |
| Hook | `src/hooks/use-game-session.ts` | Refactor to support two instances per tree | [OPT-300](https://linear.app/optcg-sim/issue/OPT-300) |
| Page | `src/app/solitaire/page.tsx` | New — entry route + dual deck picker | [OPT-299](https://linear.app/optcg-sim/issue/OPT-299) |
| Component | `src/components/nav/navbar.tsx` (likely) | Add Solitaire entry point | [OPT-299](https://linear.app/optcg-sim/issue/OPT-299) |
| Hook | `src/hooks/use-solitaire-session.ts` | New — composite owning both WS + perspective state | [OPT-301](https://linear.app/optcg-sim/issue/OPT-301) |
| Page | `src/app/game/[id]/page.tsx` | Branch on `mode=solitaire` query param | [OPT-302](https://linear.app/optcg-sim/issue/OPT-302) |
| Component | `src/components/game/board-scaffold.tsx` | No structural change; consume perspective from hook | [OPT-302](https://linear.app/optcg-sim/issue/OPT-302) |
| Component | Game header (likely `game-ui.tsx`) | Solitaire badge + Flip button + side-turn banner | [OPT-302](https://linear.app/optcg-sim/issue/OPT-302) |
| Component | New fade-to-black overlay | New `<motion.div>` overlay above board | [OPT-302](https://linear.app/optcg-sim/issue/OPT-302) |
| Surface audits | `src/components/social/*`, `src/app/lobbies/*` | Filter out `mode === "SOLITAIRE"` | [OPT-303](https://linear.app/optcg-sim/issue/OPT-303) |
| Docs | `CLAUDE.md` | Light update — add `src/app/solitaire/` to directory map | [OPT-303](https://linear.app/optcg-sim/issue/OPT-303) |
