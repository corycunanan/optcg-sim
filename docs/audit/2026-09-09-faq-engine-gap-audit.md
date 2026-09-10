# FAQ import and engine gap audit — 2026-09-09

Imported all ten supplied PDFs and converted their 223 Q&A entries to the existing FAQ Markdown format. Found **nine unaddressed work groups**, **one missing card in an existing issue's scope**, and **one queued change that would contradict an explicit FAQ ruling**. Engine implementation was not changed.

## Scope and evidence

Repository baseline: `e0a279d692a3ac0ce694af4aebd550a67adf592b`. This audits the current checkout and generated authored-schema registry, not deployed databases or isolated worktrees. Existing unrelated local changes were preserved.

Read all 37 PDF pages through table extraction, inspected rendered first pages for all ten documents and the anomalous final OP14 page, and compared every converted question/answer cell to the Markdown. Reviewed all FAQ-referenced authored schemas against the rulings; investigated shared handlers and ran focused tests/probes for the findings below. This is a static audit with targeted execution, not a claim that all 223 rulings have end-to-end regression tests.

Queried Linear live on September 9: **62 open OPT issues** (26 Todo, 34 Backlog, 2 In Progress, no Triage), with no pagination remaining. Retrieved full descriptions for relevant overlapping tickets and searched the affected card IDs/mechanics, including completed work. [Open-issue snapshot](2026-09-09-faq-linear-snapshot.json) records the reviewed queue. “Unaddressed” means no matching acceptance scope was found in that queue; completed tickets are historical context, not upcoming coverage. No Linear writes were made.

## Conversion audit

| Document | Pages | Q&A entries | Result |
| --- | ---: | ---: | --- |
| [OP14-EB04](../FAQs/qa_op14_eb04.md) | 10 | 64 | Updated existing PDF/Markdown |
| [OP16](../FAQs/qa_op16.md) | 9 | 60 | Added |
| [OP17](../FAQs/qa_op17.md) | 9 | 60 | Added |
| [ST30](../FAQs/qa_st-30.md) | 3 | 15 | Added |
| [ST31](../FAQs/qa_st-31.md) | 1 | 4 | Added |
| [ST32](../FAQs/qa_st-32.md) | 1 | 2 | Added |
| [ST33](../FAQs/qa_st-33.md) | 1 | 5 | Added |
| [ST34](../FAQs/qa_st-34.md) | 1 | 5 | Added |
| [ST35](../FAQs/qa_st-35.md) | 1 | 2 | Added |
| [ST36](../FAQs/qa_st-36.md) | 1 | 6 | Added |
| **Total** | **37** | **223** | **All pairs checked** |

PDFs are under `docs/FAQs/pdfs/` with matching filenames. The [source manifest](2026-09-09-faq-source-manifest.json) records SHA-256 hashes and per-file counts. All ten copies are byte-identical to the supplied Downloads files. Markdown retains `#` document titles, `## CARD-ID — Name`, and `**Q:**` / `**A:**` paragraphs. Only in-cell whitespace is normalized; source wording and apparent source typos are retained.

The updated OP14 file adds rulings for OP14-020 (paying the rest cost without a cost-5 Character) and OP14-041 (draw once for each simultaneously played Character). Its last page contains an **empty EB04-038 row**. The previous converter merged that row into Charlotte Pudding's heading; the new conversion correctly assigns the question to EB04-034 and omits the empty Q&A row. OP16-040 and OP16-048 appear again at the ends of OP16 and OP17; these source repetitions are preserved.

Source caveats: OP16-097's question says Impel Down although the authored card uses Land of Wano; EB04-034's question abbreviates the trash requirement without specifying Event cards. Neither abbreviation is sufficient reason to rewrite the card schema. The PDFs do not establish a publication date, so filenames and hashes identify this import rather than an inferred release date.

## Unaddressed findings

### F1 — High: competing base-power setters use last-wins instead of highest value

**Rulings:** OP17-043 (PDF p.3), OP17-008 (p.1), ST34-004 (p.1). When multiple base-setting effects apply, the higher setting wins. Ganzui cannot overwrite an existing 7000 setting with 6000; Linlin's 0 setting loses to 6000.

