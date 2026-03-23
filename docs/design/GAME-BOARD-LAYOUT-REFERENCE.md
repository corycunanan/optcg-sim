# OPTCG Simulator — Game Board Layout Reference
_Created 2026-03-23_

---

## Purpose

This document captures the **geometry, proportions, and responsive behavior** established during the wireframe scaffold pass for the game board.

It is intentionally biased toward engineering implementation, but it should also be usable by design when evaluating future gameplay layouts.

The goal is **not** to freeze the exact scaffold implementation forever. The goal is to preserve:

- the proportions that felt correct
- the spacing rules that produced a usable board
- the responsive scaling behavior that survived iteration
- the implementation lessons learned from what did and did not work

This should serve as the starting reference for the next session that builds the actual gameplay environment.

---

## What This Reference Covers

- Native board geometry
- Relative proportions between zones
- Hand-to-board spacing requirements
- Viewport packing and scaling behavior
- Layering behavior for navbar, board, and hands
- Lessons learned from failed approaches in this pass

This document does **not** prescribe:

- final visual styling
- final production component structure
- final game HUD/control layout
- final animation behavior
- exact production DOM structure

---

## Reference Coordinate System

The successful wireframe pass ended up using two different conceptual bounds:

1. A **board-content bounding box** used for scaling the actual play area.
2. Separate **hand layers** that are scaled with the board but positioned independently from it.

This distinction is important. One of the main failures in this pass came from scaling the board against the old full-screen mockup instead of scaling it against the actual board-content bounds.

### Native Dimensions

These are the current reference dimensions used in `src/components/game/board-scaffold.tsx`:

| Token | Value | Meaning |
|---|---:|---|
| `SCREEN_W` | `1280` | Legacy scaffold width reference; still used by hand wrappers |
| `SCREEN_H` | `832` | Legacy scaffold height reference |
| `NAVBAR_H` | `48` | Fixed top navbar height |
| `SQUARE` | `112` | Base square used by life, deck, trash, leader, character slots |
| `HAND_CARD_W` | `84` | Hand card width |
| `HAND_CARD_H` | `118` | Hand card height |
| `MID_ZONE_H` | `64` | Center strip for controls/prompts/phase info |
| `CHAR_ROW_GAP` | `10` | Gap between adjacent character slots |
| `ZONE_GAP` | `32` | Gap between side zones and center field |
| `ROW_GAP` | `20` | Vertical gap between leader row and character row |
| `LEADER_GAP` | `10` | Gap used around leader in the top/bottom center row |
| `SIDE_ZONE_GAP` | `12` | Vertical gap between deck and trash stacks |

### Derived Board Bounds

| Token | Value | Formula |
|---|---:|---|
| `CHAR_ROW_W` | `600` | `5 * SQUARE + 4 * CHAR_ROW_GAP` |
| `FIELD_W` | `888` | `SQUARE + ZONE_GAP + CHAR_ROW_W + ZONE_GAP + SQUARE` |
| `FIELD_H` | `244` | `SQUARE + ROW_GAP + SQUARE` |
| `BOARD_CONTENT_H` | `552` | `FIELD_H + MID_ZONE_H + FIELD_H` |

### Why `FIELD_W x BOARD_CONTENT_H` Matters

The board should scale from:

- width: `FIELD_W = 888`
- height: `BOARD_CONTENT_H = 552`

Not from the older `1280 x 832` mockup rectangle.

That older full-canvas reference included extra top/bottom space that made the actual play zones shrink more than necessary. Once the board scale was based on the real play-area bounds instead, the proportions became much closer to the desired result.

---

## Board Geometry

### Horizontal Structure

Each half of the board uses a 3-part structure:

- one side zone column
- one center field block
- one opposite side zone column

Opponent half:

- `[Zone 3] gap [Zone 2] gap [Zone 1]`

Player half:

- `[Zone 1] gap [Zone 2] gap [Zone 3]`

### Zone Definitions

| Zone | Contents |
|---|---|
| Zone 1 | Life |
| Zone 2 | Characters, Leader, Stage, DON |
| Zone 3 | Deck, Trash |
| Zone 4 | Hand |

### Center Field

The center field has two rows per side:

