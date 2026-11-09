# Comprehensive Rules v1.2.0 → v1.2.1

Official v1.2.1 is dated 8/28/2026. `rule_comprehensive.pdf` is now the official v1.2.1 PDF (sha256 `4709b6327b396ffa3cff9f773adfa560d4be66a3162aa4176b4523a552161bd0`); v1.2.0 stays in git history. `rule_comprehensive.md` was updated to match.

The diff was made word by word from `pdftotext` output of both PDFs (OPT-957, 2026-11-09). Page-number moves are ignored. The PDF has no changelog of its own.

## Unchanged sections the audit asked about

- §3 Game Areas: unchanged, except the new 3-1-2-1 below.
- §9 Rule Processing: unchanged.
- §10-2-17 [On K.O.]: unchanged.

## Every changed section

| Section | Change | Engine impact | Citing tests and code |
|---------|--------|---------------|-----------------------|
| 2-7-3 | Event activation now reads "rest those DON!! cards, trash the revealed card, then activate and resolve the effect" (was "and then trash the revealed card to activate it"). | None. The engine already trashes an activated Event before it resolves. | Handoff docs only (`docs/project/handoffs/`). |
| 2-10-3, 2-10-4 (new) | An effect may change a card's Counter value; with several Counters only the highest applies. | None. `counter-value.ts → getEffectiveCounterValue()` already takes the maximum of the printed Counter and every COUNTER_GRANT. | None. Map row added. |
| 3-1-2-1 (new) | "If you have…", "if your opponent has…", "if you do not have…" conditions refer to the field unless specified. | None. Field-presence conditions already read field zones. | Tests citing 3-1-2 (`unit.test.ts`, `opt-426-…`, `opt-793-…`) cite the unchanged parent rule. Map row added. |
| 4-10-2 | Adds: "However, if a preceding 'if' clause has not been resolved as outlined in 4-10-1., the following clause in that text cannot be resolved." | None. OPT-1027 already skips the following THEN after a failed inline condition (rule 4-10-1). The new text writes that rule into 4-10-2. | `opt-970-if-then-chain.test.ts`, `opt-799-action-optional.test.ts`, `resolver.ts`, `resume/choice.ts`, `effect-types.ts`. Their 4-10-2 citations are for failed *then* clauses, which still do not block the next clause. Map row added. |
| 4-11-2 | Editorial: the v1.2.0 PDF repeated the « Set Power to 0 » text inside 4-11-2. It was removed; 4-12 keeps it. | None. The Markdown already omitted the duplicate. | None. |
| 7-1-2-3 | Editorial: the v1.2.0 PDF appended the Counter Step bail-out sentence to 7-1-2-3. It moved to 7-1-3-1-3. The Block Step bail-out text is unchanged. | None. | `opt-967-step-end.test.ts`, `timing-baseline/battle-step-end.test.ts`, `battle.ts`, `battle-step-boundary.ts` cite the unchanged Block Step rule. |
| 7-1-3-1 | **Removed:** "Effects of the player being attacked that read 'when attacked' activate." The rest of the Counter Step is renumbered: 7-1-3-2 → 7-1-3-1, 7-1-3-2-1 → 7-1-3-1-1, 7-1-3-2-2 → 7-1-3-1-2, 7-1-3-3 → 7-1-3-1-3. | **Possible.** v1.2.1 lists 「When Attacked」 only in the Attack Step (7-1-1-3). The engine fires [When Attacked] on the final target between the Block and Counter Steps, following the OP03-001 FAQ (`qa_op03.md`). Behavior kept; ruling question filed as OPT-1039. | `opt-246-when-attacked-target-locked.test.ts`, `opt-834-leader-blocker.test.ts` (FAQ-cited, no rule number). Renumbered citations updated in `battle.ts`, `modifiers.ts`, `replacements.ts`, `effect-types.ts`, `opt-967-step-end.test.ts`, `opt-967-authored-battle.test.ts`, `opt-903-sabo-replaced-card-power.test.ts`, `opt-1035-counter-power-reads.test.ts`, `timing-baseline/README.md`, `RULE-INDEX.md`, `RULES-TO-ENGINE-MAP.md`, `VALUE-LAYER-CONTRACT.md`, `GAME-ENGINE-REQUIREMENTS.md`. |
| 8-3-1-4 | Declining a "may" cost now means "the effect as written after the : colon mark cannot be activated" (was "the effect cannot be activated"). | None. Costs are modeled per effect block, so declining one skips that block's post-colon actions only. | `opt-798-…`, `opt-824-give-don-cost.test.ts`, `opt-850-…`, `opt-864-…`, `opt-868-…`, `event-activation.ts`. All test that the post-colon effect does not run, which the new text keeps. |

Historical audits, handoffs and the consolidation proposal keep their v1.2.0 citations as written; this table is the crosswalk for them.

## Line-number citations

The Markdown gained 2-10-3/2-10-4 and 3-1-2-1 and lost the old 7-1-3-1, so rule lines after 2-10 shifted by +4, +6, then +4. Every `rule_comprehensive.md:<line>` and "Rule X (line N)" citation in live engine code, tests, snapshots and `RULES-TO-ENGINE-MAP.md` was remapped to the new file. Historical audits, handoffs and the `opt-966` historical fixture keep their v1.2.0 line numbers.