**Current behavior:** [getEffectivePower](../../workers/game/src/engine/modifiers.ts#L420) orders setters by turn-player priority and takes the last at lines 443–478. The audit probe applies 8000 then 6000 and reads **6000**, expected **8000**. Existing OPT-225/OPT-241 tests encode last-wins assumptions and must be reconciled, not merely supplemented.

**Needed:** a base-setting layer that implements the FAQ precedence, preserves additive power and DON!! separately, and handles expiry and both controllers. Test both application orders, both controllers, overlapping durations, 0 vs 6000, and 7000 vs 8000. No open ticket found for this correction.

### F2 — High: base-power filters still read printed power after base power changes

**Rulings:** OP17-112 (p.8) says a Character whose base becomes 8000 no longer counts as base 4000. OP14-003 (p.1) and OP14-053 (p.5) also depend on a modified base, including at K.O. timing.

**Current behavior:** [condition-queries.ts](../../workers/game/src/engine/condition-queries.ts#L1029) supplies `basePower: data.power` to [shared filters](../../shared/target-filter.ts#L317). The probe sets a printed-5000 card to base 8000; `base_power_exact: 8000` returns **false**. This is separate from F1 and reproduces with only one setter. Swap capture also explicitly reads printed values in `actions/modifiers.ts:539` and needs review under the same distinction.

**Needed:** a shared effective-base-power read distinct from total power, wired into field filters, source filters, and last-known-information snapshots. Avoid self-referential aura evaluation when OP17-112 selects printed/base-4000 recipients and changes their base. Preserve printed reads outside the field where appropriate. Test grants, K.O. snapshots, protection source filters, swaps, and aura stability. OPT-248 is Done and its tests deliberately assert printed-base behavior; no upcoming corrective issue was found.

### F3 — High: all-names Leaders are excluded from OP16-048 and OP16-058

**Rulings:** OP16-048 (OP16 p.9; OP17 p.9) may grant Blocker to an all-names Leader. OP16-058 (OP16 p.5) sets such a Leader's base to 7000.

**Current behavior:** both [Buggy](../../workers/game/src/engine/schemas/op16.ts#L1070) and [The Prisoners Are Rioting!!](../../workers/game/src/engine/schemas/op16.ts#L1260) use `target.type: CHARACTER`. Both target probes exclude the Leader despite its all-identities rule. Downstream, [validateDeclareBlocker](../../workers/game/src/engine/validation.ts#L232) rejects any non-Character with “Blocker must be a Character,” so changing Buggy's schema alone is insufficient.

**Needed:** expand those card target domains while retaining the name filter; support eligible Leaders in Blocker legality, selection UI, rest/redirect handling and battle resolution. Test an active granted-Blocker Leader, a rested Leader, no grant, and normal Characters. OP16-058 was explicitly deferred inside completed OPT-413. Upcoming OPT-788 concerns name aliases; it does not expand these target domains or implement Leader blocking. OPT-812 does not include either card.

### F4 — High: OP16-119 publicly reveals its secret Life selection

**Ruling:** OP16-119 (p.9) places the chosen card into Life without revealing it to the opponent.

**Current behavior:** [handleArrangeSearchDeck](../../workers/game/src/engine/effect-resolver/resume/deck.ts#L163) emits `CARDS_REVEALED` with `visibility: BOTH` **before** branching to `LIFE_TOP`. The probe confirms that public event; [visibility.ts](../../workers/game/src/engine/visibility.ts#L192) leaves it unredacted. Face-down storage does not undo the disclosure in the event history.

**Needed:** encode and honor whether a search selection must be revealed; do not infer it solely from destination because other searches require a reveal. Test both players' event streams, spectators, reconnect history, and ordinary reveal-to-hand searches. OPT-404 and OPT-774 are completed routing work. Open OPT-570 concerns a different, latent spectator under-reveal; OPT-816 concerns lint coverage. Neither addresses this leak.

### F5 — High: OP17-118 gains Counter with zero Characters

**Ruling:** OP17-118 (p.8) explicitly says it does not have Counter +2000 with zero Characters.

**Current behavior:** [hand_counter_grant](../../workers/game/src/engine/schemas/op17.ts#L4173) only checks that no friendly Character has a printed Counter. An empty board passes. The probe returns **2000**, expected **0**. [OPT-726's existing regression](../../workers/game/src/__tests__/opt-726-hand-counter-grant.test.ts#L137) explicitly expects the incorrect empty-board success.

**Needed:** require at least one friendly Character as well as the no-Counter predicate. Replace the contradictory test; retain positive nonempty and negative mixed-board tests and Counter-step validation. OPT-726 is Done; no upcoming fix found.

### F6 — High: OP17-049's draw option draws for the wrong player

**Ruling:** OP17-049 (p.3): the opponent chooses the branch, but the player who activated the effect draws two cards.

**Current behavior:** [the draw branch](../../workers/game/src/engine/schemas/op17.ts#L1764) wraps `DRAW` in `OPPONENT_ACTION`. `OPPONENT_CHOICE` changes only who chooses, whereas that wrapper flips action control. Choosing draw in the probe changes hands by **[0, +2]**, expected **[+2, 0]**. The existing integration test covers only the discard option.

**Needed:** correct the draw branch's controller and test both branches plus the allowed discard choice with zero/one hand cards. No open issue found; OPT-728 is Done.

### F7 — High: OP17-075 and OP17-099 let the hand owner choose the discarded card

**Rulings:** OP17-075 (p.5) requires the effect user to choose from the opponent's face-down hand; OP17-099 (p.6) similarly requires a blind/random selection by the effect user.

**Current behavior:** both branches use `OPPONENT_ACTION` around hand removal. The action probes return `respondingPlayer: 1` for an effect controlled by player 0, expected player 0 choosing without seeing identities. Existing [OP17-075 tests](../../workers/game/src/__tests__/opt-729-op17-schemas-c.test.ts#L255) and [OP17-099 tests](../../workers/game/src/__tests__/opt-727-op17-schemas-a.test.ts#L394) assert the wrong chooser.

**Needed:** represent chooser, hand owner and visibility separately; blind selectable slots or an explicitly equivalent engine random choice must not expose identities. Test prompt recipient, hidden payloads, chosen-card removal, replay/persistence and both controllers. Retain normal owner-choice discard behavior for OP17-091/106. No upcoming issue covers these card corrections.

### F8 — Medium: OP17-050's deck arrangement is discarded on resume

**Ruling:** OP17-050 (p.4) puts both looked-at cards together at the top or bottom; splitting is forbidden.

**Current behavior:** [DECK_SCRY](../../workers/game/src/engine/effect-resolver/actions/draw-search.ts#L269) produces an arrangement prompt, but [resume-core.ts](../../workers/game/src/engine/effect-resolver/resume-core.ts#L102) has no DECK_SCRY arrangement branch. The probe chooses bottom for both cards, then the following DRAW draws the original first card, not the original third card. This is a missing resume implementation, not proof that the UI allows a forbidden split.

**Needed:** apply the complete ordered group to the selected destination before continuing. Test top/bottom, reversed order, short decks, persisted resume and rejection of partial/split responses. OPT-815 only resets stale modal state, and no open issue owns this handler gap.

### F9 — Medium: ST33–ST36 have no authored set coverage or upcoming import scope

The registry contains no schemas for the **13 distinct FAQ-referenced cards** in ST33–ST36. No ST33, ST34, ST35 or ST36 issue was returned by the live issue searches; the full open queue has no equivalent import scope. [OPT-831](https://linear.app/optcg-sim/issue/OPT-831) expressly covers **ST31/ST32 only**.

Needed work is canonical card-data import plus schemas and behavior tests, not inferring full card text from FAQ excerpts:

| Set | FAQ-referenced cards | Required acceptance cases |
| --- | --- | --- |
| ST33 | 001, 002, 003, 004 | Hand costs must be payable; Sakazuki may pay below the opponent hand threshold; Borsalino's hand-cost reduction observes opponent-effect discard. |
| ST34 | 001, 002, 004 | Katakuri's shared per-turn restriction across copies; Cracker's two independent clauses; Linlin's full composite cost and highest base-setting precedence. |
| ST35 | 003 | Opponent chooses own discard; Karasu may pay the mill cost below the hand threshold. |
| ST36 | 001–005 | Hand/trait costs, own-turn On Play restriction, draw despite a failed later Leader gate, and top/bottom Life face-change cost feasibility. |

Dependencies already exist in the queue: OPT-795 for hand-trash event semantics and OPT-798 for a mill-cost primitive. Those dependencies do not supply the missing sets or card encodings. ST31/ST32 are deliberately excluded from this new-import finding because OPT-829/831 already cover previews/full sets.

## Existing issues that need scope correction

**Regression risk — OPT-812 / OP16-081.** The [Todo ticket](https://linear.app/optcg-sim/issue/OPT-812) requests changing Otama's `CARD_ON_FIELD` from EITHER to SELF. The supplied OP16 FAQ (p.7) explicitly permits activation when only the opponent has a cost-8-or-higher Character. Current code and OPT-413's tested EITHER behavior agree with the FAQ. **Remove/reconcile that requested change before implementation.** The FAQ does not settle the ticket's separate low-power Monkey.D.Luffy alternative in OP16-001; keep those questions separate.

**Missing card scope — OP14-024 Kin'emon.** Its FAQ (p.2) allows resting a Leader, Character, Stage or DON!! card. [The schema](../../workers/game/src/engine/schemas/op14.ts#L816) uses LEADER_OR_CHARACTER, excluding Stage/DON!!. [OPT-792](https://linear.app/optcg-sim/issue/OPT-792) owns mixed-pool support and enumerates eleven other cards, but does not include OP14-024; OPT-811 also omits it. Extend that acceptance scope or add a schema follow-up, including a shared maximum of one selection and active-only candidates. This remains unaddressed at card level even if OPT-792 ships as written.

**Guardrail — OPT-788 / OP16-034.** The FAQ's three Rosinante & Law examples say aliases do not become extra distinct card names and two copies remain one name. Current printed-name deduplication satisfies those examples. [OPT-788](https://linear.app/optcg-sim/issue/OPT-788) proposes alias support including `unique_names`; add these examples as non-regression tests so alias expansion does not inflate the count or collapse the separate Trafalgar Law card incorrectly.

## Already covered or queued

| Ruling/mechanic | Disposition |
| --- | --- |
| ST31/ST32 missing full sets; ST31-004 preview | OPT-803 split into OPT-829 (preview schemas), OPT-830 (docs coverage), OPT-831 (full sets). Add supplied ST31/ST32 FAQ cases to those validations; not a new import finding. |
| OP14-045/049 effect-discard Rush and OP14-056 negation trigger | OPT-795 owns the wrong-event correction. Opponent Trigger effects must be covered; these FAQs do not answer every activation-cost provenance question in the ticket. |
| OP14-054 hand down to five | OPT-793 explicitly owns it. |
| OP14-009 required Leader plus Character; OP14-021 target domain; OP14-029 opponent-turn replacement; OP14-041 self-play filter | OPT-811 explicitly owns these. Add OP14-041's new multi-play/draw-count case to its behavior tests. |
| OP14-079 optional mill clause | OPT-799 explicitly owns it. |
| OP16-041 removed-from-field trigger breadth | OPT-794 owns the shared missing exit events; preserve the FAQ's exclusion of rule overflow trash and inclusion of own-effect bounce. |
| OP14-020 pay rest before checking board; EB04-022 pay hand cost below threshold; EB04-034 check after payment | Authored post-cost conditions already express this ordering. |
| OP16-040 all-names Leader; OP16-025/029/057 positive name checks; OP17-010 Fossa negative check | Existing field/name predicates include the Leader. Fossa audit control returns false as required; no new finding. |
| OP16-014 / OP17-015/021/023/095 simultaneous replacements | Existing batch replacement scanner groups protected targets and pays once; relevant replacement coverage exists. Not reported as an absent primitive. |
| OP16-118 Counter sets instead of stacks; OP17-063 interaction | Highest grant reader exists; focused Counter suites pass. |
| OP16-103 reused timing; OP16-107 unpayable Trigger; OP16-080 final attack target | Existing OPT-413 tests pass. |
| OP17-079 externally granted Blocker and recipient negation | Effective-keyword predicate preserves external grants; cost-sensitive aura filtering exists. |
| OP17-117 mandatory full three-card discard alternative | OPT-730 completed feasibility support and explicit FULL_TARGET_COUNT requirement exist. |
| OP17-119 total-cost K.O. pool, zero-cost targets, multiple targets | Aggregate constraint and any-number target encoding exist. |

## Validation and practical limits

- **Conversion:** 10/10 source-byte comparisons; 223 questions and 223 answers; all 223 pairs match normalized source table cells; no replacement-glyph or `(cid:...)` extraction markers. Empty EB04-038 row visually verified.
- **Existing worker tests:** 8 files, **113 tests passed**: OPT-413, OPT-225, OPT-247/248, OPT-727, OPT-728, OPT-729, OPT-400 and OPT-726.
- **Read-only audit probes:** [2026-09-09-faq-probes.cts](2026-09-09-faq-probes.cts) records expected FAQ results beside actual engine results. Run `node --import tsx docs/audit/2026-09-09-faq-probes.cts` from the repo root. Twelve probes: eleven mismatches and one correct Fossa control. The two discard probes exercise the authored resolving branches after payment/choice; they do not claim a full UI replay. The Leader Blocker validator probe isolates the Character-only guard with a keyword-enabled Leader fixture.
- Existing green tests are not proof of FAQ conformity: some explicitly assert the now-contradicted behavior. No production engine code, database, deployment, or Linear issue was modified.
- No full-suite or browser run was needed for document import. Proposed engine fixes still need complete pipeline/persistence/UI tests appropriate to each finding. The static review of remaining rulings is not exhaustive runtime certification.

Recommended implementation order: stop the Otama regression; fix the public reveal and wrong-player choices; correct power semantics with their contradictory tests; implement Leader targeting/Blocker and deck-scry resume; close Counter and mixed-pool card omissions; then import ST33–ST36 with their dependency gates.
