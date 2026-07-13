# OPTCG Simulator — Interaction Grammar & Feedback Spec

**Status:** Normative. This document is the requirements spec for the game board's interaction layer — gestures, visual signifiers, motion, and feedback. It exists so that implementation of the Interaction Design Audit project (OPT-415…422) and every future mechanic is execution against a spec, not improvisation.

**Scope:** everything inside the game board (`src/components/game/`). Companion docs:

- `BRANDING-GUIDELINES.md` §9 (motion language) and §13 (game board theming, inside-board floor) — this doc extends both into interaction specifics.
- `GAME-BOARD-LAYOUT-REFERENCE.md` — board geometry.
- `INTERRUPTION-MODALS.md` — modal/prompt structural contracts.

**How to use this doc:** requirements are numbered (`G-*` grammar, `SIG-*` signifiers, `SP-*` spotlight, `MO-*` motion, `FB-*` feedback, `IN-*` input equivalence). Tickets and PRs cite requirement IDs. If an implementation needs to deviate, the deviation is a change to this doc first, agreed in review — not a silent divergence.

---

## 1. Philosophy — how the board should feel

The board is a **physical tabletop, rendered**. Every design decision below derives from six principles:

1. **Direct manipulation.** Cards are objects, not buttons. Anything that *moves* in the physical game (playing a card, declaring an attack, attaching DON, countering) is performed by physically moving the card. The player should feel their hands on the table, not on a form.
2. **Highlights are a contract.** A glowing element means "this move is legal" — nothing more, nothing less. The client mirrors every rule it can know cheaply (OPT-417); the server stays authoritative, and rejection feedback (OPT-418) is the honest backstop. A highlight that lies — glowing for an illegal move, or staying dark for a legal one — is a correctness bug, not a polish issue.
3. **One voice per message.** Each game-state fact is communicated by exactly one visual treatment, and each treatment means exactly one thing. No stacking (scale OR shadow OR glow — per BRANDING-GUIDELINES §9), and no overloading (one color ≠ four meanings).
4. **Motion is state, never decoration.** Loops mean "the game is waiting here." One-shots mean "this just happened." Anything else is noise. (Single sanctioned exception: MO-6 breathing idle.)
5. **Immersive, not aggressive.** The board is the app's one dark, dramatic context (BRANDING-GUIDELINES §13). Motion is "more pronounced, immersive" than the chrome — but energy comes from springs and warmth (amber, gold moments), never from strobing, screen shake beyond FB-2, or hostile reds outside their semantic role.
6. **Nothing is ever instantaneous.** Every action has a visible start point and a visible end point. Cards never teleport: a card leaving a zone is seen leaving (travel flight or transform fizzle), and the destination is seen receiving it (arrival settle, or pile pop + delta indicator — MO-9). If a player can wonder "where did that go?" or "what just happened?", the motion layer has failed — that is a spec violation, not a taste difference.

**Feel targets** (use these words in review): *tactile, weighty, responsive, trustworthy.* Anti-targets: *floaty, chatty, twitchy, ambiguous.*

---

## 2. The grammar — three verbs

**Decided direction (binding, per project): drag commits, click selects, menu activates.**

| Verb | Meaning | When to use |
|---|---|---|
| **Drag** | Commit an action that moves a card's allegiance, zone, or attachment | Play card → slot, attacker → target, counter card → defending card, DON → card (attach and redistribute) |
| **Click** | Select or inspect within the current step; never commits an action by itself | Blocker toggle, in-place effect targets, zone piles to preview |
| **Menu** | Activate an ability that has no spatial representation | `[Activate: Main]` effects — opened by left-click (when the card has no other click meaning) or right-click, always with a visible ⚡ badge affordance (OPT-420) |

### Requirements