- Leader row
- Character row

#### Opponent

- top row: `STG / LDR / DON`
- bottom row: `C1 / C2 / C3 / C4 / C5`

#### Player

- top row: `C1 / C2 / C3 / C4 / C5`
- bottom row: `DON / LDR / STG`

### Internal Positioning Rules

- Side zones are square-aligned to the board edges.
- Life occupies a single square in the outer column.
- Deck and trash are vertically stacked with `SIDE_ZONE_GAP = 12`.
- Character row is five evenly spaced squares.
- Leader is centered optically in the middle field band.
- Stage and DON stretch to fill the remaining width on either side of leader, with `LEADER_GAP = 10`.
- Mid-zone spans the full board width and divides opponent and player halves.

---

## Proportions Worth Preserving

These are the proportions that seemed to hold up through iteration and should be treated as the default template unless future gameplay requirements force a change.

### Slot Sizing

- Core board slots are `112 x 112`.
- Hand cards are smaller than board slots: `84 x 118`.
- Hand cards should read as cards, not board tiles.
- Board slots should remain visually dominant over hands.

### Horizontal Rhythm

- Side zone columns feel correct at one square wide.
- `ZONE_GAP = 32` provides enough separation between side columns and the center field.
- `CHAR_ROW_GAP = 10` gives the character line enough readability without making the row feel fragmented.

### Vertical Rhythm

- `ROW_GAP = 20` is enough separation between the leader row and the character row.
- `MID_ZONE_H = 64` is a workable placeholder height for prompts, controls, or phase readouts.
- The board does not need extra decorative breathing room above or below its own bounds if hands are treated as separate layers.

---

## Responsive Scaling Behavior

### Desired Behavior

The successful target behavior for this scaffold is:

- navbar pinned to the top of the viewport
- opponent hand allowed to overlap the navbar area
- board scaled as large as possible
- player hand fully visible
- board and hands scale uniformly
- at least `30px` between opponent hand and board
- at least `30px` between board and player hand
- `20px` margin between player hand and bottom of viewport

### Important Constraint

The hands and board should scale together as one proportional system, but they should not be treated as one single DOM/canvas block for positioning.

That means:

- **scale is linked**
- **placement is layered**

This distinction produced better results than trying to center one giant board-plus-hands rectangle.

### Current Packing Formula

The current scaffold computes a uniform scale from the tighter of:

- viewport width budget
- viewport height budget

The height budget assumes:

- one opponent hand
- `30px` minimum gap
- board content
- `30px` minimum gap
- one player hand
- `20px` viewport bottom margin

Conceptually:

```text
scale <= min(
  viewportWidth / FIELD_W,
  (viewportHeight - playerHandViewportMargin - 2 * minHandBoardGap) /
    (BOARD_CONTENT_H + 2 * HAND_CARD_H)
)
```

With the current constants:

- `FIELD_W = 888`
- `BOARD_CONTENT_H = 552`
- `HAND_CARD_H = 118`
- `MIN_HAND_BOARD_GAP = 30`
- `PLAYER_HAND_VIEWPORT_MARGIN = 20`

### Placement Rules

The board is positioned from the packed vertical budget, not centered blindly around the viewport midpoint.

Conceptually:

```text
boardBottom =
  viewportHeight
  - bottomMargin
  - scaledHandHeight
  - minGap

boardTop = boardBottom - scaledBoardHeight

playerHandTop = boardBottom + minGap
opponentHandTop = 0
```

This produces a layout where:

- the board can shift vertically if needed
- the board does not shrink more than necessary
- the player hand remains fully visible
- the top hand can tuck under the navbar

---

## Layering Rules

The current layering model is the right conceptual starting point:

1. Navbar
2. Opponent hand
3. Board
4. Player hand

In practice:

- navbar should stay visually above the opponent hand
- opponent hand should remain above the board
- hands should not be clipped by the board layer

### Navbar

- pinned to top of viewport
- fixed height: `48px`
- should not be pushed down by scaling

### Opponent Hand

- horizontally centered
- scaled with the board
- positioned independently from board geometry
- allowed to overlap the navbar area
- must still maintain at least `30px` to the top edge of the scaled board

