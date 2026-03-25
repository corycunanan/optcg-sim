# OPTCG Simulator — Interruption Modals
_Created 2026-03-25_

---

## Purpose

This document defines the design, behavior, and component structure for **interruption modals** — UI overlays that block gameplay and require the active player to make a decision before the game can continue.

These modals correspond to server-sent `game:prompt` events and map 1:1 to `PromptType` values.

---

## Shared Behavior

All interruption modals share the following behavior:

### Dismissible (Hide)
- Every modal has a **[ Hide ]** button in the header.
- Hiding collapses the modal and returns the player to the board view.
- While hidden, **all board actions are disabled**.
- The mid-zone displays a persistent locked state:
  ```
  ⚡ ACTION REQUIRED   [ Show Prompt ]
  ```
- Clicking "Show Prompt" reopens the modal in its prior state (selections preserved).
- There is no full-dismiss — the modal cannot be closed until a valid choice is submitted.

### Header
- Left: effect description string (e.g., "Look at the top 4 cards of your deck")
- Right: **[ Hide ]** button

### Footer
- Contains 1–2 CTA buttons aligned to the right.
- CTAs are disabled until the minimum selection requirement is met (where applicable).
- Exception: **PLAYER_CHOICE** has no footer — selecting an option submits immediately.

### Opponent View
- While a prompt is active for the active player, the opponent sees a non-interactive "Waiting for opponent..." overlay on the mid-zone.
- Card faces inside modals are never visible to the opponent.

---

## Modal Specifications

---

### 1. ARRANGE_TOP_CARDS

**Prompt type:** `ARRANGE_TOP_CARDS`

A two-step flow triggered by effects that say "look at the top N cards of your deck, add 1 to your hand, then put the rest on top or bottom."

**Step 1 — Select a card to keep**

```
┌─────────────────────────────────────────────────────┐
│  Look at the top 4 cards                  [ Hide ]   │
│─────────────────────────────────────────────────────│
│                                                      │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐            │
│  │      │  │      │  │ ████ │  │      │            │
│  │      │  │      │  │ ████ │  │      │            │
│  │      │  │      │  │      │  │      │            │
│  └──────┘  └──────┘  └──────┘  └──────┘            │
│               ↑ drag to reorder   ↑ selected         │
│                                                      │
│─────────────────────────────────────────────────────│
│                              [ Add Card to Hand ]    │
└─────────────────────────────────────────────────────┘
```

- Cards are displayed in a horizontal row and are **drag-to-reorder**.
- Click a card to select it (highlighted). Only one card can be selected at a time.
- CTA is disabled until a card is selected.
- Clicking "Add Card to Hand" removes the selected card from the row and advances to Step 2.
- The order of remaining cards carries over into Step 2 (gap closed).

**Step 2 — Order and send remaining cards**

```
┌─────────────────────────────────────────────────────┐
│  Put the remaining 3 cards back        [ Hide ]      │
│─────────────────────────────────────────────────────│
│                                                      │
│  ┌──────┐  ┌──────┐  ┌──────┐                      │
│  │      │  │      │  │      │                      │
│  │      │  │      │  │      │                      │
│  │      │  │      │  │      │                      │
│  └──────┘  └──────┘  └──────┘                      │
│  ← top of deck             bottom of deck →          │
│                                                      │
│─────────────────────────────────────────────────────│
│              [ Send to Bottom ]  [ Send to Top ]     │
└─────────────────────────────────────────────────────┘
```

- Cards arrive in the order established in Step 1.
- Still drag-to-reorder. Leftmost card = top of deck.
- No per-card top/bottom toggle — all cards go to the same destination.
- Both CTAs are always enabled. Clicking either submits immediately.

**PromptOptions shape:**
```ts
{
  cards: CardInstance[];
  effectDescription: string;
  canSendToBottom: boolean; // if false, Step 2 only shows "Send to Top"
}
```

---

### 2. SELECT_TARGET

**Prompt type:** `SELECT_TARGET`

Used when an effect requires the player to select one or more cards from a pool (hand, trash, deck, or field cards not selectable via board interaction).

```
┌─────────────────────────────────────────────────────┐
│  Select 2 Characters with cost 3 or less  [ Hide ]  │
│─────────────────────────────────────────────────────│
│ ┌─────────────────────────────────────────────────┐ │
│ │ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐             │ │
│ │ │    │ │████│ │    │ │    │ │    │             │ │
│ │ │    │ │████│ │    │ │    │ │    │             │ │
│ │ └────┘ └────┘ └────┘ └────┘ └────┘             │ │
│ │ ┌────┐ ┌────┐ ┌────┐                           │ │
│ │ │    │ │    │ │    │  ↑ scrolls if more rows   │ │
│ │ │    │ │    │ │    │                            │ │
│ │ └────┘ └────┘ └────┘                            │ │
│ └──────────────────────────── (scrollable body) ──┘ │
│  Selected: 1 of 2                                    │
│─────────────────────────────────────────────────────│
│                               [ Confirm Selection ]  │
└─────────────────────────────────────────────────────┘
```

