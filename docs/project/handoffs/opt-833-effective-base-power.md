# OPT-833 — Changed base power in field reads and K.O. snapshots

Base: `55e95c4cb8f75e9274c013a92ad6edc5b18069d9` (verified OPT-832 merge). Scope is OPT-833 only. Coordinator owns Linear, independent readiness assessment and authorized merging; this implementer never merges or writes Linear.

## Behavior and source basis

`getEffectiveBasePower` owns the setting layer; total power adds adjustments and DON!! afterward. Field target/source/reference adapters read changed base lazily, while ordinary off-field identities remain printed. `koCharacter` captures base before exit/source cleanup and stores it only in optional `CARD_KO.preKO_basePower`; effect, battle and resumed replacement paths pass card data. A simultaneous K.O. batch shares its post-replacement, pre-exit snapshot. Durable event parsing accepts the optional field and historical events without it. Swap captures both effective bases before adding either independent duration-bound setter; existing higher setters remain. Explicit `COPY_POWER.source_power: "BASE"` also captures effective base, while default/effective copies retain total-power semantics.

Sources: comprehensive rules v1.2.0 (2026-01-16), §§4-9-2-1, 3-1-6, 6-5-5-2, 8-1-3-3-2/4/5, 8-2-1 and 10-2-1-3; canonical card text under `docs/cards`; `docs/FAQs/qa_op17.md` Q1416 and `docs/FAQs/qa_op14_eb04.md` Q1098/Q1121/Q1095/Q1100/Q1096. Coordinator checked current official Asia-English Q&A on 2026-09-09 and relevant clauses agree. Official English cardlist stats were independently checked that day (series 569113/569114/569117); tests retain canonical Mars cost6/power5000 and Linlin cost10/power12000 rather than inaccurate legacy fixtures.

| Clause | Gate and timing | Cost/chooser | Result and evidence |
| --- | --- | --- | --- |
| Changed base; highest setting | Field read, applicable current setting | No new cost/chooser | Single lower/higher setter, competing orders, total/additive/DON exclusion and off-field negatives (`opt-833-effective-base-power`) |
| OP17-112 base4000 Trigger aura | Own turn, own Trigger Characters; source valid | Actual play costs10 DON; controller resolves authored On Play choice | Authored schema pipeline + persisted prompt resume; external8000 and never4000; repeated reads, reversed downstream aura order,2–4 duplicate sources, turn/controller/Trigger negatives, negation and source exits |
| OP14-003 protection | Effect source's changed base at K.O. attempt | Mars play6 DON, optional trash1 from own hand, select opponent Character base cost≤5 | Authored Ju Peter≥10 trash makes Mars7000 and K.O.s Bege; below trash threshold, no Ju Peter and additive-only10000 total remain protected |
| OP14-053 / OP13-002 | Vista on opponent turn with hand≤7; Ace attached DON≥1 | Existing attack/pass and Mars cost/selection | Effect and battle K.O. snapshots6000 and Ace draws1; hand8/noDON do not draw; fresh trash identity base4000; storage decode before delayed trigger match |
| Leader base dynamic | Vista reads current Leader base | No new chooser | Leader set8000 plus2000 additive yields Vista8000, Leader total10000 |
| OP16-036 base copy | On attack, capture opponent Leader changed base | No cost/selection | Authored Bon Kurei attack copies Navy Leader7000 from active EB04-003, excludes additive power, retains captured7000 after source exits, expires to printed1000. No aura copies5000; direct BASE/EFFECTIVE pair proves8000 vs11000 with additive/DON |
| Swap | Capture both bases before either write | Existing selector/duration | Existing8000 survives losing4000 swap setter; other recipient gets8000, never9000 from DON; exit/duration preserved; OPT-225 additive regression retained |
| Simultaneous K.O. | After replacements, before any target cleanup | Existing batch | Ju Peter/Mars snapshot7000/7000 with source first or last |

## Continuous aura interpretation

A base-setting modifier's applicability, gates and dynamic value are evaluated in an immutable local state view excluding its own contribution. Other modifiers remain visible. Duplicate copies of the same authored permanent modifier (source card identity, block, controller and identical modifier) form one eligibility cohort, so two Linlins cannot incorrectly invalidate each other. Each external read computes fresh; there is no global cache, mutated card power, persisted evaluation context or include-forever state. The filter adapter's lazy getter avoids unrelated base evaluation and recursive eager traversal.

This is a bounded implementation inference from OP17-112's stable8000 ruling, not a claimed universal official cyclic-aura algorithm. The actual registry has only one base-sensitive **base-setting** permanent family: OP17-112. Other base-sensitive permanent consumers are P-027, ST21-011 and ST30-003; tests prove a downstream base8000 consumer regardless of registration order. Hypothetical mutually dependent, distinct base setters with ambiguous eligibility require separate rules adjudication; this change does not introduce choice-order or universal fixed-point machinery. An already changed recipient is evaluated using other current settings rather than universally qualifying from printing.

