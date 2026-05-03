---
linear-project: Tech Debt
linear-project-url: https://linear.app/optcg-sim/project/tech-debt-7e0a9613928a
last-updated: 2026-05-03
status: in-review
pr: https://github.com/corycunanan/optcg-sim/pull/216
---

# Soak-Window Tech Debt Cleanup — Handoff Doc

A bundle of six low-risk tech-debt cleanups to run during the OPT-361 soak window
(2026-05-02 → 2026-05-09). Ship as a single PR.

> **Status (2026-05-03):** Bundle in review on [PR #216](https://github.com/corycunanan/optcg-sim/pull/216).
> OPT-203 / OPT-208 are Done in Linear (no code change needed); the remaining
> five tickets (OPT-197 / 199 / 200 / 202 / 206) are In Review on the PR and
> will move to Done on merge.
>
> Follow-ups filed off PR #216:
> - **OPT-363** — `ADD_TO_LIFE` handler gap (OP14-104 Gecko Moria). In Review on
>   [PR #217](https://github.com/corycunanan/optcg-sim/pull/217).
> - **OPT-362** — deferred OPT-199 schema migration (`Deck.leader` Prisma
>   relation + `include` collapse). Still Backlog; ready when someone wants it.

---

## Why this exists

OPT-360 (lobby invite push notifications) shipped on 2026-05-02. The next ticket
in the realtime-social arc — **OPT-361** (delete the three 60s backstop polls)
— is gated on a 7-day soak window after OPT-358 merged. Earliest unblock:
**2026-05-09**.

This bundle uses the soak window for low-risk, mechanical tech-debt cleanup that
does not conflict with OPT-361 or the paused M5.4 motion overlay work.

---

## Action Plan

Tickets verified against `main` as of 2026-05-02. Order is roughly by effort —
the close-as-stale work first, the worker change last.

| Order | Ticket | Title | Estimate | Depends on | Status | PR | Notes |
|-------|--------|-------|----------|------------|--------|----|-------|
| 1 | [OPT-203](https://linear.app/optcg-sim/issue/OPT-203) | DEAD-1: Remove or wire orphaned `src/lib/proxy.ts` | 0 | — | **Done** | — | Closed without code change — already resolved by OPT-186 |
| 2 | [OPT-206](https://linear.app/optcg-sim/issue/OPT-206) | STYLE-2: Document sidebar CSS-var exception | 10m | — | **In Review** | [#216](https://github.com/corycunanan/optcg-sim/pull/216) | Two-sentence Exceptions note added to CLAUDE.md |
| 3 | [OPT-197](https://linear.app/optcg-sim/issue/OPT-197) | CONSIST-3: Validate `messageId` in `/api/messages/read` | 15m | — | **In Review** | [#216](https://github.com/corycunanan/optcg-sim/pull/216) | `MessageIdSchema` (uuid, **not cuid** — schema is `@default(uuid())`) |
| 4 | [OPT-208](https://linear.app/optcg-sim/issue/OPT-208) | DEAD-2: Audit `active-effects` and `zone-position` context consumers | 30m | — | **Done** | — | Kept context as-is — render tree puts consumers 3+ layers deep, prop-drilling would be worse |
| 5 | [OPT-199](https://linear.app/optcg-sim/issue/OPT-199) | SCALE-2: Collapse N+1 in decks (and lobbies if still present) | 30m | — | **In Review** | [#216](https://github.com/corycunanan/optcg-sim/pull/216) | `take: 200` cap + skip-empty-IN shipped; full collapse deferred to follow-up (no `leader` Prisma relation exists) |
| 6 | [OPT-200](https://linear.app/optcg-sim/issue/OPT-200) + [OPT-202](https://linear.app/optcg-sim/issue/OPT-202) | MOD-3 + MOD-4: Single source for `ACTION_HANDLERS` / `VALID_ACTION_TYPES` + boot-time coverage assertion | 45m | — | **In Review** | [#216](https://github.com/corycunanan/optcg-sim/pull/216) | `ALL_ACTION_TYPES` runtime mirror w/ compile-time completeness check; 6 known handler gaps documented |

**Status values:** use Linear status names verbatim (`Backlog`, `Todo`,
`In Progress`, `In Review`, `Done`, `Canceled`).

**Follow-ups filed:**

- [OPT-362](https://linear.app/optcg-sim/issue/OPT-362) — the deferred OPT-199
  schema work (add Prisma `Deck.leader` relation, then collapse to a single
  `include` query). Out of scope for the soak window because it requires a
  migration. **Status: Backlog — ready to pick up.**
- [OPT-363](https://linear.app/optcg-sim/issue/OPT-363) — `ADD_TO_LIFE` handler
  for OP14-104 Gecko Moria's second CHOICE branch. Surfaced by Codex review on
  PR #216. **Status: In Review on [PR #217](https://github.com/corycunanan/optcg-sim/pull/217).**
  Whitelist entry removed; the OPT-200 boot assertion now enforces handler
  coverage for `ADD_TO_LIFE`.

---

## Per-ticket guidance

### OPT-203 — Close as duplicate of OPT-186

- **No code change.** Verify with `ls src/lib/proxy.ts` (should not exist) and a
  grep for `lib/proxy` in `src/` (should be empty).
- Mark Done in Linear with a one-line comment: "Resolved by OPT-186."

### OPT-206 — Document the sidebar exception

- **File:** `CLAUDE.md` "Styling Rules (enforced)" section.
- Add a brief "Exceptions" subsection noting that `src/components/ui/sidebar.tsx`
  uses inline `style={{ "--sidebar-width": ... }}` etc. for responsive CSS
  custom properties (lines 132-137, 190-193, 611-614 — verify line numbers),
  because the values are dynamic and cannot be expressed as Tailwind utilities.
- Two sentences max. Keep CLAUDE.md tight.

### OPT-197 — Validate `messageId`

- **File:** `src/app/api/messages/read/route.ts`.
- **Gotcha — preserve the OPT-359 invariant:** the existing route maintains
  `read = readAt != null` (see comment at lines 36-39). Do not refactor the
  update payload. Only add input validation in front of it.
- Add to `src/lib/validators/messages.ts`:
  ```ts
  export const MessageIdSchema = z.object({
    messageId: z.string().uuid(),
  });
  ```
  (`Message.id` is `@default(uuid())` per `prisma/schema.prisma:291` — verify
  there if you ever migrate away from UUIDs. The original handoff said CUID,
  which is wrong for this model; see the deviation note below.)
- In the route, replace the manual presence check with
  `MessageIdSchema.safeParse({ messageId: request.nextUrl.searchParams.get("messageId") })`.
  Return `apiError(400)` on failure.

### OPT-208 — Audit context consumers

- **Read first:** `src/contexts/active-effects-context.tsx`,
  `src/components/game/card/card-tooltip-content.tsx` (the sole consumer),
  `src/components/game/board-layout/board-layout.tsx:86-90` (the Provider mount).
- **Subtlety:** The file exports both a context AND four pure helpers
  (`getPowerModDirection`, `computeEffectivePower`, `computeEffectiveCost`,
  `getCostModDirection`). Keep the helpers — they're consumed beyond just the
  context. Only the React context plumbing is the dead-weight candidate.
- **Decision point — do not skip:** before inlining, check the render tree. If
  `card-tooltip-content` is rendered deep inside `BoardLayoutInner` (e.g. inside
  field cards / hand cards), prop-drilling `activeEffects` through 3+ layers is
  worse than the current single-consumer context. In that case, **leave the
  context as-is and close OPT-208 with a comment explaining why.** The audit
  framing was "*may* be clearer" — that's now answered.
- `zone-position-context` has 6+ consumers across `field-card`, `don-zone`,
  `trash-zone`, `life-zone`, `zone-ref`. **Do not touch.**

### OPT-199 — Decks N+1

- **File:** `src/app/api/decks/route.ts:20-36`.
- Two queries today: `prisma.deck.findMany` then `prisma.card.findMany` for
  leader cards. Collapse to one query using Prisma `include` on the deck's
  leader relation (verify the relation name in `prisma/schema.prisma`).
- Add `take: 200` (or similar safety cap) to the deck `findMany`. User-owned
  decks are bounded in practice but the route has no cap today.
- The ticket also flags `src/app/api/lobbies/join/route.ts:81-84` for a
  duplicate two-fetch pattern. **Verify it still exists** before editing — the
  initial grep didn't find it on `main` as of 2026-05-02, so it may have been
  resolved already. If gone, drop that scope from the PR description.

### OPT-200 + OPT-202 — Single source for action types

- **Files:** `workers/game/src/engine/effect-resolver/resolver.ts:45`
  (`ACTION_HANDLERS`), `workers/game/src/engine/schema-registry.ts:177`
  (`VALID_ACTION_TYPES`).
- **OPT-202:** Replace the hand-maintained `VALID_ACTION_TYPES` Set with
  `new Set(Object.keys(ACTION_HANDLERS) as ActionType[])` exported from
  `resolver.ts`. `schema-registry.ts` imports it.
- **OPT-200:** Add a startup assertion in the resolver module (or DO
  constructor) that every type in the `ActionType` union has a handler.
  Throw with the missing type name. Pattern:
  ```ts
  const missing = (ALL_ACTION_TYPES as ActionType[]).filter(
    t => !(t in ACTION_HANDLERS)
  );
  if (missing.length) throw new Error(`Missing handlers: ${missing.join(",")}`);
  ```
- **Gotcha:** `ACTION_HANDLERS` is typed as `Partial<Record<ActionType, ...>>`
  — that's why this assertion is needed. After this change, consider whether to
  flip it to a non-`Partial` Record (which would make the assertion compile-time);
  defer if it cascades into too many types.
- **Test:** worker unit tests should still pass; the assertion fires only on
  drift, so it's a safety net, not a correctness change.

---

## Out of scope (do not touch in this PR)

- **OPT-205** (card-edit-form inline color style) — flagged as ready but more
  involved than the others; ship separately if there's time.
- **OPT-101, 102, 103, 106, 193, 194, 198, 201, 207, 264, 265** — too large or
  too invasive for the soak window. They have their own tickets.
- **The realtime-social arc (OPT-361 specifically)** — explicitly gated on
  2026-05-09 soak completion. **Do not preemptively delete the 60s backstop
  polls** even if you see them while editing nearby files.

---

## Done criteria

- [x] All 6 tickets either marked Done in Linear (OPT-203, OPT-208) or
      commented with implementation notes (OPT-197/199/200/202/206 — status
      will move to Done on PR merge).
- [x] One PR opened against `main` with a clear bundle description ([#216](https://github.com/corycunanan/optcg-sim/pull/216)).
- [x] CI green: typecheck (next + worker), lint, worker tests (898 passing),
      Next.js tests (488 passing).
- [ ] Manual smoke: load `/admin`, send a message, mark it read (verifies
      OPT-197), open a deck list page (verifies OPT-199), start a game
      (verifies the worker boot assertion in OPT-200 doesn't trip). _Pending
      reviewer / merge._
- [x] PR description links each ticket and notes the OPT-358 → OPT-361 soak
      context, so reviewers know why this bundle exists.

---

## Why a bundle and not six PRs

Each item is mechanical and independently revertible. A single PR is faster to
review (one context-switch, not six) and the soak window doesn't reward
ceremony. If review surfaces an issue with one item, drop just that commit and
reroll.

---

## Implementation notes & deviations from the plan

Captured here so the next reader doesn't have to reconcile this doc against
[PR #216](https://github.com/corycunanan/optcg-sim/pull/216) line-by-line.

### OPT-197 — UUID, not CUID

The plan said `z.string().cuid()`. `Message.id` is `@default(uuid())` per
`prisma/schema.prisma:291`, so the validator uses `z.string().uuid()` instead.

### OPT-199 — schema migration deferred

The plan said "collapse to one query using Prisma `include` on the deck's
leader relation." There is no `leader` relation on `Deck` — `leaderId` is a
plain `String` (`prisma/schema.prisma:201`). Adding the relation requires a
Prisma migration, which doesn't belong in a soak window.

Shipped instead: `take: 200` cap and skip the leader bulk query when there
are no decks. The full collapse moved to [OPT-362](https://linear.app/optcg-sim/issue/OPT-362).

The lobbies/join two-fetch pattern this ticket also flagged is no longer
present on `main` — dropped from scope.

### OPT-200 / OPT-202 — pre-existing handler gaps

The plan assumed every `ActionType` had a handler and the boot assertion
"fires only on drift." It does not — five members are missing handlers today
and live in `KNOWN_UNHANDLED_ACTION_TYPES` so the assertion only trips on
**new** drift:

- `RETURN_ATTACHED_DON_TO_COST` — resolves through `cost-handler.ts` as a Cost.
- `CHOOSE_VALUE`, `GRANT_COUNTER`, `REMOVE_PROHIBITION` — declared in the
  union but unused by any current schema.
- `ADD_TO_LIFE` — **real authored gap**: dispatched by `op14.ts:3957`
  (OP14-104 Gecko Moria, second CHOICE branch) but no handler exists, so
  that branch silently no-ops at runtime. Tracked as
  [OPT-363](https://linear.app/optcg-sim/issue/OPT-363); whitelist entry
  carries an inline `TODO(OPT-363)`. Surfaced by Codex review on PR #216 —
  the assertion didn't catch it because the whitelist hid it. The compile-time completeness check on
`ALL_ACTION_TYPES` ensures the runtime mirror can't drift from the type
union.

Also: `VALID_ACTION_TYPES` is derived from `ALL_ACTION_TYPES` (the union),
not `Object.keys(ACTION_HANDLERS)` as the plan suggested. Rationale: the
schema language is the type union; engine handler coverage is a separate
concern, now asserted in `resolver.ts`. Deriving `VALID_ACTION_TYPES` from
the handler map would make `op14`'s `ADD_TO_LIFE` log noisy schema-validation
warnings on every cold start.

### OPT-208 — kept context as-is

The plan flagged this as a "decision point — do not skip." Decision: keep
the context. `CardTooltipContent` is rendered through `<CardTooltip>` →
`<Card>`, and `<Card>` is consumed in 15+ places inside `BoardLayoutInner`
(`field-card`, `hand-layer`, `don-zone`, `trash-zone`, `life-zone`,
`player-field`, `opponent-field`, `board-layout`, plus several modals).
Prop-drilling `activeEffects` through 3+ layers would be strictly worse
than the existing single-Provider context.

---

## Handoffs

### OPT-363 → OPT-362
**From:** session on 2026-05-03 · **Commit:** `34154fc` · **PR:** #217

- **Primer:** `ADD_TO_LIFE` is no longer a no-op — there is a real handler
  (generic dispatcher keyed on `target.type`). The OPT-200 boot assertion now
  enforces handler coverage for it; the `KNOWN_UNHANDLED_ACTION_TYPES`
  whitelist is back to its "resolved-elsewhere or unauthored" baseline.
- **Read first:** `workers/game/src/engine/effect-resolver/actions/life.ts`
  (the new `executeAddToLife` + `executeAddToLifeFromTrash`),
  `workers/game/src/engine/effect-resolver/resolver.ts:73` (registration),
  `workers/game/src/engine/effect-resolver/resolver.ts:139-154` (updated
  `KNOWN_UNHANDLED_ACTION_TYPES` comment block).
- **Gotchas / do NOT touch:** existing `_FROM_DECK` / `_FROM_HAND` /
  `_FROM_FIELD` handlers stay — they're referenced directly by other schemas.
  The dispatcher only handles `target.type === "CARD_IN_TRASH"` today; other
  target types `console.warn` + return `succeeded: false`. Don't fold the
  specialized variants into the dispatcher unless you also rewrite their
  call sites.
- **Unresolved:** none. OPT-363 is fully scoped by OP14-104; future
  `ADD_TO_LIFE` authoring is forward-compatible.
- **Why this matters for OPT-362:** unrelated surface (Prisma schema +
  `src/app/api/decks/route.ts`), so nothing in this PR blocks or informs it.
  The only coupling is that both came out of PR #216's review trail.
