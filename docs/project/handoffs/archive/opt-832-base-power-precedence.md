# OPT-832 — competing base-power settings

Implementation handoff; merge/readiness are owned by the coordinator. Commit and PR pointers are in the accompanying PR body.

`getEffectivePower` now picks the highest applicable resolved `SET_POWER` value before adding power modifiers and attached DON!!. Printed power participates only when no setting applies. Controller, registration order, and timestamp do not change the winning setting. `SET_COST` priority is unchanged. `SET_POWER_TO_ZERO` now captures each target's current total power and persists an additive reduction under §4-12; it is not a base setter.

Read first: `workers/game/src/engine/modifiers.ts`, `workers/game/src/__tests__/opt-832-base-power-precedence.test.ts`, `workers/game/src/__tests__/opt-832-set-power-zero.test.ts`, the action handler in `effect-resolver/actions/modifiers.ts`, and the reconciled OPT-225/OPT-241 tests.

## Rules and evidence

Sources checked September 9, 2026: supported Comprehensive Rules v1.2.0 §4-9-2-1 (`docs/rules/rule_comprehensive.md`), `docs/FAQs/qa_op17.md` (OP17-008 PDF p.1 and OP17-043 p.3), `docs/FAQs/qa_st-34.md` (ST34-004 p.1), and `docs/game-engine/08-ENGINE-ARCHITECTURE.md` §Layer 1. Canonical OP17 effect text is in `docs/cards/OP-17.md`; Ganzui's cost 5, power 7000, Blue/Special/Rocks Pirates/no Counter were verified against the [official card list](https://en.onepiece-cardgame.com/cardlist/?series=569117). No ruleset migration or authored schema changes.

| Clause | Evaluation / controller / timing | Observable result | Evidence |
| --- | --- | --- | --- |
| §4-9-2-1, OP17-008, OP17-043, ST34-004 | All applicable settings on a field card, either controller or application order | Highest setting replaces printed power; 0 loses to 6000, 7000 loses to 8000 | 32-case matrix, printed 10000, both controllers and orders |
| Applicability | Each modifier's target and conditions; permanent source negation | Ineligible settings do not compete; multiple settings within one block do | Target, condition, source-negation and multiple-modifier regressions |
| Layering and duration | Battle expiry, own End Phase, opponent next End Phase | Remaining setting resumes; then printed power; additive modifiers and own-turn DON bonus remain separate | Duration test plus authored Ganzui pipeline for both players |
| Ganzui On Play | Pay 5 DON!!, play Character, automatic own-Leader target; until opponent next End Phase | Existing 7000 wins over Ganzui's 6000; own-turn expiry reveals 6000; opponent End Phase restores printed value | `runPipeline(PLAY_CARD)` with authored schema; resource, zone, no-prompt and power assertions |
| Set power to zero (§4-12) | Capture original current total per target; ignore nonpositive power; specified duration | Zero even with existing setters/buffs/DON; later buffs remain; expiry restores power | Authored OP07-002 Ain pipeline (canonical cost 7), DON detachment, zero/negative inputs, distinct multi-target reductions and conditional aura collapse |
| Cost precedence | Existing turn-player/non-turn-player ordering | Lower non-turn-player cost setting can still win | OPT-241 cost regression, both turn players |

## Shared consumers

Inventory uses `getAllAuthoredSchemas()` and existing `collectAuthoredActionCounts()` per card, which walks nested actions, replacement actions, and start-of-game actions. A recursive modifier scan also checks all authored `SET_POWER`, `SET_BASE_POWER`, and `COPY_POWER` nodes under modifier paths.

- `SET_BASE_POWER` actions: 11 uses across EB04-004, OP16-015, OP16-058, OP16-106, OP17-005, OP17-008, OP17-034, OP17-043, P-092, ST26-005.
- `SET_POWER_TO_ZERO`: EB04-010, OP07-002. Both route through the corrected captured-reduction handler, not the base-setting maximum.
- `SWAP_BASE_POWER`: OP14-001, OP14-009, OP14-017.
- `COPY_POWER`: EB01-061, EB04-052, OP04-069, OP06-009, OP16-036, OP16-055, OP16-104.
- Active authored `SET_POWER` modifiers: EB04-003, OP13-084, OP14-053 (dynamic `LEADER_BASE_POWER`).
- Intended but currently inactive `SET_BASE_POWER` modifiers: OP15-070 (2), OP15-071 (2), OP15-092 (2), OP17-112 (1). Registration copies these verbatim, while the power reader recognizes only `SET_POWER`. This pre-existing alias mismatch is not changed here.

## Next ticket and constraints

OPT-833 starts only after OPT-832 is verified merged. Extract a shared effective-base read from the corrected setting layer, then address field filters, source filters, K.O. snapshots, swap capture and stable aura targeting. Printed reads outside the field must remain printed. The current OPT-225 fixture still describes printed swap capture: its contradictory last-wins claim is corrected here, while previously modified swap inputs belong to OPT-833.

Investigate the inactive modifier aliases above when proving OP17-112 aura behavior; record any additional OP15 work separately if beyond OPT-833's acceptance criteria. Do not infer that a green schema inventory proves those permanent modifiers execute.

## Validation environment

Baseline: three existing power/cost suites passed 36 tests. New regression before the fix failed 12 of 37 tests, including both Ganzui pipeline scenarios (observed 6000; required 7000). The final regression adds source-negation coverage and canonical Ganzui cost/resource assertions. Review additionally caught `SET_POWER_TO_ZERO` being persisted as a zero base setter. Five new tests reproduced the problem before the correction; seven final tests cover the complete reduction behavior, including authored Ain's paid On Play pipeline. See the PR for final gate results.

The original shared Prisma client was stale. Validation uses an APFS copy of root dependencies in the isolated clone and `pnpm db:generate` there; shared dependencies were not regenerated. Initial sandbox build failed resolving Google Fonts; the required gate was rerun with network access. Disposable PostgreSQL suites require `TEST_DATABASE_URL` and follow the repository's configured skip behavior when unavailable. No database migration, deployment command, UI change, or browser verification is part of this engine-only change.
