# OPTCG Simulator — Interruption Modals
_Created 2026-03-25 · Rewritten 2026-09-07 for the shared prompt frame_

---

## Purpose

This document defines the design, behavior, and component structure for **interruption modals** — UI overlays that block gameplay and require a player to make a decision before the game can continue.

Modals correspond to server-sent `game:prompt` events. Five of the seven `PromptType` values render as modals; the other two (`SELECT_BLOCKER`, `REDISTRIBUTE_DON`) are in-board affordances covered by `docs/design/INTERACTION-GRAMMAR.md`. A `SELECT_TARGET` prompt whose candidates all sit on the battlefield also resolves in place on the board, with the same Confirm and Skip actions in the mid-zone.

---

## The shared frame

Every modal renders through `src/components/game/effect-prompt-dialog.tsx`. One frame, one order, one pair of actions:

```
┌─────────────────────────────────────────────────────┐
│  Card Effect: On Play                     [ Hide ]   │  ← title
│─────────────────────────────────────────────────────│
│  Monkey.D.Luffy                                      │  ← source card name
│  [On Play] Look at 5 cards from the top of your      │  ← effect text
│  deck; play up to 1 {Straw Hat Crew} Character.      │
│                                                      │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  │  ← selectable content
│  │      │  │ ████ │  │      │  │      │  │      │  │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  │
│─────────────────────────────────────────────────────│
│  1 of 1 selected                  [ Skip ] [Confirm] │  ← status + actions
└─────────────────────────────────────────────────────┘
```

1. **Title** — `Card Effect: <effect type>`. The effect type is the leading timing token of the effect text (`On Play`, `Activate: Main`, `When Attacking`, `Trigger`, `Counter`). A `[DON!! x1]` or `[Once Per Turn]` prefix is skipped. When the description opens with prose (cost payment, a choice question), the title is `Card Effect`. Helper: `promptDialogTitle` in `src/lib/game/prompt-presentation.ts`.
2. **Source card name** — the printed name of the card whose effect raised the prompt. The session attaches `sourceCard` to every effect prompt right before sending it (`workers/game/src/engine/prompt-source.ts`); the client looks the name up in `cardDb`. Blocker and pregame prompts have no source and omit the line.
3. **Effect text** — the prompt's `effectDescription`, rendered through `EffectText` so notation chips match the printed card. A prompt may add one secondary line under it (a source effect for trigger ordering, an instruction for Skip).
4. **Selectable content** — cards, choice rows, or steppers. This is the only part that varies by prompt type.
5. **Footer** — a status string on the left (`1 of 2 selected`, `Choose up to 2`), then **[Skip] [Confirm]** on the right. The labels never change. Confirm is disabled until the selection is valid. Skip is always rendered; it is disabled when the prompt cannot be declined.

### Hide
- Every modal has a **[Hide]** button in the header. Hiding collapses the modal and returns the player to the board.
- While hidden, board actions stay disabled and the mid-zone shows `⚡ ACTION REQUIRED [Show Prompt]`. Show reopens the modal with its selection intact.
- There is no full dismiss. The prompt closes only when Skip or Confirm sends a valid response.

### Opponent view
- While a prompt is active for one player, the other sees a non-interactive waiting state on the mid-zone.
- Card faces inside modals are never visible to the opponent. Spectator visibility follows `workers/game/src/engine/visibility.ts`.

---

## Per-prompt content and actions

| Prompt type | Content | Skip | Confirm |
|---|---|---|---|
| `SELECT_TARGET` | Card grid, max 5 per row, scrolls vertically. Invalid targets are dimmed and inert. Status shows the count rule and the running count or aggregate. | Sends an empty selection. Enabled only when `countMin` is 0. | Sends the selected instance ids. Enabled when count, aggregate, uniqueness, and dual-slot rules pass. |
| `ARRANGE_TOP_CARDS` step 1 | Revealed cards in a draggable row. Click toggles a pick, up to `maxKeep`. Cards outside `validTargets` are dimmed. | Keeps nothing and moves to step 2. Enabled for "up to N" effects (`validTargets` present or `maxKeep` > 1). | Locks the picks and moves to step 2. If no cards remain and the destination is fixed, submits immediately. |
| `ARRANGE_TOP_CARDS` step 2 | Remaining cards, drag to reorder; leftmost is the top of the deck. When both top and bottom are legal, a Top/Bottom toggle sits under the row. | Disabled. | Submits picks, order, and destination. Disabled until a destination is chosen. |
| `PLAYER_CHOICE` | Full-width option rows. Clicking a row selects it; nothing is sent on click. Disabled rows read `— Resolved`. DON!! return prompts show a stepper per source with an `x of n selected` status. | Sends the `skip` choice. Enabled only when the prompt is `confirmOrSkip`. | Sends the selected choice id. Disabled until a row is selected, or until the DON!! count matches. |
| `OPTIONAL_EFFECT` | The source card. | Declines the effect (`PASS`). | Activates the effect; may chain into the next prompt. |
| `REVEAL_TRIGGER` | The revealed Life card, with the note "Skip adds the card to your hand without activating its trigger." | Adds the card to hand. | Reveals and activates the trigger. |

Pregame decisions (`PLAYER_CHOICE` with `source: "PREGAME"`) are owned by `PregameOverlay` and do not use this frame.

---

## Prompt chaining

Some prompts resolve into a subsequent prompt (`OPTIONAL_EFFECT` → `SELECT_TARGET`). The current modal closes, the next opens immediately, and the mid-zone `ACTION REQUIRED` state persists through the chain. Each modal is keyed on its prompt identity so selection state never leaks between prompts.

---

## Wire contract

`PromptOptions` in `shared/game-types.ts`. Every effect prompt carries:

```ts
effectDescription: string;        // effect text, timing token first
sourceCard?: { cardId: string; instanceId: string };
```

`SelectTargetPrompt.ctaLabel` is still sent by the worker but the client no longer reads it; the confirm label is fixed. It can be removed from the wire in a follow-up.
