# OPT-717 OP-17 Schema-Gate Inventory

> **Provisional source:** OP-17 effect text came from limitlesstcg.com, not the official OPTCG site. Revalidate this inventory after vegapull can pull the official set, expected around 2026-08-28. Limitless's page truncates OP17-105 at the second inline `[Trigger]` icon. The full text was restored on 2026-08-20 from [OPDeckGuide](https://opdeckguide.com/cards-list/OP17/) and [The Orc's Lair](https://theorcslair.com/products/product_511b162em7bw58k44ca8346vsq), independently verified, and adopted into the canonical dataset before merge. OP17-116's inline-reference misclassification was found and corrected on 2026-08-20; it belongs to the same corruption class as the four earlier inline-`[Trigger]` reference cards.

> **Closure (2026-08-21):** The holding pattern closed via OPT-718 in PRs #581, #582, and #583. `op17.ts` now authors 106 of the 112 effect-bearing cards plus the trigger-only OP17-107, the regenerated manifest with 119 OP-17 entries is committed, the OPT-590 ratchet stands at 500, the OPT-603 sweep stands at 2,466, and `pnpm schema:check` is fully green. Six cards remain deferred to engine tickets: OP17-018 and OP17-116 (OPT-723), OP17-040 (OPT-724), OP17-041 (OPT-725), OP17-118 (OPT-726), and OP17-095 (OPT-732). Statements below describe the pre-closure state recorded during OPT-717.

> **Official reconciliation (2026-08-21, OPT-721):** The official site and vegapull confirm pack `569117`, titled `BOOSTER PACK -THE WORLD’S STRONGEST WARRIORS- [OP-17]`. The official payload contains 169 records: 119 OP-17 base cards, 39 OP-17 alternate arts, and 11 cross-set alternate arts. Five Block X base cards now have null block numbers. OP17-109 and OP17-111 have genuine Trigger fields on the official site, so OP-17 now contains 16 Trigger cards and the global OPT-590 inventory rises from 500 to 502. The 112 effect-bearing and 6 neither-effect-nor-Trigger counts remain unchanged.

> **OPT-733 closure (2026-08-21):** OPT-733 flips `hasTriggerText` to true for OP17-109 and OP17-111, authors both official TRIGGER blocks, and moves the OPT-590 ratchet from 500 to 502. The OP17-109 `SEARCH_TRASH_THE_REST` finding is resolved as an implemented false positive because `SEARCH_DECK` preserves the official bottom-the-rest clause.

> **OPT-726 closure (2026-08-21):** OPT-726 authors OP17-118 after adding conditional HAND-zone self `COUNTER_GRANT` evaluation at counter time. The OPT-603 sweep advances to 2,467 cards, leaving OP17-018, OP17-040, OP17-041, OP17-095, and OP17-116 deferred to their sibling engine tickets.

## Official reconciliation delta inventory

| Field                     |                                Records | Official delta                                                                                                                                                  | Disposition                                                                                                  |
| ------------------------- | -------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Record inventory          |                    12 added, 0 removed | Added EB04-007_p2, EB04-061_p2, OP12-056_p2, OP13-028_p2, OP14-108_p3, OP16-098_p2, OP17-062_p3, P-084_p1, P-107_p1, ST27-005_p1, ST31-004_p1, and ST32-002_p1. | Accepted all official alternate arts.                                                                        |
| Pack metadata             |                                 1 pack | Pack ID remains `569117`; the title changes its straight apostrophe to the official curly apostrophe.                                                           | Kept the confirmed ID and official title.                                                                    |
| `block_number`            |                             15 records | OP17-005, OP17-022, OP17-062, OP17-112, OP17-118, and their ten alternate arts change from `5` to null for the printed Block X mark.                            | Accepted vegapull's non-numeric fallback; the importer stores database block `0`.                            |
| `effect`                  |                             97 records | The vega pull dropped the official `<br>` clause separators the site HTML carries; every effect is text-identical after normalizing `<br>` and whitespace.     | Restored `<br>` from the official cardlist HTML with a normalized-equality safeguard. OP17-105 remains intact. |
| `trigger`                 |                              2 records | OP17-109 gains its five-card Big Mom Pirates search; OP17-111 gains “Play this card.”                                                                           | Accepted because the official HTML contains dedicated Trigger elements. Deferred schema encoding to OPT-733. |
| `power`                   |                              3 records | OP17-021, OP17-066, and OP17-105 change from `0` to null.                                                                                                       | Accepted official unset values.                                                                              |
| `cost`                    |                              4 records | OP17-038, OP17-055, OP17-056, and OP17-076 change from `0` to null.                                                                                             | Accepted official unset values.                                                                              |
| `rarity`                  |                               1 record | OP17-040_p1 changes from `Rare` to `TreasureRare`.                                                                                                              | Accepted official variant rarity.                                                                            |
| `name`                    |                              3 records | OP17-004, OP17-028, and OP17-060 use `&amp;` in raw JSON.                                                                                                       | Accepted; the pipeline decodes HTML entities during transform.                                               |
| Image URLs                | 157 existing records plus 12 additions | Both image fields move from Limitless URLs to official OPTCG URLs for existing records; additions already use official URLs.                                    | Accepted in canonical source data; import preserves previously migrated database image URLs.                 |
| All other compared fields |                     157 shared records | No changes to pack ID, category, colors, counter, attributes, or types.                                                                                         | No action.                                                                                                   |

OP17-105, OP17-112, and OP17-116 remain inline Trigger references with null Trigger fields. The official site disproves the earlier provisional classification only for OP17-109 and OP17-111.

## Outcome

`pnpm --filter optcg-game schema:generate` produced 119 OP-17 base-card manifest entries. The generator collapsed the 157 source records by canonical card ID and preserved category, real-effect, and Trigger facts across variants.

The regenerated manifest cannot be committed before OPT-718 authors OP-17 schemas. The OPT-590 gate scans every manifest card with Trigger text and provides no set allowlist, warning mode, or deferred-set disposition. The ticket's holding pattern is therefore to leave the committed manifest unchanged, keep all gates unchanged, and commit this inventory with the OP-17 card reference.

The generated base-card inventory contained 6 Leaders, 95 Characters, 17 Events, and 1 Stage. It classified 112 cards with real effect text, 14 cards with Trigger text, and 6 cards with neither. The provisioned JSON contains 16 Trigger records and 9 vanilla records before alternate-art variants collapse to base IDs.

## Failing gates with the regenerated manifest

The authored-schema gate run completed 33 tests: 30 passed and 3 OPT-590 tests failed. OPT-471, OPT-589, and OPT-593 passed completely.

| Gate test                                                                                                                   | OP-17 cards named                                                                                                                          | Failure class                   | Why                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPT-590 canonical Trigger schema coverage > requires every canonical Trigger card to have a TRIGGER block`                 | OP17-019, OP17-071, OP17-076, OP17-096, OP17-101, OP17-102, OP17-103, OP17-104, OP17-106, OP17-107, OP17-108, OP17-110, OP17-114, OP17-117 | Missing authored Trigger schema | The manifest marks each card with Trigger text, but the authored registry has no OP-17 schema containing a direct `TRIGGER` block.                         |
| `OPT-590 canonical Trigger schema coverage > forbids derived Trigger keywords without a TRIGGER block`                      | OP17-019, OP17-071, OP17-076, OP17-096, OP17-101, OP17-102, OP17-103, OP17-104, OP17-106, OP17-107, OP17-108, OP17-110, OP17-114, OP17-117 | Derived-keyword/schema mismatch | Canonical Trigger text derives the `trigger` keyword, but no authored direct `TRIGGER` block exists for any named card.                                    |
| `OPT-590 canonical Trigger schema coverage > includes anchored effect-field Trigger text without false-flagging references` | OP17-019, OP17-071, OP17-076, OP17-096, OP17-101, OP17-102, OP17-103, OP17-104, OP17-106, OP17-107, OP17-108, OP17-110, OP17-114, OP17-117 | Fixed-count ratchet             | The correct Trigger-card total rises by these 14 base cards, from the asserted 486 to 500. OPT-718 must update the ratchet with the corresponding schemas. |

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
| OP17-117 | Maser Saber                                           | Missing authored Trigger schema; derived-keyword/schema mismatch; fixed-count ratchet |

OP17-107 is trigger-only (`effect: "-"`). Its complete Trigger text is `[Trigger] Play this card.` Generator convention omits trigger-only cards from per-set card docs, as shown by OP16-105, OP15-103, and OP15-106, so schema authors must take OP17-107's text from this inventory or the canonical JSON.

## Holding-pattern evidence

- `workers/game/src/engine/trigger-schema-coverage.ts:47` filters every manifest entry with `hasTriggerText`, then requires an authored direct `TRIGGER` block. It has no exclusion input.
- `workers/game/src/engine/trigger-schema-coverage.ts:61` checks the union of manifest and authored-schema IDs. It likewise has no exclusion input.
- `workers/game/src/__tests__/opt-590-trigger-schema-coverage.test.ts:51` and `:57` require both inventories to be empty. They do not warn or consult disposition documents.
- `workers/game/src/__tests__/opt-590-trigger-schema-coverage.test.ts:117` pins the global Trigger-card count at `:136`, so adding OP-17 necessarily fails before that ratchet changes.
- `workers/game/src/engine/trigger-schema-coverage.ts:15` shows the category gate's existing asymmetry: it iterates authored schemas, so unauthored OP-17 categories do not fail OPT-593.

## Card-document format drift

The `scripts/generate-card-docs.ts` history contains one introducing commit, `e99fb8679a5b65f2024eed4c4f43c7d6185f7599`. That version already emitted bare `**ID**` headers and selected no category or color fields. Every previously committed `docs/cards/*.md` file uses `**ID** · Category · Color` headers instead.

This is longstanding generator drift, not a new regression. OPT-717 leaves the script unchanged and adds category and color metadata only to `docs/cards/OP-17.md`. Its 112 effect-bearing card sections carry the canonical effect text with the committed header metadata.

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
