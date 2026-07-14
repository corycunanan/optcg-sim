# Authored AND-chain audit (OPT-472)

## Outcome

The pre-migration authored registry contained **210** `chain: "AND"` connectors across 35 schema files, one fewer than the issue's initial text-only estimate. Every occurrence encoded ordinary connective prose such as “draw 2 cards and trash 2 cards”; none of the local canonical card text said “simultaneously” or “at the same time.”

Under Comprehensive Rule 1-3-7, those effects are carried out in the order printed. All 210 connectors are therefore classified as **ordered** and migrated to `THEN`. This also preserves mechanics where a later action must observe an earlier one, including newly drawn cards becoming eligible to trash or place at the bottom of the deck.

## Classification ledger

The file counts below account for every migrated connector:

| Schemas | Count | Schemas | Count | Schemas | Count |
|---|---:|---|---:|---|---:|
| op16 | 19 | op14 | 14 | op07 | 13 |
| op06 | 13 | op15 | 12 | op09 | 12 |
| op13 | 10 | op03 | 10 | op10 | 9 |
| op08 | 9 | eb04 | 9 | p | 8 |
| op04 | 8 | op12 | 7 | op11 | 6 |
| op05 | 6 | op02 | 6 | st10 | 4 |
| eb01 | 4 | st29 | 3 | st22 | 3 |
| st13 | 3 | eb03 | 3 | eb02 | 3 |
| st30 | 2 | st25 | 2 | st24 | 2 |
| st07 | 2 | st04 | 2 | st28 | 1 |
| st18 | 1 | st17 | 1 | st14 | 1 |
| st06 | 1 | st03 | 1 | **Total** | **210** |

The two dominant exact action pairs were:

- `DRAW → TRASH_FROM_HAND`: 92
- `DRAW → PLACE_HAND_TO_DECK`: 14

The remaining 104 connectors span independent modifier/keyword applications, DON!! movement/state operations, removal and play sequences, and deck/Life/search/reveal operations.

All families remain ordered because rule 1-3-7 applies top-to-bottom unless the card explicitly says otherwise. The regression gate walks nested authored actions and requires the registry to contain no unclassified `AND` connector.

## Runtime AND contract

`AND` is retained for future effects that explicitly require simultaneous handling. Its runtime contract is:

1. Evaluate every inline condition and dynamic numeric value against the group-start snapshot.
2. Lock every target and collect every target-selection prompt before mutating state.
3. Reject result references produced inside the same group; simultaneous siblings cannot depend on an uncommitted result.
4. Commit independently possible allowlisted actions in one non-interruptible phase. Impossible members are skipped without canceling their siblings (rule 1-3-2).
5. Publish the group's events only after the complete group commits.
6. Reject handlers whose prohibition, replacement, trigger-drain, arrange, or nested-choice paths could interrupt the commit. This gives those interactions an explicit fail-closed ordering contract instead of allowing a partially committed group; they require a dedicated atomic preflight before joining the allowlist.

Only action handlers on the explicit simultaneous-safe allowlist may be authored with `AND`. This fail-closed boundary prevents a new handler from silently exposing partial state through a replacement, trigger-drain, arrange, or nested-choice continuation.

## Residual caveat dispositions (OPT-498)

- **Atomicity is preflight- and allowlist-contingent, not rollback-based.** The engine locks conditions, values, and targets before mutation and withholds events until commit completes, but it does not provide a generic state rollback when an allowlisted handler reports that an independently possible member did not resolve. The allowlist therefore remains restricted to non-continuing handlers whose mutations are fully described by the locked plan. Any unexpected continuation terminates through the typed engine-contract outcome. Adding a handler requires a dedicated atomic-preflight regression; broad transactional rollback is not implied by the current contract.
- **A following `IF_DO` has no defined whole-group success rule.** Authored-schema validation rejects `IF_DO` immediately after an `AND` group, and runtime drift terminates before any group member commits. This replaces the former last-member-only behavior with a fail-closed boundary until a card requires explicit all-member, any-member, or printed-final-member semantics.

The authored registry still contains zero `AND` connectors, so neither limitation is exercised by a playable card. The source-audit regression and connector validator keep that disposition explicit.
