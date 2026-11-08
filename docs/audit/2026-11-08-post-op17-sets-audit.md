# Post-OP-17 sets, rules and FAQ audit — 2026-11-08

This audit checks whether recent engine decisions still hold for the cards, FAQs and rules published after our last import. It also lists what each new set needs. No engine code changed.

Baseline: `origin/main` at `e3956b3`. Official sources were read through a web fetch, because this cloud container cannot reach en.onepiece-cardgame.com directly (the proxy returns 403). Card and FAQ text below is **paraphrased**. Canonical wording must come from vegapull and the official PDFs before anything is authored.

## What is new since our data

| Item | Official | Repo | Gap |
| --- | --- | --- | --- |
| EB-05 Heroines vol.2 (released 2026-10-30) | 61 new IDs + reprints | none | Full import and authoring |
| ST-31 to ST-36 starter decks (2026-07-31) | 15 cards each, 5 new IDs per deck | ST31-004 and ST32-002 previews only | 28 new IDs to author; every reprint except vanillas is already authored |
| Comprehensive Rules | v1.2.1, 2026-08-28 | v1.2.0, 2026-01-16 | Re-import `docs/rules/rule_comprehensive.md` |
| FAQ OP-16 (reissued 2026-10-30) | 61 entries | 60 | +1 entry |
| FAQ OP-17 (reissued 2026-10-30) | 66 entries | 60 | +6 entries |
| FAQ EB-05 (2026-11-06) | 23 entries | none | Add file |
| FAQ OP14-EB04, ST-34, Promotion Cards | same counts | same | None found |
| Errata OP16-081 (2026-05-29) | "If you have a" became "If there is a" Character with cost 8+ | Schema already controller-agnostic (`op16.ts`, OPT-413); `docs/cards/OP-16.md:560` shows the old wording | Update the card doc on the next import |
| Errata EB05-033 (2026-10-23) | Name text "O-Robi" became "Nico Robin" | none | Check that the imported name is the corrected one |
| Ban list (effective 2026-10-12) | OP14-020 Mihawk newly banned; 3 banned pairs | Per-card `BanStatus` only | See D1 |

OP-18 releases 2026-11-20 and has no card list or FAQ yet. Next come ST-37/ST-38 (Dec 18–19) and EB-06 (Jan 29, 2027).

ST reprints checked against authored schemas: every non-vanilla reprint in ST-31 to ST-36 and the EB-05 reprint slots has a schema. OP11-003, OP12-023, OP12-045, OP12-052, OP11-068 and OP10-101 have no schema because they are vanillas.

## A. Engine decisions the new rulings confirm

Each of these was checked in the code, not only in docs.

1. **Counter values do not stack; the highest applies.** New entries: OP16-118 (third), OP17-063 (second), OP17-118 (fourth). `counter-value.ts:38` already uses highest-matching-value semantics for `COUNTER_GRANT`.
2. **Competing base-power setters: the highest wins.** This is Rules 4-9-2-1, unchanged in v1.2.1. It applies to OP17-043, ST34-004 and the new EB05-046 Yamato ruling. `modifiers.ts:66-68` uses highest-value precedence. Finding F1 from the 2026-09-09 audit is resolved.
3. **Negation removes a card's own keywords, not ones granted by other effects.** EB05-010 FAQ: a negated Shirahoshi counts as having no [Blocker], and so does a Vegapunk whose own permanent effect grants it. A [Blocker] granted by a [Trigger] effect stays. `keywords.ts:8-10` (OPT-253) implements exactly this split.
4. **OP16-081 errata.** The authored post-cost condition is already `controller: "EITHER"`.
5. **OP17-118 Xebec counts only the Character area.** New entry. The schema gates on `CARD_ON_FIELD`.
6. **OP17-119 Loki.** New entries: zero targets is a legal choice, and a cost reduced below 0 counts as 0 toward the total of 4. `any_number` allows an empty selection. The aggregate uses `getEffectiveCostForRead`, which floors at 0 (`modifiers.ts:741`). I did not find a test pinning the floor-at-0 case.
7. **OP17-117 Maser Saber.** New entry: if the opponent has 2 or fewer cards in hand, the K.O. happens. The trash option requires `FULL_TARGET_COUNT` with `exact: 3`, so it should be unselectable. An end-to-end test is still worth adding.
8. **OPT-802 removals stay valid.** EB-05 and ST-31 to ST-36 add no reader for `cost_override`, because every effect play remains free (Rules 4-7-1 defines playing as paying from hand). They add none for `mandatory`, because the opponent actions in EB05-028 and ST33-002 are mandatory by count. They add none for `life_controller`, because P-085 Bonney and its peers place into the owner's Life. They add none for `delay`, because there is no new deck-out card.

