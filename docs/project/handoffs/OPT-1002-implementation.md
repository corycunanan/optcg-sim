# OPT-1002 implementation handoff

Base: `4858458abb4516c3085543f84c5b20e2364c8ec6` (`origin/main`). Branch: `corymcunanan/opt-1002-pr-12-follow-ups-session-and-validation-reject-guards-opt`.

Used once-per-turn activations now reject before cost feasibility with the shared `isOncePerTurnBlock` predicate. Pipeline rejection returns a copy of the entire incoming history, preserving entry identity, content and order. `executeAction` bounds history on entry for its other paths; this branch intentionally uses `initialUndoHistory` to avoid truncating a rejected input. No session restructuring, persisted fields, prompts, availability or UI changes.

## Rules basis

Local `docs/rules/RULE-INDEX.md` indexes [Once Per Turn] to Comprehensive Rules §10-2-13. `docs/rules/rule_comprehensive.md` §10-2-13-1/2/3 establishes one use per turn per card, including the prohibition on paying its cost again. §10-2-13-4 covers new instances after zone changes. Canonical `docs/cards/ST-01.md` ST01-007 prints a cost-free [Activate: Main] [Once Per Turn]; `docs/cards/OP-01.md` OP01-013 prints the optional Life-to-hand cost. Tests use those authored blocks, plus explicit schema mutations for trigger-level encoding and the unrestricted control. §10-2-2, §10-2-3/4 and §2-8-2 support existing field/Main/Event guards.

## Acceptance to evidence

Paths below are under `workers/game/src/`; independent review must reproduce implementer self-reports.

| Claim | Evidence | Rung / status |
|---|---|---|
| Used OPT rejects before costs, including optional payable/unpayable Life cost | `engine/validation.ts:437`; `__tests__/opt-1002-rejected-actions.test.ts` authored cost-free and optional cases | 4, implementer run; awaiting independent reproduction |
| Both flag and trigger encodings are covered | Shared predicate import; trigger-level regression | 4, implementer run |
| validate, pipeline, coordinator leave game state deep-equal | `rejectAtEveryBoundary` compares full state, no prompt and exact history, including 2 distinct checkpoints | 4, implementer run |
| Rejection preserves undo for existing illegal activation and other action kinds | Off-field and missing PLAY_CARD regressions; `session/coordinator.ts:253` | 4, implementer run |
| Actual GameSession boundary rejects without storage writes, preserves checkpoint, permits subsequent UNDO | Real `GameSession.handleAction` with in-memory DO/socket harness; used and off-field cases | 4, implementer run; no browser/app claim |
| Legal controls still apply | Unused, different instance, different block, unrestricted block; existing Leader/Character/Stage controls | 4, implementer run |

## Every executeActivateEffect early exit

Inventory of actual `engine/execute.ts:218-269`, not the historical effect-resolver path. Resolution's final return is normal delegation, not a skipped activation.

| Execute condition | Execute line | Validation rejection | Regression |
|---|---|---|---|
| Source missing (returns error event rather than silent skip) | 229 | `validation.ts:396` Not your card | New missing-source and existing stale-instance |
| Card data missing | 232 | 399-402 missing block | New missing-data |
| Effect schema absent | 236 | 400-402 missing block | New missing-schema |
| Requested block absent | 240 | 401-402 missing block | New missing-block; OPT-985 unknown id |
| Category not activate | 243 | 406-411 only Activate: Main | New non-activate; OPT-985 on-play |
| No trigger | 246-249 | 408-411 only Activate: Main | New missing-trigger |
| Trigger lacks keyword (e.g. any_of) | 246-249 | 408-411 only Activate: Main | New combined-trigger; OPT-985 authored Event |
| Keyword differs from ACTIVATE_MAIN | 246-249 | 409-411 only Activate: Main | New wrong-trigger; OPT-985 authored Main/Counter Events |
| Attached DON requirement unmet | 252 | 423-424 attached DON requirement | New attached-DON |
| Shared OPT predicate true and same block+instance already used | 255-259 | 437-442 used effect, before costs | New flags/trigger encoding, optional/cost-free regressions |

All listed skip inputs reject through validate, runPipeline and coordinator in the focused suite. Validation also rejects wrong ownership, off-field zones, wrong timing, activation prohibitions, unpayable costs and unmet conditions; these are existing stronger restrictions, not missing execute skips. No additional production guard was needed beyond OPT.

## Validation baseline and final

Run-owned dependencies installed with `pnpm install --frozen-lockfile`; install completed exit 0 before checks. Commands ran from repository root. Explicit `pnpm --filter optcg-game exec vitest list` selections were inspected before tests.

- Baseline on base: explicit `opt-985-activation-source-zone`, `opt-479-session-boundaries`, `opt-554-session-authorization`: **3 files, 57 tests passed**.
- Red before production fixes: initial 11 regression tests: **7 failed, 4 passed** (used-block and undo preservation failures); retained `../opt1002-red.log`.
- Intermediate green exposed the existing history bounding; exact input preservation is tested with 2 distinct checkpoints. Fixed only pipeline rejection.
- Final explicit selection: same 3 baseline files plus `opt-1002-rejected-actions`: **4 files, 78 tests passed** (21 new).
- `pnpm --filter optcg-game type-check`: **exit 0**. `git diff --check`: **exit 0**.
- No local `pnpm verify`; Medium full gate is required CI on the exact candidate head. CI and independent mutation/reproduction checks remain pending at handoff.

Retained run evidence outside git in parent `work/`: `opt1002-baseline-selection.log`, `opt1002-baseline.log`, `opt1002-regression-selection.log`, `opt1002-red.log`, `opt1002-green-initial.log`, `opt1002-green.log`, `opt1002-final-selection.log`, `opt1002-final-tests.log`, `opt1002-typecheck.log`. The initial green failure log documents history truncation; it is not a claimed passing run.

## Follow-ups

None discovered within the bounded activation-skip inventory. Full CI and independent review are pending gates, not completed evidence. Coordinator owns the run ledger and Linear; implementer has made no Linear writes or merges.