### Board

- centered horizontally
- vertically packed to maximize scale while preserving hand spacing rules
- scaled from `FIELD_W x BOARD_CONTENT_H`, not from the old full mockup canvas

### Player Hand

- horizontally centered
- scaled with the board
- positioned independently from board geometry
- must maintain at least `30px` from the board
- must keep `20px` bottom viewport margin
- must be fully visible on first load, not only after resize

---

## Engineering Lessons Learned

### 1. Do not scale from the legacy full-screen canvas

This was the biggest geometry mistake.

Scaling from `1280 x 832` made the board appear too small because the old mockup rectangle included space that no longer belongs to the board once hands become independent layers.

**Correct approach:** scale from the actual board-content bounds.

### 2. Do not center one giant board-plus-hands block

Treating the entire experience as one centered rectangle created multiple problems:

- navbar clipping
- awkward top whitespace
- hand visibility issues
- unnecessary shrinkage

**Correct approach:** use separate layers with a shared scale.

### 3. Uniform scaling is correct; unified positioning is not

The hands should remain linked to the board in scale, but not forced into the same parent box for placement.

This was the most important conceptual distinction that emerged in this pass.

### 4. Initial viewport measurement matters

One bug in this pass only appeared on refresh: the player hand clipped on first load, then corrected itself after window resize.

The fix was to synchronize layout from viewport dimensions during layout/hydration rather than relying only on post-paint resize behavior.

Current implementation detail:

- use `useLayoutEffect`
- prefer `window.visualViewport` when available
- fall back to `document.documentElement.clientWidth/clientHeight`

### 5. Board geometry was stable before responsive logic became stable

The proportions of the board itself became correct earlier than the responsive system around it.

That means future work should preserve the board geometry first, then iterate on placement logic around it.

### 6. Top-hand visibility depends on layering, not just math

At one point the opponent hand existed in the DOM but was hidden behind the board layer. Positioning alone was not enough; z-order mattered.

Future implementations should explicitly think about:

- stacking context
- clipping
- navbar overlap

---

## What The Next Gameplay Build Should Keep

If the next session rebuilds the actual gameplay environment from scratch, these parts should be treated as the baseline:

- `112px` square board slots
- `84 x 118` hand cards
- `32px` side-zone to field gap
- `10px` character gap
- `20px` leader/character row gap
- `12px` deck/trash stack gap
- `64px` mid-zone strip height
- board scale derived from actual play-area bounds
- hand layers positioned independently
- uniform board/hand scaling
- `30px` minimum board-to-hand spacing
- `20px` bottom margin under player hand
- pinned navbar with opponent-hand overlap allowed

---

## What The Next Gameplay Build Can Change Safely

The next implementation does **not** need to preserve the exact scaffold code or wrapper structure.

These are safe to revisit:

- whether the hand wrappers still use the legacy `SCREEN_W`
- exact DOM structure of layering containers
- whether the navbar remains part of the game route shell or moves elsewhere
- whether the mid-zone becomes split into multiple sub-panels
- whether hands fan, overlap, animate, or become interactive
- whether additional board-adjacent HUD regions are introduced

As long as the preserved proportions and spacing rules remain intact, the actual game environment can evolve substantially.

---

## Open Questions For The Real Game Environment

- Should the real board continue using strict square placeholders, or should some zones transition to card-ratio containers?
- Should the mid-zone remain a single full-width strip, or become separate action, prompt, and phase regions?
- Should hand count remain visually constant-width, or compress/overlap once cards exceed five?
- Should the production board reserve permanent space for side panels, logs, chat, or turn history instead of packing purely to the viewport?
- Should mobile/tablet layouts preserve the same structure or switch to a different arrangement entirely?

This document does not answer those questions. It only preserves the geometric baseline that felt right during the wireframe pass.

---

## Recommended Next-Session Usage

When the real gameplay environment is built:

1. Start from the proportions in this document, not from the old full-screen scaffold canvas.
2. Treat board content and hands as separate positioned layers.
3. Preserve the spacing and scaling rules first.
4. Rebuild the actual game HUD and interactions on top of that geometry.

That should avoid repeating most of the trial-and-error that happened in this wireframe session.