## B. Vocabulary gaps the new cards need

These were found by comparing the paraphrased card text with `effect-types.ts` and `shared/target-filter.ts`. Each one should be confirmed against canonical text before it becomes a ticket.

- **B1 — "If you would take damage" replacement (EB05-052 Gloriosa).** Replacement triggers cover `WOULD_BE_KO`, `WOULD_BE_REMOVED_FROM_FIELD`, `WOULD_BE_RESTED`, `WOULD_LEAVE_FIELD` and `WOULD_LOSE_GAME`. None covers taking damage, and no authored card has this text. The FAQ says one replacement prevents both damage points of a [Double Attack]. It also prevents the loss at 0 Life, and it applies to effect damage such as an [On K.O.]. The work touches battle damage (`battle.ts`), effect damage (`effect-damage.ts`), and ordering against the ST13-003 Life replacement (`life-destination.ts`).
- **B2 — negation-aware "without [Blocker]" filter (EB05-010 Nico Robin Leader).** `keywords` only requires a keyword to be present, and `lacks_effect_type` reads printed effect keywords. A `keywords_not` (or equivalent) is needed. It must use the runtime `hasKeyword` from point A3, read from last-known information at K.O. time.
- **B3 — "during the turn a card in your hand was trashed by an effect" (ST33-004 Borsalino, a hand-zone −3 cost).** `ActionReference` covers ACTIVATED_EVENT, PLAYED_CHARACTER, USED_BLOCKER, ATTACKED and CHARACTER_KO. The `CARD_TRASHED_FROM_HAND` event exists (OPT-795), but it has no per-turn record.
- **Probably expressible already** (vocabulary exists, not tested with these cards):
  - `COMBINED_LIFE_COUNT` (EB05-051)
  - `DON_RETURNED_TO_DON_DECK` (ST34-001)
  - `TURN_LIFE_FACE_DOWN` / `TURN_LIFE_FACE_UP` (EB05-011, EB05-060, ST36-005)
  - `REDIRECT_ATTACK` (ST36-005)
  - `CANNOT_PLAY_CHARACTER` (EB05-021; FAQ: the played Cross Guild card's own [On Play] cannot play another Character)
  - `SET_BASE_POWER` (EB05-046, ST36-003)
  - an array `source_zone` (ST35-004/005, hand or trash)
  - a `LIFE_TO_HAND` replacement cost with an op15 precedent (EB05-061; FAQ: unusable at 0 Life)
  - `ADD_TO_LIFE_FROM_HAND` (EB05-053)
  - `any_of` attribute filters (EB05-057 Special or Wisdom)
  - `UNTIL_END_OF_OPPONENT_NEXT_END_PHASE`

## C. Rules v1.2.1

The fetched v1.2.1 text has no revision history or per-rule change markers in the part that was read (about 40k of 63k characters). Text extraction cannot show highlighting, so a verbatim diff needs the PDF in `docs/rules/`. Rules 4-9-2-1 (base power), 3-10-2-1 (face-up Life is treated as open), and 1-2-1-1 (deck-out) read the same as v1.2.0.

## D. Deck legality

- **D1 — banned pairs are not representable.** The list now includes "cannot be in the same deck" pairs: OP07-115 with EB04-058, OP11-040 with OP11-067, and OP11-040 with OP08-069. `BanStatus` is per-card (`prisma/schema.prisma:24`), and `src/lib/deck-builder/validation.ts` has no pair rule.
- **D2.** OP14-020 must be set to `BANNED` in the database. This audit could not check database contents.

## E. Next steps

1. Run vegapull and `pnpm pipeline:import` from a machine that can reach the official site. Then run `pnpm pipeline:migrate-images`, `pnpm pipeline:check-images` and `scripts/generate-card-docs.ts`. This brings in EB-05 and the ST-31 to ST-36 cards, and it is the only source of canonical text for authoring.
2. Save the v1.2.1 rules PDF, the reissued OP-16 and OP-17 FAQ PDFs, and the EB-05 FAQ PDF to `docs/rules/` and `docs/FAQs/pdfs/`. Convert them with the 2026-09-09 format and refresh the source manifest.
3. Ticket B1, B2, B3 and D1. Then author EB-05 (about 55 effect cards) and the 28 new ST IDs in batches, each with FAQ regressions.
