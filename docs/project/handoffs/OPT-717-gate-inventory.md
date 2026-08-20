# OPT-717 OP-17 Schema-Gate Inventory

> **Provisional source:** OP-17 effect text came from limitlesstcg.com, not the official OPTCG site. Revalidate this inventory after vegapull can pull the official set, expected around 2026-08-28. The inline-`[Trigger]`-reference classification corruption was found and corrected on 2026-08-20 before merge; OP17-105's corrected inputs still omit its final `[Trigger]` clause, so the card reference restores that clause from published card text.

## Outcome

`pnpm --filter optcg-game schema:generate` produced 119 OP-17 base-card manifest entries. The generator collapsed the 157 source records by canonical card ID and preserved category, real-effect, and Trigger facts across variants.

The regenerated manifest cannot be committed before OPT-718 authors OP-17 schemas. The OPT-590 gate scans every manifest card with Trigger text and provides no set allowlist, warning mode, or deferred-set disposition. The ticket's holding pattern is therefore to leave the committed manifest unchanged, keep all gates unchanged, and commit this inventory with the OP-17 card reference.

The generated base-card inventory contained 6 Leaders, 95 Characters, 17 Events, and 1 Stage. It classified 112 cards with real effect text, 15 cards with Trigger text, and 6 cards with neither. The provisioned JSON contains 17 Trigger records and 9 vanilla records before alternate-art variants collapse to base IDs.

## Failing gates with the regenerated manifest

The authored-schema gate run completed 33 tests: 30 passed and 3 OPT-590 tests failed. OPT-471, OPT-589, and OPT-593 passed completely.

| Gate test                                                                                                                   | OP-17 cards named                                                                                                                                    | Failure class                   | Why                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPT-590 canonical Trigger schema coverage > requires every canonical Trigger card to have a TRIGGER block`                 | OP17-019, OP17-071, OP17-076, OP17-096, OP17-101, OP17-102, OP17-103, OP17-104, OP17-106, OP17-107, OP17-108, OP17-110, OP17-114, OP17-116, OP17-117 | Missing authored Trigger schema | The manifest marks each card with Trigger text, but the authored registry has no OP-17 schema containing a direct `TRIGGER` block.                         |
| `OPT-590 canonical Trigger schema coverage > forbids derived Trigger keywords without a TRIGGER block`                      | OP17-019, OP17-071, OP17-076, OP17-096, OP17-101, OP17-102, OP17-103, OP17-104, OP17-106, OP17-107, OP17-108, OP17-110, OP17-114, OP17-116, OP17-117 | Derived-keyword/schema mismatch | Canonical Trigger text derives the `trigger` keyword, but no authored direct `TRIGGER` block exists for any named card.                                    |
| `OPT-590 canonical Trigger schema coverage > includes anchored effect-field Trigger text without false-flagging references` | OP17-019, OP17-071, OP17-076, OP17-096, OP17-101, OP17-102, OP17-103, OP17-104, OP17-106, OP17-107, OP17-108, OP17-110, OP17-114, OP17-116, OP17-117 | Fixed-count ratchet             | The correct Trigger-card total rises by these 15 base cards, from the asserted 486 to 501. OPT-718 must update the ratchet with the corresponding schemas. |

## Affected OP-17 cards

| Card     | Name                                                  | Failure classes                                                                       |
| -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| OP17-019 | I Don't Have Time to Chat with Snot-Nosed Brats       | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-071 | Who's.Who                                             | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-076 | Wo Ro Ro Ro Ro... I Think I've Sobered Up             | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-096 | I'm Luffy!! The Man Who Will Be King of the Pirates!! | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-101 | Caribou                                               | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-102 | Charlotte Oven                                        | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-103 | Charlotte Katakuri                                    | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-104 | Charlotte Cracker                                     | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-106 | Charlotte Smoothie                                    | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-107 | Charlotte Daifuku                                     | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-108 | Charlotte Brulee                                      | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-110 | Charlotte Perospero                                   | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-114 | Sweet 3 Generals                                      | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-116 | Fulgora                                               | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |
| OP17-117 | Maser Saber                                           | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |

## Holding-pattern evidence

- `workers/game/src/engine/trigger-schema-coverage.ts:47` filters every manifest entry with `hasTriggerText`, then requires an authored direct `TRIGGER` block. It has no exclusion input.
- `workers/game/src/engine/trigger-schema-coverage.ts:61` checks the union of manifest and authored-schema IDs. It likewise has no exclusion input.
- `workers/game/src/__tests__/opt-590-trigger-schema-coverage.test.ts:51` and `:57` require both inventories to be empty. They do not warn or consult disposition documents.
- `workers/game/src/__tests__/opt-590-trigger-schema-coverage.test.ts:117` pins the global Trigger-card count at `:136`, so adding OP-17 necessarily fails before that ratchet changes.
- `workers/game/src/engine/trigger-schema-coverage.ts:15` shows the category gate's existing asymmetry: it iterates authored schemas, so unauthored OP-17 categories do not fail OPT-593.

## Card-document format drift

The `scripts/generate-card-docs.ts` history contains one introducing commit, `e99fb8679a5b65f2024eed4c4f43c7d6185f7599`. That version already emitted bare `**ID**` headers and selected no category or color fields. Every previously committed `docs/cards/*.md` file uses `**ID** · Category · Color` headers instead.

This is longstanding generator drift, not a new regression. OPT-717 leaves the script unchanged and adds category and color metadata only to `docs/cards/OP-17.md`. Its 112 effect-bearing card sections retain the corrected provisioned text after removing the added header suffixes, except for the documented OP17-105 completion.

## Command results

### Before ticket changes

| Command                              | Result                                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir workers/game type-check` | Passed.                                                                                                                                              |
| `pnpm schema:check`                  | Failed at the generated-manifest freshness check because the provisioned OP-17 JSON was newer than the committed manifest. Later checks did not run. |
| Authored-schema gate tests           | Passed: 4 files and 33 tests.                                                                                                                        |
| `npx tsc --noEmit`                   | Passed.                                                                                                                                              |

### Inventory run with the regenerated manifest

| Command                                    | Result                                                                                                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter optcg-game schema:generate` | Passed and generated exactly 119 OP-17 base-card entries.                                                                                                                                       |
| `pnpm schema:check`                        | Failed only at the final Vitest stage: 3 OPT-590 failures and 30 passing tests. Manifest freshness, schema lint, documentation drift, and the 3,625-use authored action inventory passed first. |
| Authored-schema gate tests                 | Failed: 3 OPT-590 tests; 30 tests passed. The full failure inventory appears above.                                                                                                             |

### Final holding-pattern state

The manifest is restored byte-for-byte to its committed version. Therefore `pnpm schema:check` intentionally fails at manifest freshness until OPT-718 authors OP-17 schemas and commits the regenerated manifest with the updated OPT-590 ratchet.

| Command                              | Result                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --dir workers/game type-check` | Passed.                                                                                                                              |
| `pnpm schema:check`                  | Expected failure at the stale-manifest check; the holding pattern intentionally does not commit the hard-failing generated manifest. |
| Authored-schema gate tests           | Passed against the committed holding-pattern manifest: 4 files and 33 tests.                                                         |
| `npx tsc --noEmit`                   | Passed.                                                                                                                              |
