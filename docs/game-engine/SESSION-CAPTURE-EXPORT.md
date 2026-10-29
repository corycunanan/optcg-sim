# Signed persisted-session capture (OPT-971)

## Scope and rollout gate

Ticket option **(a)** is implemented: `GET /game/:gameId/export` exports sanitized **persisted** live state and undo. It does not export in-memory progress, load or migrate a game, resume a prompt, repair a session, or change alarms, sockets, tokens, or any storage key. No production capture is established by endpoint tests, including tests using historical writer goldens. `SAVED-STATE-COMPATIBILITY.md` §7 remains an unmet gate until real captured fixtures and their classifications are reviewed. No reader retirement is enabled.

The outer Worker and `GameSession.fetch` are the only route entry points. Both use `authorizeSessionExport`; only `handleSessionExportRequest` accesses storage. Neither calls `SessionRepository.load`, converters, token admission, or engine work. A Durable Object storage transaction reads exactly `session` and `session:undo-history` in one multi-key read. It does not read the card DB, token ledger, spectator identities or rate-limit buckets. Embedded `session.undoHistory`, when defined, takes precedence over the separate key exactly as with historical repository loading. An absent undo key yields an empty array with `undoSource: "absent"`; malformed undo fails rather than being discarded.

## Signing protocol v1

Use the existing operator `GAME_WORKER_SECRET` trust boundary; game/player JWTs and the bearer-secret protocol for other endpoints cannot authorize an export. An operator with this secret can export hidden game information, so exports are private intermediate files until reviewed for fixture publication.

- Method: **GET**, exact path `/game/<gameId>/export`, no query parameters. The path's game ID must also equal the raw live state's ID at the DO boundary.
- Header: `Authorization: SessionExport <expires>:<signature>`.
- `expires`: canonical positive decimal Unix seconds, at most 12 digits, no leading zeros.
- `signature`: 64 lowercase hex characters, HMAC-SHA256 using UTF-8 `GAME_WORKER_SECRET` over exactly these UTF-8 bytes, with LF separators and **no final newline**:

```text
optcg-session-export-v1\nGET\n/game/<gameId>/export\n<expires>
```

The displayed `\n` means an actual LF byte. Acceptance requires `now < expires <= now + 300`, where `now = floor(Date.now()/1000)`. The Worker checks before dispatch and the DO checks again before reading storage. The signature binds method/path/expiry and uses a separate domain from game JWTs. Bounded replay is intentionally permitted because this is a read-only snapshot operation; no nonce/token ledger is read or written. Replays may return newer persisted progress. The response is not itself cryptographically signed; use HTTPS and record the deployed worker revision independently.

All route responses have `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and no CORS grants. OPTIONS and non-GET return 405 before global browser preflight handling. Invalid/missing/expired signatures return 401, query parameters return 400, missing configuration returns 500, absent storage returns 404, and unsupported/malformed/read-failed captures return a generic 422. Errors contain neither source values nor exception text. No request credential, payload, or raw session is logged by this route.

An operator can construct the header without printing it:

```js
import { createHmac } from "node:crypto";
import { writeFile } from "node:fs/promises";
const path = `/game/${process.env.CAPTURE_GAME_ID}/export`;
const expires = Math.floor(Date.now() / 1000) + 60;
const signature = createHmac("sha256", process.env.GAME_WORKER_SECRET)
  .update(`optcg-session-export-v1\nGET\n${path}\n${expires}`)
  .digest("hex");
const response = await fetch(new URL(path, process.env.GAME_WORKER_URL), {
  headers: { Authorization: `SessionExport ${expires}:${signature}` },
});
if (!response.ok) throw new Error(`Capture failed (${response.status})`);
await writeFile(process.env.CAPTURE_OUTPUT, await response.text(), {
  mode: 0o600, flag: "wx",
});
```

Keep the secret, candidate game IDs and intermediate path outside committed files and shell tracing. Do not print the response. This example does not bypass the separate reviewed-deployment gate.

## Sanitization and raw-shape preservation

The response contains only `state`, `undoHistory` and a small `provenance` object: source, sanitization version, export timestamp, undo storage source, and numeric storage-format version when present. It does not copy arbitrary session-envelope metadata. No `cardDb`, token ledger, account ID map, or original game ID is emitted.

Required string-valued identity slots remain reader-compatible: real player/user/winner/spectator IDs become capture-local `captured-player-N` aliases; live/undo IDs and `gameId` become `captured-game-N`. The map is shared across the complete export, including nested cost transaction states, expected roots, baselines, source snapshots, prompt contexts, event/action payloads, strings and object keys. These are positional aliases, not externally correlatable hashes. Known identity values embedded in text are replaced too. No original-to-alias map is returned.

`sleeveUrl`, `donArtUrl` and `imageUrl` become null wherever found. Known display-name/email slots become `redacted`; explicit credential/ledger/card-DB fields are omitted. Known credential strings and ledger JTI keys are also redacted wherever repeated. Other HTTP(S) URL text is replaced with `redacted-url`. The engine's `blind_<counter>-<slot>` choice tokens remain structural data; other `token` fields are omitted. Card/instance identity remains unchanged: if sanitization would alter an `instanceId` or `cardId`, the entire export fails closed. Sanitized-key and private-alias collisions also fail closed rather than returning corrupt or leaking fixtures.

No schema version, capability, continuation, action, cost, source identity, array order, RNG state, or historical classification is introduced or converted. If a historical seed embeds a known game ID, that identity text is aliased; the saved numerical RNG state remains unchanged. Ordinary JSON projection omits undefined object properties and represents undefined array entries as null. Non-JSON values, cycles, depth over 100 or more than 1,000,000 visited values fail closed. Such rejection is a capture failure to investigate, not permission to mutate the game or invent a fixture. Unknown legacy game fields otherwise survive. The sanitizer is for the recorded session schema and known privacy carriers; before publishing any new fixture, manually inspect and leak-scan the complete sanitized output for additional historical/free-text privacy carriers, then extend tests if needed.

## Capture inventory still required

After a reviewed PR is merged, CI passes and its deployed worker revision is verified, the coordinator may perform read-only exports of existing sessions. Keep candidate IDs and raw credentials private. Record the export's SHA-256, deployment revision, capture timestamp and observed schema/classifications, without original account/game identifiers. Do not run gameplay actions merely to manufacture a production pause.

Required evidence remains:

| Capture class | Status after endpoint implementation |
|---|---|
| Real live state plus at least one real undo snapshot | Not yet captured |
| Paused cost: `AWAITING_COST_SELECTION` / `costTransactionState` | Not yet captured |
| Paused replacement: `REPLACEMENT` and `REPLACEMENT_BATCH` | Not yet captured |
| Paused battle/effect damage, including the named historical continuation records | Not yet captured |
| Mid-End-Phase frame below a prompt | Not yet captured |

Save only leak-scanned output in a separate fixture PR, explicitly labelled `captured`, and test `convertPersistedGameState` for live and each undo entry. Record all observed legacy classifications and retain missing-class gaps honestly if available sessions do not cover them. Do not relabel synthetic goldens, fabricate unavailable historical classes, rewrite existing goldens, or replace §7 with a completed inventory until the evidence exists. A sanitized fixture omits the original card DB and does not by itself prove authoritative gameplay replay against historical card definitions.
