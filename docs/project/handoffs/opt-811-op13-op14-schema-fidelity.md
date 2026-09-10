# OPT-811 — OP13/OP14 schema fidelity

## Recovery and scope

Recovered existing clean clone `/private/tmp/optcg-opt811` and branch `corymcunanan/opt-811-schema-sweep-g-op13op14-op13-002-don_requirement-op13-016`, fast-forwarded from `50331c89f742b4a0a04a6e6d8465b97e7999317f` to current main `caf29b1058dddf3dd26357c708ae42f9743e3426`. No prior ticket changes or PR were overwritten. Stop at merge-ready; no merge or Linear write by implementer.

Changes are confined to `op13.ts`, `op14.ts`, the generated production registry, this handoff and ticket pipeline regressions. No shared engine changes.

## Rules and acceptance mapping

Sources: `docs/cards/OP-13.md`, `docs/cards/OP-14.md`; `docs/FAQs/qa_op14_eb04.md` (September 9, 2026 import, Law friendly Character ruling, Issho attack ruling, Hancock mandatory and per-Character draw rulings); comprehensive rules v1.2.0 §§3-1-6/3-1-7 (zone identity/order), 6-2 (Refresh), 8-1-3-4 (replacement, including infeasible substitutes), 8-3-2 (conditions), 8-6 (auto-effect ordering), 10-2-9/10-2-12 (DON/opponent turn). Engine references: `RULES-TO-ENGINE-MAP.md`, `04-ACTIONS.md` SWAP_BASE_POWER/RETURN_TO_DECK, `05-TARGETING.md` FIELD_CARD/dual targets. No ruleset migration.

| Card/clause | Condition, cost and chooser | Implementation and observable pipeline evidence |
| --- | --- | --- |
| OP13-002 Ace draw | Attached DON ≥1; damage or friendly ≥6000 base Character KO; once/turn | Already correctly encoded by DON_GIVEN SPECIFIC_CARD condition; retained. Existing `opt-833-base-power-pipeline.test.ts` authored Mars KO/Vista scenarios cover 6000/4000 base, DON present/absent, battle KO, correct hand growth. All 15 existing cases rerun. |
| OP13-016 Garp | On Play; controller's Leader exactly Sabo, Ace or Luffy; pick up to1 cost≥3 of four | Supported any_of LEADER_PROPERTY clauses (name_any_of is not a LeaderPropertyCheck). Four Leader names, cost2 excluded/cost3 accepted, zero pick, distinct remainder ordering and actual hand/deck result. |
| OP14-009 Law | Opponent attack; optional trash2 hand; own Leader plus one own Character; battle duration | Exact1 Leader and exact1 Character dual slots. Reject two Characters, one card, and opponent Leader; pay two cards, swap 5000/7000 base, leave unselected 4000 unchanged. FAQ excludes opponent Characters; SELF pool includes only friendly cards. |
| OP14-016 Drake | Opponent turn; opponent effect removes friendly Supernovas; optional Leader −2000 substitute | Opponent IS_MY_TURN gate. Authored EB01-010 counter KO on controller's turn proceeds with no replacement; authored ST06-001 KO on opponent turn accepts substitute and preserves victim, Leader becomes3000. Decline completes KO. |
| OP14-029 Tashigi | Opponent turn; opponent effect removal; optional rest friendly card substitute | Opponent IS_MY_TURN gate. Same authored counter/main KO comparison; accepted substitute rests Leader and preserves victim; decline completes KO. |
| OP14-021 Issho | Own-turn rest from attack; optional top Life to hand; if done, choose up to1 rested opposing Character OR Stage | FIELD_CARD filtered to CHARACTER/STAGE with a single count cap1. Stage only, Character only, both; reject selecting two; exclude Leader/active Character. Complete next Refresh: chosen card stays rested and unselected cards activate. Zero choice, no Life, and decline covered. |
| OP14-022 Usopp | End of own turn; Leader FILM OR Straw Hat Crew; choose0–2 rested DON | Supported any_of LEADER_PROPERTY clauses. FILM, Straw Hats, both (one activation), Navy negative; choices0/1/2 yield exact active DON counts. |
| OP14-041 Hancock | Opponent turn, friendly plays only; mandatory draw1 per Character | SELF trigger filter. Authored OP16-105 Moria Trigger plays1/2/3 friendlies and draws1/2/3; opponent play and own-turn friendly play draw0. True multi-target batch: authored ST06-001 KOs EB03-053 Nami; Nami's authored OnKO plays ST13-006 Curly.Dadan; Dadan's single authored PLAY_CARD action plays1/2/3 named cost2 Characters. Assert one draw for Dadan plus1/2/3 for its batch, draining mandatory trigger-order prompts (including disabled already-chosen choices). |
| OP14-092 Mr3 | Opponent turn; optional replace KO by putting exactly3 trash cards at deck bottom in chosen order | RETURN_TO_DECK with CARD_IN_TRASH exact3, opponent-turn and TRASH_COUNT≥3 conditions. PLACE_FROM_TRASH_TO_DECK exists as a cost, not an action; using it as suggested would fail schema boot. Accept replacement, reject2-card response, arrange distinguishable cards in reverse order, preserve victim and empty trash. Own-turn counter KO proceeds; decline and trash counts0/1/2 complete KO. |