- **G-1 — New mechanics map to a verb before implementation.** The decision tree: does the action move a card's allegiance/zone/attachment? → drag. Is it a choice among visible candidates inside a step? → click. Is it invoking an ability with no spatial target? → menu. If a mechanic seems to need a fourth verb, that is a design discussion in this doc, not a new gesture in a component.
- **G-2 — Click and drag coexist on one element via the 8px activation constraint.** `PointerSensor` `activationConstraint: { distance: 8 }` (`use-board-dnd.ts:27-29`) is the sole disambiguator. Do not raise, lower, or add per-element variants.
- **G-3 — Click-selection is always a toggle, always escapable.** Clicking a selected candidate deselects it. `Escape` and click-away clear the current selection (but never submit or skip). Applies to blocker selection (OPT-416) and in-place targeting (OPT-419).
- **G-4 — Drop targets are the semantic object, never a proxy zone.** The thing you drop onto is the thing the action affects: counter Characters drop onto the *defending card* (not the trash), Events drop onto the *play surface* (G-8), DON drops onto the *receiving card*. No zone may double as an action button (`counter-trash` is removed by OPT-416).
- **G-5 — One gesture per logical act.** "Move DON" is one gesture (drag the DON token visual) whether the source is the cost area or another card. The bespoke redistribute gold bar is replaced by the DON token as drag source (OPT-416).
- **G-6 — Right-click is an alias, never the only path.** Every menu is reachable by left-click (G-1 menu verb) and keyboard (IN-2); right-click is a power-user shortcut.
- **G-7 — Commits are explicit at step boundaries.** Multi-selection steps (block, in-place targeting, DON redistribute) end with an explicit Confirm/Skip in the mid-zone — never auto-submit on selection.
- **G-8 — Events are played, not spent.** An Event's gesture is always the play gesture — drag to the player's own field — whether used in Main phase or as a `[Counter]`. On drop, the Event presents in the **spotlight** (§4) while it resolves; after resolving, it *transforms* to the trash (MO-8: fizzle from the spotlight, materialize in the trash pile). Dragging an Event to the trash is never a gesture. Character counters are the deliberate contrast: they are not played, so they drag onto the defender they boost.

### Action inventory (target state)

This is the complete verb table after OPT-416–420 land. ✅ = already conforms today; 🔧 = changes, with the owning ticket.

| Player intent | Gesture | Source → Target | Dispatch | Status |
|---|---|---|---|---|
| Play a Character | Drag | Hand card → empty character slot | `PLAY_CARD {cardInstanceId, position}` | ✅ |
| Play a Stage | Drag | Hand card → stage zone | `PLAY_CARD {cardInstanceId}` | ✅ (slot filtering: OPT-417) |
| Play an Event (`[Main]`) | Drag | Hand card → **own field**; presents in spotlight (SP-1) and fizzles to trash after resolving (MO-8) | `PLAY_CARD {cardInstanceId}` | ✅ gesture; 🔧 OPT-464 (spotlight) |
| Replace when board full | Drag | Hand card → occupied slot | `PLAY_CARD` | ✅ |
| Attach DON | Drag | DON token (cost area) → own card | `ATTACH_DON {targetInstanceId, count:1}` | ✅ |
| Redistribute DON | Drag | **DON token visual on card** → own card, then Confirm | staged → `REDISTRIBUTE_DON` | ✅ |
| Declare attack | Drag | Own active card → opponent leader / rested character | `DECLARE_ATTACK {attackerInstanceId, targetInstanceId}` | ✅ (target filtering: OPT-417) |
| Counter (Character) | Drag | Hand card → **defending card** | `USE_COUNTER {cardInstanceId, counterTargetInstanceId}` | ✅ |
| Counter (Event) | Drag | Hand card → **own field**; presents in spotlight (SP-1); defender comes from battle state | `USE_COUNTER_EVENT {cardInstanceId, counterTargetInstanceId}` | ✅ gesture; 🔧 OPT-464 (spotlight) |
| Select blocker | Click (toggle) + mid-zone **Block** | Eligible blocker | `DECLARE_BLOCKER {blockerInstanceId}` | ✅ |
| Effect target (visible on board) | Click (toggle) + mid-zone **Confirm/Skip** | Ringed candidates in place | `SELECT_TARGET {selectedInstanceIds}` | 🔧 OPT-419 (was always modal) |
| Effect target (hidden/stacked zone, or mixed) | Click in `SelectTargetModal` | Modal grid | `SELECT_TARGET` | ✅ (stays modal) |
| Activate `[Main]` effect | Menu (left-click or right-click) via ⚡ badge | Own field/stage card | `ACTIVATE_EFFECT {cardInstanceId, effectId}` | 🔧 OPT-420 (badge + left-click) |
| Inspect a pile | Click | Deck / trash / **life** | zone preview | 🔧 OPT-422 (life parity) |
| Reorder hand | Drag | Hand card ↔ hand card | local only | ✅ |
| Phase / battle-step decisions | Button | Mid-zone (`End Phase`, `Block`, `Skip`, `Pass`, `Undo`, prompt buttons) | `ADVANCE_PHASE`, `PASS`, … | ✅ |

