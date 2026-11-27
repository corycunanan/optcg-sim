# Project Handoffs — archive index

**The handoff practice is retired. Do not add or edit files in this folder or in `archive/`.**

From April to October 2026, agents wrote a handoff doc per Linear project (an Action Plan table plus per-ticket handoff entries), and later per-ticket notes and run ledgers. The Action Plan tables duplicated Linear and went stale within days, and handoff commits re-triggered review and caused merge conflicts between parallel PRs. As of 2026-11-03 the practice is retired.

## Where this lives now

| Need | Home |
| --- | --- |
| Execution order and status | Linear: roll-up parent issues for PR boundaries, `blockedBy` for order |
| What the next agent should know | The **Handoff** section of the PR body; the coordinator copies points a later ticket needs into a comment on that Linear issue or its parent |
| Follow-ups | PR body **Follow-ups**, then Linear tickets |
| Run checkpoint and readiness receipt | A local scratch file during the run; the receipt is posted as a PR comment |
| Lessons that outlive one ticket | `.claude/skills/orchestrate/GOTCHAS.md`, `CLAUDE.md`/`AGENTS.md`, or the engine docs |

See `docs/project/ORCHESTRATION-CHARTER.md` §2 and §4 and the `ticket` skill.

## Archive policy

- Every historical handoff file lives under [`archive/`](./archive/). Only this index stays at the top level.
- Treat everything in `archive/` as historical evidence: reverify claims against current code before relying on it. Action Plan statuses are frozen and not authoritative.
- Engine docs (`docs/game-engine/`, the schema README, fixture READMEs) link to inventories, stage contracts, and rules handoffs in `archive/`. When you move or delete an archived file, update those links in the same change.
- Nothing new goes into `archive/`. Durable knowledge belongs in the homes listed above.

## Index

### Linear project handoffs

| Handoff | File |
| --- | --- |
| [Animation Sandbox](./archive/animation-sandbox.md) | `animation-sandbox.md` |
| [API Scale & Hardening](./archive/api-scale-hardening.md) | `api-scale-hardening.md` |
| [Architecture Floor](./archive/architecture-floor.md) | `architecture-floor.md` |
| [Card Animations](./archive/card-animations.md) | `card-animations.md` |
| [Deck Legality](./archive/deck-legality.md) | `deck-legality.md` |
| [Game Board Reliability](./archive/game-board-reliability.md) | `game-board-reliability.md` |
| [Game Engine Consolidation](./archive/game-engine-consolidation.md) | `game-engine-consolidation.md` |
| [Game Engine Correctness](./archive/game-engine-correctness.md) | `game-engine-correctness.md` |
| [In-Game Effect Display: Availability & Clause Highlighting](./archive/in-game-effect-display-availability-and-clause-highlighting.md) | `in-game-effect-display-availability-and-clause-highlighting.md` |
| [Interaction Design Audit](./archive/interaction-design-audit.md) | `interaction-design-audit.md` |
| [Lobby & Nav VQA Polish](./archive/lobby-and-nav-vqa-polish.md) | `lobby-and-nav-vqa-polish.md` |
| [Lobby Room UX](./archive/lobby-room-ux.md) | `lobby-room-ux.md` |
| [Notification Center](./archive/notification-center.md) | `notification-center.md` |
| [Persistent Party Lobby](./archive/persistent-party-lobby.md) | `persistent-party-lobby.md` |
| [Pre-Game Flow](./archive/pre-game-flow.md) | `pre-game-flow.md` |
| [Prompt Clause Gaps: Start-of-Game and Nested Branch Prompts](./archive/prompt-clause-gaps-start-of-game-and-nested-branch-prompts.md) | `prompt-clause-gaps-start-of-game-and-nested-branch-prompts.md` |
| [Prompt Effect Descriptions: Clause-Scoped Modal Text](./archive/prompt-effect-descriptions.md) | `prompt-effect-descriptions.md` |
| [Realtime Social](./archive/realtime-social.md) | `realtime-social.md` |
| [Responsive Game Board](./archive/responsive-game-board.md) | `responsive-game-board.md` |
| [Soak-Window Tech Debt Cleanup](./archive/soak-window-cleanup.md) | `soak-window-cleanup.md` |
| [Solitaire Mode](./archive/solitaire-mode.md) | `solitaire-mode.md` |
| [Spectator Mode](./archive/spectator-mode.md) | `spectator-mode.md` |
| [Target instructions — OPT-775](./archive/target-instructions.md) | `target-instructions.md` |
| [Tech Debt Handoff — Project Complete](./archive/tech-debt.md) | `tech-debt.md` |
| [UX Hardening Handoff - Project Complete](./archive/ux-hardening.md) | `ux-hardening.md` |

### Ticket handoffs and inventories

