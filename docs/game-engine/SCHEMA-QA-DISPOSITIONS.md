# Schema QA Dispositions

This ledger covers low-confidence detector findings that are not already listed
in [DEFERRED-CARD-EFFECTS.md](DEFERRED-CARD-EFFECTS.md). The fail-closed schema
gate requires every finding to appear in one of the two documents.

## OPT-484 triage — 2026-07-14

Each finding was compared with the checked-in card source and Bandai's official
card lists for [EB02](https://en.onepiece-cardgame.com/cardlist/?series=569202),
[EB04 and OP15](https://en.onepiece-cardgame.com/cardlist/?series=569115),
[OP08](https://en.onepiece-cardgame.com/cardlist/?series=569108),
[OP16](https://en.onepiece-cardgame.com/cardlist/?series=569116),
[ST12](https://en.onepiece-cardgame.com/cardlist/?series=569012), and
[ST22](https://en.onepiece-cardgame.com/cardlist/?series=569022). No card in this
cohort remains deferred.

| Card     | Verdict                      | Evidence                                                                                                                                                                                                                             |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EB02-056 | Implemented / false positive | `SEARCH_AND_PLAY` looks at five cards, applies the Scientist/cost/name filter, bottoms the rest, and chains the conditional hand trash. The detector does not recognize this composite action as its coarse search-and-trash signal. |
| EB04-052 | Implemented / false positive | `COPY_POWER` copies the opponent Leader's effective power; the On K.O. block plays the required yellow Character with 6000 base power or less. The detector only recognizes base-power setters for this wording.                     |
| OP08-044 | Implemented / false positive | `REVEAL_FROM_HAND` is the activation cost and enforces the Whitebeard Pirates type before the self power modifier. The detector only looks for a reveal action.                                                                      |
| OP08-052 | Implemented / false positive | `SEARCH_AND_PLAY` reveals the top card, may play the qualifying cost-4 Whitebeard Pirates Character, and preserves `TOP_OR_BOTTOM` for the rest.                                                                                     |
| OP08-054 | Implemented / false positive | The Leader power modifier is followed by a one-card `SEARCH_AND_PLAY` with the cost-3 Whitebeard Pirates filter and `TOP_OR_BOTTOM`.                                                                                                 |
| OP08-055 | Implemented / false positive | The two-card Whitebeard Pirates reveal is encoded as a filtered `REVEAL_FROM_HAND` cost before the cost-6-or-less bottom-deck action.                                                                                                |
| OP08-073 | Implemented / false positive | Named `PLAY_CARD` targets Count Niwatori from `DECK`, enforces cost 6 or less, then shuffles. The detector only recognizes generic deck-play actions.                                                                                |
| OP15-021 | Implemented / false positive | The permanent hand-zone cost modifier applies only while four or more Events are in trash; both Main and Counter power reductions are present. Hand discounts are deliberately detector-reviewed.                                    |
| OP16-005 | Implemented / false positive | The hand-zone cost reduction is conditional on a Whitebeard Pirates Character with 8000 power or more, and Blocker is present.                                                                                                       |
| OP16-015 | Implemented / false positive | The hand-zone reduction has the Portgas.D.Ace Leader and six-DON conditions; the opponent-turn attack block trashes the 8000-power Character and sets both required base powers.                                                     |
| OP16-036 | Implemented / false positive | `COPY_POWER` uses the opponent Leader's printed/base power (`source_power: "BASE"`), matching the card's explicit “base power” wording.                                                                                              |
| OP16-055 | Implemented / false positive | `COPY_POWER` uses the opponent Leader's effective power, matching wording that omits “base.”                                                                                                                                         |
| OP16-059 | Implemented / false positive | `SEARCH_AND_PLAY` looks at five, may play up to two exact Impel Down Characters with 6000 power or less, and bottoms the rest.                                                                                                       |
| OP16-104 | Implemented / false positive | `COPY_POWER` selects up to one opponent Character; the Trigger draw and Blackbeard Pirates cost-1 trash play are also encoded.                                                                                                       |
| ST12-017 | Incorrect — corrected        | The schema hard-coded the unplayed revealed card to the deck bottom. It now uses `TOP_OR_BOTTOM`, and the arrange prompt exposes and executes both official destinations.                                                            |
| ST22-011 | Incorrect — corrected        | The power action could boost any Leader. It now filters the target to a type including Whitebeard Pirates; direct Leader targeting now enforces authored filters.                                                                    |
| ST22-017 | Implemented / false positive | A filtered two-card Whitebeard Pirates `REVEAL_FROM_HAND` cost precedes the draw and cost-5 Character bottom-deck action; the Trigger return is also encoded.                                                                        |

## OPT-728 triage — 2026-08-20

| Card     | Verdict                      | Evidence                                                                                                                                                 |
| -------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OP17-005 | Implemented / false positive | The hand-zone cost modifier applies only while the opponent controls a Character with 10000 power or more; its separate On Play block is also encoded. |
| OP17-013 | Implemented / false positive | The hand-zone cost modifier applies only while the opponent controls a Character with 10000 power or more; its separate On Play block is also encoded. |
| OP17-042 | Implemented / false positive | `REVEAL_FROM_HAND` is the filtered three-card Rocks Pirates activation cost before the opponent Character power reduction.                              |