---

## 3. Visual signifiers — the signal vocabulary

### 3.1 Semantic color roles

The four `--gb-accent-*` colors used by the interaction layer each carry **one** meaning. This resolves today's amber overload (battle rings + DON + prompts + valid-fallback all amber).

| Color | Semantic role | Used for |
|---|---|---|
| **Amber** | *Battle & resources* — "this card is in the fight / receiving a boost or DON" | Attacker ring, defender ring, counter flash, DON drop overlay, counter-onto-defender drop overlay, ⚡ prompt vocabulary, ⚡ effect badge |
| **Blue** | *Eligible candidate* — "you may select or place here" | Blocker-eligible ring, in-place target-eligible ring (OPT-419), play-card drop overlays (character slot **and** stage zone) |
| **Green** | *Confirmed / selected / go* | Selected ring (blocker, in-place target), affirmative mid-zone buttons, boosted power readout, my-turn indicator |
| **Red** | *Hostile or destructive commit* | Attack-target drop overlay, board-full replacement overlay, concede / fatal errors (chrome) |
| **Grey (neutral)** | *Unavailable right now* | Ineligible dimming (SIG-8), rejection feedback (FB-2) — never red |

Requirements:

- **SIG-1 — No new interaction colors.** The interaction layer uses exactly these five roles (four accents + neutral grey). Purple/rose stay reserved for phase labels and stats, not interaction signals.
- **SIG-2 — Semantic tokens, not raw accents, in components.** Add a semantic alias layer in `globals.css` and migrate ring/overlay call sites to it, so a future board theme reskins hues without collapsing meanings (the `--gb-*` theming API contract, BRANDING-GUIDELINES §13):
  - `--gb-signal-battle: var(--gb-accent-amber)`
  - `--gb-signal-eligible: var(--gb-accent-blue)`
  - `--gb-signal-selected: var(--gb-accent-green)`
  - `--gb-signal-hostile: var(--gb-accent-red)`
  - `--gb-signal-disabled: var(--gb-text-dim)`
- **SIG-3 — Kill the phantom gold token.** `field-card.tsx:245` references `--gb-accent-gold`, which does not exist in `globals.css` — the classes silently no-op. OPT-416's re-skin (G-5) removes the gold bar entirely; no `--gb-accent-gold` token is to be added.

### 3.2 Ring vocabulary (selection & battle state, on the card)

`CardHighlightRing` (`card/overlays/card-highlight-ring.tsx`) is the **only** component that renders card rings. All rings are `ring-4` (inside-board floor, BRANDING-GUIDELINES §13) on the card's rounded rect.

| Ring | Treatment | Motion | Meaning |
|---|---|---|---|
| `attacker` / `defender` | `ring-4` battle-amber + `shadow-[0_0_14px …]` glow | `cardAttackerPulse` loop (1.4s) | This card is in the active battle |
| `counter` | `ring-4` battle-amber + `shadow-[0_0_18px …]` | `cardCounterPulse` one-shot (0.48s) | A counter just boosted this card |
| `eligible` (today: `blocker`) | `ring-4` eligible-blue/60, static | none | Click to select (blocker or in-place target) |
| `selected` | `ring-4` selected-green + `shadow-[0_0_10px …]`, static | none | Currently selected; click again to deselect |

Requirements:

- **SIG-4 — One ring at a time, fixed precedence.** `counter` > `attacker` > `defender` > `selected` > `eligible`. This is the existing precedence in `field-card.tsx:183-193`, now normative. In-place targeting (OPT-419) reuses `eligible`/`selected` — it does not invent a new ring style.
- **SIG-5 — The amber `valid` fallback ring is retired.** "Valid" is not a meaning — a card is *eligible*, *selected*, or in battle. Remove the fallback variant when OPT-419 lands.
- **SIG-6 — Rings never appear on illegal candidates.** An eligible ring is a promise (Philosophy #2). Ineligibility is communicated by SIG-8 dimming + tooltip, never by a differently-colored ring.

### 3.3 Drop overlays (drag-time affordance, behind the card/zone)

`DropOverlay` (`drop-zones.tsx:15-49`): fill at `/25` opacity when a compatible drag is active, `/50` + `animate-pulse` while hovered. Overlay color = **what the drop does**:

| Overlay | Meaning | Sites |
|---|---|---|
| Blue | Card enters play here | Character slots, stage zone (🔧 stage is green today — migrate to blue) |
| Amber | Augment this card | DON attach, DON redistribute target, counter → defender (OPT-416) |
| Red | Hostile/destructive | Attack targets, board-full replacement |

Requirements:

- **SIG-7 — Overlays light only for legal drops (OPT-417).** During an attacker drag, only the opponent leader + rested characters get overlays; character slots light only for Characters, the stage zone only for Stages; hand cards the player cannot afford don't start a play-drag glow at all. Registering a droppable ≙ asserting legality.
- **SIG-8 — Ineligible = dimmed + explained.** The canonical dim is the counter-mode hand treatment: `opacity 0.35` + drag disabled (`hand-layer.tsx`). Affordability dimming (OPT-417) reuses it identically, with a tooltip reason ("Need 2 more DON"). **Soft-disable where effects could plausibly change legality** (cost mods, attack restrictions): dim but allow the attempt, so an OPT-415-class lockout cannot recur. Hard-disable only for immutable rules (card type → zone).
- **SIG-9 — The ⚡ glyph means "action available/required," everywhere.** Mid-zone prompts (`⚡ ACTION REQUIRED`), the action-menu item, and the OPT-420 effect badge share it. The badge: amber ⚡ on the card corner when the card has an `[Activate: Main]` effect, full-strength when usable now (your turn, Main phase), dimmed otherwise; `text-base` minimum (inside-board floor).
  - **Implementation:** `getActivateMainState` is the shared schema/once-per-turn resolver for the card badge and action menu. The Card primitive owns the corner overlay; field-card and stage wrappers own click/keyboard precedence and right-click aliasing.

### 3.4 Cursor vocabulary

- **SIG-10** — `grab` = draggable now; `pointer` = clickable now (select/inspect/menu); `default` = inert. Cursor must agree with the legality layer: a card that is dimmed-ineligible shows `default` (or `not-allowed` in modal contexts), never `grab`.

---

## 4. The spotlight — public reveal surface

The engine already has full reveal semantics — `REVEAL` / `REVEAL_HAND` actions with `visibility: "BOTH"` vs `"CONTROLLER_ONLY"` (`effect-types.ts:583,590`, `hand-deck.ts:201-202`), a `CARDS_REVEALED` event, and the trigger-reveal flow — but **no UI surface renders any of it**: `CARDS_REVEALED` is suppressed even from the event log, and card faces inside modals are never shown to the opponent (INTERRUPTION-MODALS). A "reveal" that the opponent cannot see is a rules-fidelity gap, not a polish gap. The spotlight is the single public presentation surface that closes it, and it doubles as the Event staging position (G-8).

- **SP-1 — One spotlight, center-board, for both players.** A non-interactive overlay at the center-board locus (where the arrange/priority displays already appear), presenting card(s) face-up at readable size to **both players simultaneously**. Uses: Event staging (G-8), effect reveals with `visibility: "BOTH"`, trigger reveals. It is a stage, not a verb — nothing is committed by clicking in the spotlight.
- **SP-2 — Dwell: fixed minimum, early dismissal, auto-exit.** The spotlight holds a fixed minimum (~1s — a readable beat) unless the viewing player dismisses it early. When the spotlit card requires no follow-up input, the spotlight auto-exits after the minimum and the card's exit animation plays (travel or transform, per MO-8).
- **SP-3 — Follow-up input holds the spotlight for the waiting player.** When the spotlit card requires further choices (event targeting, trigger-effect targeting): the **acting player's** spotlight yields to the targeting flow after the minimum; the **waiting player's** spotlight holds until the next game action, with a visible, keyboard-operable toggle to flip between spotlight and board. The moment the acting player confirms, the waiting player's spotlight auto-dismisses and resolution animations play for both players simultaneously.
- **SP-4 — The spotlight never blocks the game.** Any action that changes board state ends the spotlight immediately, for both players.
- **SP-5 — The log is the durable record.** `CARDS_REVEALED` gets an event-log line (today it falls through to `return null`, `event-log.tsx:122-124`), so a dismissed spotlight can always be reconstructed from history.
- **SP-6 — Hidden-zone re-entry hides position.** When a revealed card travels to a hidden zone (e.g. hand), the owner sees it placed deterministically (appended at the end of hand); the opponent sees it flip to the card back and insert at a **random** hand position. A reveal grants identity knowledge, never positional tracking.
- **SP-7 — Private peeks never use the spotlight.** `visibility: "CONTROLLER_ONLY"` looks stay in private modals (existing patterns). The spotlight is public by definition — the public/private distinction is structural, not conventional.

**Worked examples** (normative):

1. **Event that KOs two characters.** Player A drags the Event to their field → it spotlights for both players (~1s, early-dismissible). A proceeds to target two characters (in-place targeting, OPT-419); B's spotlight holds, with the toggle to check the board. A confirms → B's spotlight auto-dismisses, the KO transforms (MO-8) play for both players simultaneously, and the play + KOs are logged.
2. **Search top 5, take 1, reveal it.** The chosen card spotlights for both players (~1s, early-dismissible), then travels to A's hand: A sees it appended at the end of their hand; B sees it flip face-down and insert at a random position (SP-6).

---

## 5. Motion requirements

`src/lib/motion.ts` is the **single source of truth** for interaction motion. BRANDING-GUIDELINES §9 timing bands apply (micro 100–150ms, standard 200–250ms, emphasis 300–400ms spring, exit ≈ 60–70% of enter).

- **MO-1 — No inline motion values in game components.** Every duration, easing, and spring lives in `motion.ts` as a named preset with a JSDoc purpose line. New interactions add presets; they do not inline `transition={{ duration: … }}`. (Tailwind `transition-colors`/`duration-150/200` utility classes for hover color fades are exempt; transform/opacity motion is not.)
- **MO-2 — Loops mean "the game is waiting here."** Sanctioned loops: `cardAttackerPulse` (battle roles), `DropOverlay` hover pulse, and the redistribute-source pulse while the prompt is open. Nothing else loops. A loop must stop the moment its state resolves.
- **MO-3 — One-shots mean "this just happened."** `cardCounterPulse` (0.48s), summon `cardEntry`, KO, flight moves. One-shots never repeat and never exceed the emphasis band (400ms) except flight animations, which use `zoneMove` (0.22s) + stagger.
- **MO-4 — One animation per interaction.** Per BRANDING-GUIDELINES §9: a single element animates one property group per event. Ring pulse animates opacity+scale as one preset; do not add simultaneous glow-radius or hue animation.
- **MO-5 — Reduced motion is a requirement, not a fallback.** Every preset ships its reduced path (`useReducedMotion`): loops → static full-opacity, one-shots → ≤100ms opacity change or nothing, springs → instant. The FB-2 rejection shake reduces to the grey disabled-state dim beat only.
- **MO-6 — Breathing idle is the one sanctioned ambient loop.** `cardBreathing` (3.5s, y ±2px) intentionally deviates from §9's "no looping decorative animations" as a board-only immersion device. It is subtle enough to never be mistaken for a state signal, is suppressed under reduced motion, and its amplitude/period may not be increased. No second ambient loop may be added.
- **MO-7 — Keep §9 and `motion.ts` in sync.** `motion.ts` has grown board presets (attacker pulse, counter flash, flip, entry, breathing) beyond §9's listing. When touching either, reconcile: §9 owns the philosophy and timing bands; this doc + `motion.ts` JSDoc own the board preset inventory.
- **MO-8 — Zone transitions come in two classes: travel and transform.** Not all moves are equal; the animation must match the *fate* of the card, not just its route.

  | Class | Meaning | Examples | Treatment |
  |---|---|---|---|
  | **Travel** | The card continues to exist somewhere the player cares about | Draw, play to slot, return to hand, DON attach/return, life card added to hand | Standard flight: `zoneMove` (0.22s) / `zoneEnter`, staggered for batches — the existing animation layer |
  | **Transform** | The card is destroyed or consumed — it leaves meaningful play | KO → trash, Event resolved → trash (G-8), discard/cost → trash, life card trashed | **Fizzle + materialize**: one-shot dissolve at the source, then the destination pile receives it |

  Transform spec (new presets in `motion.ts`): `cardFizzle` — the card dissolves in place (opacity → 0, scale → ~0.85, slight upward drift, ≤400ms, ease-out; no flight path); the destination pile then receives it per MO-9 (pop + floating delta). Feel reference: **Balatro** — consumed cards go out *juicy, quick, and definitive*; they never limply slide to the trash like a travel move. Reduced motion: plain cross-fade ≤100ms at both ends. Transforms are non-blocking (§9: never block input) and never exceed the emphasis band.
- **MO-9 — Pile receipt is always acknowledged** (Philosophy #6). Whenever a card enters a stacked pile (trash, deck, life), the pile visibly receives it, whatever the route — travel arrival (card returned to deck) and transform arrival (KO → trash) get the same treatment:
  - **Pop:** top-of-pile scale pulse, ~1 → 1.06 → 1 spring, ≤200ms (preset `pilePop`).
  - **Floating delta indicator:** `+1` (aggregated to `+N` for a batch — one indicator per batch, never a stack of simultaneous floaters) rendered above the zone, drifting upward ~20px while fading out over ~700ms, ease-out (preset `pileDelta`). Text at the in-board floor (`text-base`, `--gb-text-bright`).
  - The indicator is part of the transition itself — an arrival acknowledgment, not a success toast (no FB-4 conflict).
  - Reduced motion: no pop, no drift — the delta appears statically and fades on the same clock.

---

## 6. Feedback — outcomes must be legible

The client is optimistic-free: the server echo *is* the success feedback (the card flies to its zone via the animation layer). That makes rejection the only silent outcome today — `game:error` is stored (`use-game-ws.ts:95-97`) but has **no UI surface once the board is mounted**, and is even cleared on the next `sendAction`. OPT-418 closes this:

- **FB-1 — Every rejection is visible and explained.** A server-rejected action produces (a) localized feedback on the initiating card (FB-2) and (b) a reason line in the mid-zone using the standard ⚡ prompt vocabulary (amber ⚡, dim body text — **never red**; rejection is "not available," not "danger"), e.g. `⚡ Not available — <reason>`. The reason must be machine-readable from the worker (add `action:rejected` to the protocol if today's message is free-text only).
- **FB-2 — The rejection gesture: shake + disabled flash, once.** X-axis shake (≈4px amplitude, 3 oscillations, ≤400ms, ease-out — added to `motion.ts` as `cardReject`) while the card briefly drops into the SIG-8 disabled treatment (dim toward `--gb-signal-disabled`, ~0.35 opacity) and recovers. The message is "you tried to use something unavailable — here is its disabled state," speaking the same grey vocabulary as ineligibility dimming. Reduced motion: the grey dim beat only, no shake (MO-5).
- **FB-2a — Rejection is the backstop, not the primary signal.** With the legality layer in place (SIG-6…8: valid targets highlighted, invalid targets dimmed during every selection), routine ineligibility never reaches the server. Rejection feedback is reserved for attempts the soft-disable policy deliberately allows through: plays the player lacks resources for, actions restricted by an opponent's effect, and exotic legality the client model doesn't cover. If rejection feedback is firing often, the legality layer is under-modeling — fix that, don't tune the rejection.
- **FB-3 — Rejection reasons persist until superseded.** Display until the next *accepted* state update or a new attempted action — not cleared by the send itself (fix the `setGameError(null)`-on-send behavior). Do not confuse client-side duplicate suppression (identical actions within 250ms, `use-game-session.ts:132-142`) with rejection — suppressed duplicates produce no feedback.
- **FB-4 — Success is never double-announced.** No checkmarks/toasts for accepted moves; the state change and flight animation are the confirmation. Pile receipt indicators (MO-9) don't violate this — they are part of the transition, not a second announcement. (Exception: mid-zone readouts that already exist, e.g. boosted defender power.)
- **FB-5 — Waiting states are owned by the mid-zone.** Spinner for opponent's turn, `⚡` prompts for required input, battle sub-phase labels. Cards signal *who is involved* (rings); the mid-zone signals *what the game wants*; the spotlight (§4) signals *what is being shown*. Don't move any of these jobs to another surface.

---

## 7. Input equivalence (keyboard/ARIA — OPT-421 alignment)

Sequenced after the grammar lands, but the grammar must not paint it into a corner:

- **IN-1 — Every drag verb needs a keyboard path.** dnd-kit `KeyboardSensor` alongside the `PointerSensor`; `boardCollisionDetection` already falls back to `rectIntersection` for keyboard.
- **IN-2 — Every click/menu verb is focusable and operable.** Eligible candidates are tabbable, `Enter`/`Space` toggles selection or opens the menu (let Radix's own trigger behavior work — the controlled-open workaround in `field-card.tsx:206-213` is removed by OPT-420), `Escape` = G-3 deselect.
- **IN-3 — Signifiers get ARIA equivalents.** Ring states map to `aria-pressed`/`aria-selected`; dim + tooltip reasons map to `aria-disabled` + `aria-describedby`. A signal that exists only as color fails the contract (Philosophy #2 applies to screen readers too).

---

## 8. Requirement ↔ ticket traceability

| Ticket | Implements |
|---|---|
| OPT-416 (grammar) | G-2…G-5, G-7 (blocker), G-8 gesture side, SIG-3, action-table 🔧 rows for counter/DON/blocker |
| OPT-417 (legality) | SIG-6, SIG-7, SIG-8, SIG-10; Philosophy #2 |
| OPT-418 (rejection) | FB-1…FB-3 incl. FB-2a; MO-5 for the shake; `cardReject` preset (MO-1) |
| OPT-419 (in-place targeting) | G-3, G-7, SIG-4, SIG-5; modal stays for hidden zones |
| OPT-420 (effect discoverability) | G-1 menu verb, G-6, SIG-9; IN-2 groundwork |
| OPT-421 (keyboard/ARIA) | IN-1…IN-3; SP-3 toggle operability |
| OPT-422 (parity/cleanup) | Action-table life-inspect row; dead-code removal keeps the inventory truthful |
| OPT-464 (spotlight) | SP-1…SP-7; `CARDS_REVEALED` event-log line |
| OPT-465 (transforms + pile receipt) | MO-8, MO-9; Philosophy #6; `cardFizzle`/`pilePop`/`pileDelta` presets |

**Known current-state deviations** (owned by tickets above unless noted): every opponent card lights as an attack target; slots/stage accept any card type; no affordability dim; silent rejections cleared on send; stage drop overlay is green (migrates to blue per SIG table); `[Main]` activation is hidden behind right-click only; all zone moves share one travel animation regardless of the card's fate; **reveals are invisible** — `CARDS_REVEALED` has no UI at all and is suppressed even from the event log (rules-fidelity gap, §4).

All spec items are ticketed as of 2026-07-12: the Event play surface (G-8, gesture side) was folded into OPT-416; the spotlight surface is OPT-464; transform-class transitions + pile receipt are OPT-465.

**Maintenance rule:** any PR that adds or changes a board interaction updates the relevant table/requirement here in the same PR. A new mechanic that can't cite a verb (G-1) and a signifier row isn't ready to build.