## Shared consumers and authored normalization

Full recursive registry inventory (all object/array branches, including nested actions, conditions and trigger filters): [inventory](./opt-833-base-power-inventory.json).

- 68 base-filter nodes across64 cards; source-base filter OP14-003; trigger-base filters OP13-002 and OP14-041.
- Active permanent `SET_POWER`: EB04-003, OP13-084, OP14-053, OP17-112.
- `LEADER_BASE_POWER`: only OP14-053. Both action and permanent dynamic-value composition receive the effective-base reader.
- Swap: OP14-001, OP14-009, OP14-017.
- Explicit base-copy action: OP16-036 (one `COPY_POWER.source_power: BASE` node). Six other `COPY_POWER` consumers retain total/default behavior: EB01-061, EB04-052, OP04-069, OP06-009, OP16-055, OP16-104. The inventory walks nested actions as well as modifiers.
- OP17-112's authored modifier used inactive alias `SET_BASE_POWER`; normalize that one modifier to existing runtime `SET_POWER` and regenerate the production registry. No shared alias enablement.
- Six pre-existing dormant `SET_BASE_POWER`/`amount` modifiers remain in OP15-070/071/092. OP15-092's trash20 block also omits its opponent-turn gate. Enabling this family without fixing the gate would introduce wrong own-turn Leader7000 behavior. This is separate card-family work, recorded as a follow-up rather than silently activated.

OPT-247/248 documentation now distinguishes changed base power from additive/total and printed cost; additive exclusion tests remain. OPT-225's contradictory printed-swap prose is corrected while preserving its existing additive/duration checks. Rules map §4-9-2 documents the effective-base API.

## Validation

Baseline before edits: full worker suite223 files,2428 passed/5 skipped (2433 total), log `/private/tmp/opt833-baseline.log` at base SHA above. The pnpm forwarded `--` ran the entire suite, which is deliberately reported as the observed scope.

Initial regression:7/7 new field/aura tests failed before implementation (`/private/tmp/opt833-red.log`); same7 passed after setting-layer/query fix. Initial expanded aura tests12/12 and authored pipeline tests13/13 passed; review correction adds2 authored base-copy pipeline cases and2 direct base/effective-copy cases. Seven focused suites passed128 tests before the final4 additional pipeline cases. The authored Linlin PLAY_CARD regression independently failed while the generated registry still carried the old inactive alias; regenerating it made the playable scenario pass.

Review finding `PRRT_kwDORn6rD86g7a3m` identified the remaining printed-only `COPY_POWER` BASE consumer. Authored OP16-036 attacking into EB04-003/Sakazuki reproduced5000 instead of required7000 before the fix (one failed/one positive control passed). A direct BASE/EFFECTIVE pair independently reproduced5000 instead of8000 while total11000 remained correct. Both scenarios pass after using `getEffectiveBasePower`; logs `/private/tmp/opt833-copy-red-pipeline.log`, `/private/tmp/opt833-copy-red-helper.log`, `/private/tmp/opt833-copy-focused.log`. Existing OP16-036 schema/disposition prose is corrected, with no runtime schema change.

The first `pnpm verify` attempt passed lint/types/bundle but exposed a pre-existing schema-audit pattern that did not recognize runtime `MODIFIER:SET_POWER`. The audit now accepts that actual base-setting representation while still rejecting additive-only power, with a red→green regression. Full gate results at the final tested head are recorded in the PR body. It includes lint, app/worker type checks, bundle gate, schema/source parity/action inventory, app/pipeline/worker coverage suites and build. No readiness is claimed while that gate is incomplete. Root dependencies reuse the isolated OPT-832 regenerated Prisma client; shared client was not regenerated. Card-text manifest generation reports canonical raw JSON unavailable and keeps its unchanged checked-in artifact. No migration or UI change. Normal merge-triggered Worker/app deployment belongs to coordinator verification.

## Follow-ups

Restore and validate OP15-070/071/092 dormant permanent base-setting modifiers as a separate sourced card-family ticket, including OP15-092's missing opponent-turn gate. Existing Mars fixture in `op13-091-marcus-mars-blocker.test.ts` uses wrong canonical cost5/power6000; this PR's new fixtures use verified6/5000. Neither unrelated fixture cleanup nor a general circular continuous-effect ordering model is part of OPT-833.

EB04-003 has a pre-existing extra `SELF_STATE: ACTIVE` gate in its authored opponent-turn aura, absent from current official card text. The base-copy regression keeps this source active to isolate OPT-833; remove that extra gate in a separate sourced follow-up. Official stats/text were independently checked through OP16 series569116 and direct EB04-003/ST06-001 cardlist searches.
