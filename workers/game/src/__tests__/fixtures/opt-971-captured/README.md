# OPT-971 actual captured, known-rejected sessions

These two JSON files are **actual sanitized Durable Object storage exports**, retained byte-for-byte. They are not synthetic engine fixtures and are not accepted reader inputs. `manifest.json` records their hashes, export/deployment provenance, safe structural metadata, exact raw rejection and the explicitly separate scratch-context diagnostic.

- Deployed worker: `96db2d07-540b-4d06-871c-f96b1def4a90`.
- Deployed reader: `16275aa27cea54739255695a8c35038de6515d2c`.
- Read-only campaign: 25 attempts, 23 HTTP 404, two sanitized captures, zero accepted raw states.
- `capture-01.json`: ABANDONED / REFRESH, unversioned→v1, no execution context, pregame lacks start-of-game-effects ledger.
- `capture-06.json`: FINISHED / MAIN, unversioned→v1, no execution context or pregame field.
- Both: no prompt, effect stack, undo snapshot, or requested paused-work class.

Raw conversion fails at `executionContext`. The existing `ensureExecutionContext` helper, applied **only to a scratch clone in a diagnostic test**, exposes additional pregame omissions. The repository's actual call order validates first and cannot hydrate these raw states. No fixture is normalized, no default is inferred, and no actual undo entry is fabricated from a live record.

Publication review inspected the complete key/type catalog and every string category locally. Original candidate IDs and operator secrets were checked by an independent scanner without entering this directory. Account/game IDs are capture-local aliases; art/URLs/credentials/token ledgers are absent; historical terminal-reason text matches engine constants/player-index templates. Card/instance identifiers and anonymized game structure intentionally remain. No source-ID map, candidate database timestamps, original card DB, or private operation logs are included. Export timestamps are retained as provenance.

The required live-plus-undo, paused cost, replacement/batch, battle/effect damage and mid-End-Phase inventory remains unmet. [Compatibility §4.2 and §7](../../../../../../docs/game-engine/SAVED-STATE-COMPATIBILITY.md#42-captured-unversioned-admission-gaps-opt-971) records the current disposition. [OPT-1013](https://linear.app/optcg-sim/issue/OPT-1013/resolve-captured-unversionedv1-admission-gaps-before-legacy-support) owns policy or a justified reader adapter; these tests do not approve permanent rejection or retire v1. No engine behavior or production storage changed to obtain this evidence.

Campaign date: 2026-10-28 Pacific; immutable ISO-Z export timestamps retain UTC provenance. This fixture commit carries original capture source `3edbc8a7ec84b9914624c5d01ee10b215dc56493`; payload bytes are unchanged. Fresh independent native privacy review inspected all committed JSON keys, types and strings and found no publication blocker; focused rejection tests passed7/7. The attempted Claude review exhausted its session limit and was incomplete, so cross-family reviewer diversity was lost. Independent original-secret/candidate-ID scanning reported zero leaks; no raw scanner inputs are published.