Tests use real registered production schemas and `runPipeline`, completing prompts with durable `resumePromptLifecycle`; no invented effect blocks or schema-shape-only acceptance. Small fixture card metadata varies unrelated stats/names/types to isolate predicates; the Dadan/Nami/Moria effects themselves are unmodified production definitions. Search response validity is enforced one layer above the continuation in session/coordinator.ts; the cost-boundary test verifies the actual prompt pool and completes a legal response.

## Validation

- Base `caf29b1`: `pnpm verify` passed lint, both type checks, bundle capacity, schema check, app tests (2360 passed/7 skipped), pipeline tests (48 passed), worker coverage (2458 passed/5 skipped); failed only build Google Fonts fetch in network sandbox. Log `/private/tmp/opt811-baseline-verify.log`. Elevated `pnpm build` then exited0, `/private/tmp/opt811-baseline-build.log`. Database suites skipped by existing configuration without TEST_DATABASE_URL.
- Red before green: `/private/tmp/opt811-red.log` and `/private/tmp/opt811-red-replacements.log` reproduce the individual missing clauses before their edits.
- Final guard check: temporarily restored both original main schemas and regenerated registry, ran the final ticket suite: 20 failed/20 passed. `/private/tmp/opt811-final-red.log`. Restored both green schema backups and regenerated through `pnpm --filter optcg-game schema:generate`.
- Restored final focused command: `pnpm --filter optcg-game exec vitest run src/__tests__/opt-811-authored-pipeline.test.ts src/__tests__/opt-833-base-power-pipeline.test.ts --maxWorkers=1` — 55 passed (40 ticket +15 existing); `/private/tmp/opt811-final-focused.log`.
- Final required `pnpm verify` runs after this handoff's commit under coordinator's reserved resource slot. Exact tested commit, exit and `/private/tmp/opt811-final-verify.log` are recorded in PR Validation and coordinator receipt. This handoff does not predeclare that gate or independent review successful.

## Follow-ups / bounded exclusions

- Retained ticket-documented OP13-112 Vegapunk approximation: requirement is ≥2 total attached DON across all cards; current ANY_CARD_HAS_DON checks one card. No speculative engine rewrite.
- OP13-007/078 and OP14-045/049/054/056/079 remain in their ticket-assigned engine follow-ups (OPT-804/794/795/793/799). OP14-024 Stage/DON targeting is OPT-792. Tashigi's broader "your cards" payment vocabulary is not expanded by this turn-gate change.
- Moria's current three THEN actions are sequential in production; the separate Dadan true-batch regression proves the FAQ's per-Character multiplicity without modifying sibling-owned OP16 schemas.

Coordinator must inspect final diff/head, arrange fresh independent review and assess current GitHub required ci check against main. PR remains open; implementer does not claim merge-ready from local checks alone.
