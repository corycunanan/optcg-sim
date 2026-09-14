# OPT-788 — name aliases

Implementation on `corymcunanan/opt-788-engine-name_alias-rule-modification-is-never-enforced-8-also`, based on main `a31499ba6f8d0787443501ff9c022e962e0bf01f`. PR and final validation receipt are maintained by the coordinator. This handoff records implementation, not merge readiness.

Read `shared/card-names.ts`, `shared/target-filter.ts`, `workers/game/src/engine/condition-queries.ts`, and `workers/game/src/__tests__/opt-788-name-alias.test.ts` first. Alias metadata now reaches all three shared-filter adapters (worker, deck construction, board blocker eligibility). Both top-level rules and rule-modification effect blocks contribute aliases. OP03-122 has one authoring location. Card-number aggregation enforces the ordinary four-copy limit across variants and retains unlimited-copy overrides; names do not participate in copy counting.

## Rules packet

Supported rules: `docs/rules/rule_comprehensive.md`, v1.2.0, January 16 2026, §§2-1-3, 2-14-2, 5-1-2-3. Canonical text: `docs/cards/EB-02.md` (EB02-016/024), `EB-04.md` (EB04-038), `OP-01.md` (OP01-121), `OP-02.md` (OP02-042), `OP-03.md` (OP03-122), `OP-04.md` (OP04-099), `UNKNOWN.md` (P-027), and `OP-08.md` (OP08-015). FAQ: `docs/FAQs/qa_op16.md`, OP16-034, matching the official PDF p.4 in `docs/FAQs/pdfs/qa_op16.pdf` (September 9 FAQ import). Engine references: `05-TARGETING.md`, `07-RULE-MODIFICATIONS.md`, and the §2-1 rules map. Corrected the alias specification's stale assertion that names affect ordinary copy limits.

| Clause | Evaluation / chooser / cost | Observable result | Evidence |
| --- | --- | --- | --- |
| Additional names apply in every zone | Intrinsic identity; no activation, cost, or chooser | All eight authored alias cards match their printed and alias names in field, hand, deck; exclusion rejects aliases | Nine parameterized alias cases (two for EB04-038) |
| Name-based conditions and references | At condition/target evaluation | Leader/property, named-card and reference checks use aliases symmetrically | Condition and reference tests; filtered unique-name condition still counts two printed identities |
| Name-based search | Acting player chooses a legal search pick | Exact-Oden search adds OP01-121; authored OP08-015 play searches and adds EB02-016 by its Chopper name, returning the nonmatch to deck | Pipeline activation/play, legal-target assertions, actual resolver continuation, final zones |
| Distinct names (OP16 FAQ) | Permanent power with one DON!! on Luffy | Luffy + one duo: +2000; + two duos: +2000; + duo + OP13-031: +3000 | Authored OP16-034 permanent registration and effective-power tests |
| Construction | Before game | Aliases affect ONLY_INCLUDE/CANNOT_INCLUDE; four Yamato plus four different-number Oden pass; four plus one same-number variant fail | Deck validator tests, unlimited-override regression |

`unique_names` deliberately retains printed-name grouping. Expanding aliases would inflate EB04-038; intersecting alias sets would incorrectly collapse it with OP13-031. Alias eligibility is evaluated before grouping.

## Consumer inventory

Recursively walked every value of `getAllAuthoredSchemas()` via `node --import tsx` (not text-only grep), collecting card IDs by keys/type. Counts are cards containing the key, including nested conditions/actions: `name` 268, `name_any_of` 8, `name_includes` 1 (OP16-015), `exclude_name` 125; `LEADER_PROPERTY.name` 95; `MULTIPLE_NAMED_CARDS` 3 (OP15-064, OP15-072, OP16-040); `NAMED_CARD_WITH_PROPERTY` 1 (OP15-080). `name_matching_ref`: EB02-039. `unique_names`: OP16-034/038/060. `NAME_ALIAS`: exactly the eight cards above. Actual alias-targeting SEARCH_DECK consumers include OP08-015 and OP12-108. This informed the authored Dr.Kureha execution test and preservation of shared consumer semantics.

## Validation

Baseline: existing identity and unique-name suites passed 20 tests. New regression initially failed 11/14 tests (alias eligibility, conditions, public pipeline Oden search), with all three FAQ non-regressions passing. A separate variant test demonstrated the pre-existing per-row copy-limit defect (4 base + 1 parallel erroneously accepted). Fixed suite: 16 new worker tests, existing 20 identity/distinct-name tests, and 15 deck-validation tests pass. App and worker type checks pass. `pnpm schema:check` passes (34 gate tests, 72/72 action types handled and executed); generator notes canonical external card JSON unavailable and keeps its committed card-text manifest. Temporarily disabling the alias predicate made the regression fail; restored predicate passes. Full `pnpm verify` is queued in the coordinator's serialized build slot; readiness requires its successful completion.

## Follow-ups / next work

- OPT-834 remains responsible for the separate all-names Leader target-domain and granted-Blocker gap; alias matching does not resolve it.
- Existing restricted-card validation checks each row against the one-copy limit, unlike the ordinary four-copy aggregation fixed here. Variant aggregation for ban-list restrictions is outside this ticket's alias/four-copy criteria and should be tracked separately.
- No dependency added to OPT-789/790/791/822. Their independent tracks remain runnable under coordinator scheduling. No database migration or manual production command is required.