- Card grid: **maximum 5 cards per row**.
- Body is a **fixed-height scrollable container** — overflows vertically, never horizontally.
- Invalid targets are visually grayed out and non-interactive.
- Selected count is shown above the footer.
- CTA label varies by effect action (e.g., "Add to Hand", "Trash Selected", "Confirm Selection").
- CTA is disabled until the minimum selection count is met.
- For single-select effects, confirming immediately after selection is valid.

**PromptOptions shape:**
```ts
{
  cards: CardInstance[];
  effectDescription: string;
  countMin: number;
  countMax: number;
  ctaLabel: string; // e.g. "Add to Hand", "Confirm Selection"
}
```

---

### 3. PLAYER_CHOICE

**Prompt type:** `PLAYER_CHOICE`

Used when an effect offers the player a choice between 2–3 discrete named options.

```
┌─────────────────────────────────────────────────────┐
│  Choose an effect                         [ Hide ]   │
│─────────────────────────────────────────────────────│
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  Draw 2 cards                               │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  Give 1 DON!! to your Leader                │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │  Return 1 opponent's Character to hand      │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

- **No footer.** Clicking an option submits the choice immediately.
- Options are full-width tap targets.
- Maximum 3 options (per OPTCG rules structure).
- Hide is still available in the header.

**PromptOptions shape:**
```ts
{
  effectDescription: string;
  choices: { id: string; label: string }[];
}
```

---

### 4. OPTIONAL_EFFECT

**Prompt type:** `OPTIONAL_EFFECT`

Used when a triggered or activated effect is flagged as optional (`flags.optional = true`). The player may activate or skip it.

```
┌─────────────────────────────────────────────────────┐
│  Optional effect triggered                [ Hide ]   │
│─────────────────────────────────────────────────────│
│                                                      │
│  ┌──────────┐   Card Name                           │
│  │          │   ───────────────────────────────     │
│  │          │   You may KO 1 of your Characters.    │
│  │ card art │   If you do, draw 2 cards.            │
│  │          │                                       │
│  │          │                                       │
│  └──────────┘                                       │
│                                                      │
│─────────────────────────────────────────────────────│
│                        [ Skip ]  [ Activate ]        │
└─────────────────────────────────────────────────────┘
```

- Card art displayed on the left (portrait orientation).
- Card name and effect text displayed on the right.
- "Skip" dismisses the effect without resolving it.
- "Activate" resolves the effect — may chain into a subsequent prompt (e.g., SELECT_TARGET) if the effect requires targeting.

**PromptOptions shape:**
```ts
{
  sourceCard: CardInstance;
  effectDescription: string; // human-readable effect text
}
```

---

### 5. REVEAL_TRIGGER

**Prompt type:** `REVEAL_TRIGGER`

Used when a life card is revealed during damage and has a TRIGGER keyword effect. The player chooses to activate the effect or simply add the card to hand.

```
┌─────────────────────────────────────────────────────┐
│  Trigger activated!                       [ Hide ]   │
│─────────────────────────────────────────────────────│
│                                                      │
│  ┌──────────┐   Card Name                           │
│  │          │   ───────────────────────────────     │
│  │          │   [TRIGGER] When this card is         │
│  │ card art │   revealed from your Life cards,      │
│  │          │   you may play it for free.           │
│  │          │                                       │
│  └──────────┘                                       │
│                                                      │
│─────────────────────────────────────────────────────│
│              [ Add to Hand ]  [ Activate ]           │
└─────────────────────────────────────────────────────┘
```

- Same layout as OPTIONAL_EFFECT: card art left, text right.
- "Add to Hand" adds the card without activating the Trigger effect.
- "Activate" resolves the Trigger effect — may chain into a subsequent prompt.

**PromptOptions shape:**
```ts
{
  sourceCard: CardInstance;
  effectDescription: string;
}
```

---

## Prompt Chaining

Some prompts resolve into a subsequent prompt (e.g., OPTIONAL_EFFECT → SELECT_TARGET). When this occurs:
- The current modal closes.
- The next modal opens immediately.
- The mid-zone "ACTION REQUIRED" indicator remains active throughout the chain.

---

## Summary Table

| Modal | Prompt Type | Body | Scrollable | Footer |
|---|---|---|---|---|
| Arrange Top Cards — Step 1 | `ARRANGE_TOP_CARDS` | Card row (draggable) | No | "Add Card to Hand" |
| Arrange Top Cards — Step 2 | `ARRANGE_TOP_CARDS` | Card row (draggable) | No | "Send to Bottom / Send to Top" |
| Select Target | `SELECT_TARGET` | Card grid (max 5/row) | Yes | CTA label varies |
| Player Choice | `PLAYER_CHOICE` | Option list | No | None — click to submit |
| Optional Effect | `OPTIONAL_EFFECT` | Card art + effect text | No | "Skip / Activate" |
| Reveal Trigger | `REVEAL_TRIGGER` | Card art + effect text | No | "Add to Hand / Activate" |