| Handoff | File |
| --- | --- |
| [OPT-1002 implementation handoff](./archive/OPT-1002-implementation.md) | `OPT-1002-implementation.md` |
| [OPT-717 OP-17 Schema-Gate Inventory](./archive/OPT-717-gate-inventory.md) | `OPT-717-gate-inventory.md` |
| [OPT-789 — Lim's rested entry](./archive/OPT-789.md) | `OPT-789.md` |
| [OPT-790 — Roger DON!! Phase](./archive/OPT-790.md) | `OPT-790.md` |
| [OPT-805 — authored Crocodile and deck search fidelity](./archive/OPT-805.md) | `OPT-805.md` |
| [OPT-814 — authored EB03/EB04/P/PRB02 fidelity](./archive/OPT-814.md) | `OPT-814.md` |
| [OPT-847 — Rest host and effect-source fidelity](./archive/OPT-847.md) | `OPT-847.md` |
| [OPT-850 — nested Event Main activation](./archive/OPT-850.md) | `OPT-850.md` |
| [OPT-1005 semantic reader prerequisite](./archive/opt-1005-self-damage-reader.md) | `opt-1005-self-damage-reader.md` |
| [OPT-1005 gameplay candidate (OPT-996, OPT-993)](./archive/opt-1005-writer.md) | `opt-1005-writer.md` |
| [OPT-783 — Public facet vocabulary](./archive/opt-783-facet-vocabulary.md) | `opt-783-facet-vocabulary.md` |
| [OPT-788 — name aliases](./archive/opt-788-name-aliases.md) | `opt-788-name-aliases.md` |
| [OPT-791 damage Life destination — implementation handoff](./archive/opt-791-damage-life-destination.md) | `opt-791-damage-life-destination.md` |
| [OPT-794 removal watchers](./archive/opt-794-removal-watchers.md) | `opt-794-removal-watchers.md` |
| [OPT-795 — Hand-trash effect watchers](./archive/opt-795-hand-trash-watchers.md) | `opt-795-hand-trash-watchers.md` |
| [OPT-806 — OP04/ST05/ST06 schema fidelity](./archive/opt-806-schema-sweep-b.md) | `opt-806-schema-sweep-b.md` |
| [OPT-807 — schema corrections with named-play prerequisite](./archive/opt-807-schema-sweep-c.md) | `opt-807-schema-sweep-c.md` |
| [OPT-808 — OP07 / OP08 authored-card recovery](./archive/opt-808-schema-sweep-d.md) | `opt-808-schema-sweep-d.md` |
| [OPT-809 — selected-card references and Law's optional Life play](./archive/opt-809-schema-sweep-e.md) | `opt-809-schema-sweep-e.md` |
| [OPT-810 — Leader alternatives and next paid hand-play scope](./archive/opt-810-checkpoint.md) | `opt-810-checkpoint.md` |
| [OPT-811 — OP13/OP14 schema fidelity](./archive/opt-811-op13-op14-schema-fidelity.md) | `opt-811-op13-op14-schema-fidelity.md` |
| [OPT-812 — OP15 / OP16 fidelity recovery](./archive/opt-812-schema-sweep-h.md) | `opt-812-schema-sweep-h.md` |
| [OPT-813 — continuous turn power](./archive/opt-813-continuous-turn-power.md) | `opt-813-continuous-turn-power.md` |
| [OPT-818 — idempotent field-entry registration](./archive/opt-818-field-entry-registration.md) | `opt-818-field-entry-registration.md` |
| [OPT-819 — Permanent effects at effect-played field entry](./archive/opt-819-effect-played-permanent-effects.md) | `opt-819-effect-played-permanent-effects.md` |
| [OPT-820 — committed events across nested execution and prompt continuations](./archive/opt-820-accumulated-events.md) | `opt-820-accumulated-events.md` |
| [OPT-821 — Field-to-Life destination choice](./archive/opt-821-field-life-position.md) | `opt-821-field-life-position.md` |
| [OPT-822 — effect and activation-cost Life replacement](./archive/opt-822-life-replacement.md) | `opt-822-life-replacement.md` |
| [OPT-832 — competing base-power settings](./archive/opt-832-base-power-precedence.md) | `opt-832-base-power-precedence.md` |
| [OPT-833 — Changed base power in field reads and K.O. snapshots](./archive/opt-833-effective-base-power.md) | `opt-833-effective-base-power.md` |
| [OPT-845 — named hand Character activation payment](./archive/opt-845-named-play-cost.md) | `opt-845-named-play-cost.md` |
| [OPT-846 — Life flip cost migration](./archive/opt-846-life-costs.md) | `opt-846-life-costs.md` |
| [OPT-849 — activated attached-DON requirements](./archive/opt-849-activated-don.md) | `opt-849-activated-don.md` |
| [OPT-1006 / OPT-1001 final field-trash writer](./archive/opt1006-field-trash-writer.md) | `opt1006-field-trash-writer.md` |
| [OPT-1007 reader candidate handoff](./archive/opt1007-native8-battle-completion.md) | `opt1007-native8-battle-completion.md` |
| [PR778 expected-root amendment (OPT-969)](./archive/opt969-cost-expected-root.md) | `opt969-cost-expected-root.md` |
| [OPT-969 bounded history ownership reader](./archive/opt969-history-reader.md) | `opt969-history-reader.md` |
| [OPT-969 / OPT-997 native7 future producers](./archive/opt969-native7-producers.md) | `opt969-native7-producers.md` |
| [OPT969 / OPT997 native cost writer in schema8](./archive/opt969-native7-writer.md) | `opt969-native7-writer.md` |
| [OPT-969 / OPT-997 PR777 bounded continuation](./archive/opt969-pr777-stage-contract.md) | `opt969-pr777-stage-contract.md` |

### Data and folders

- JSON inventories: [`OPT-850-consumers.json`](./archive/OPT-850-consumers.json), [`opt-806-choice-consumers.json`](./archive/opt-806-choice-consumers.json), [`opt-807-search-consumers.json`](./archive/opt-807-search-consumers.json), [`opt-833-base-power-inventory.json`](./archive/opt-833-base-power-inventory.json), [`opt-845-dynamic-filter-inventory.json`](./archive/opt-845-dynamic-filter-inventory.json), [`opt969-native7-producers-selection.json`](./archive/opt969-native7-producers-selection.json)
- [`archive/opt-812/`](./archive/opt-812/), [`archive/opt-846/`](./archive/opt-846/): consumer inventories for OPT-812 and OPT-846
- [`archive/runs/`](./archive/runs/): orchestration run ledgers, review packets, and reviews
- [`archive/assets/`](./archive/assets/): screenshots referenced by the responsive game board handoff
