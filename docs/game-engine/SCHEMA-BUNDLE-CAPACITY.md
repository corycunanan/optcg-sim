# Game Worker schema bundle capacity

Last measured: 2026-07-14 (OPT-201)

## Decision

The Worker uses a build-time generated schema registry and keeps the production lookup synchronous. The authored `schemas/*.ts` modules remain the source of truth and are loaded by validation tooling, while `schema-registry.ts` imports only `authored-schemas.generated.ts` in the deployed graph.

Per-set dynamic imports were rejected. A Wrangler 3.114.17 dry-run experiment emitted one `index.js` and rewrote `import()` to an in-bundle initializer, so it did not create deploy-time code splitting or remove set payloads from the uploaded script.

## Measurements

Command: `pnpm exec wrangler deploy --dry-run --outdir <directory>` from `workers/game`.
Exact gzip uses `gzip -c -9 index.js | wc -c` so before/after use identical compression settings.

| Measurement                                               |       Before |        After |                   Change |
| --------------------------------------------------------- | -----------: | -----------: | -----------------------: |
| Wrangler total upload                                     | 3,089.19 KiB | 2,561.37 KiB |     -527.82 KiB (-17.1%) |
| Wrangler reported gzip                                    |   395.28 KiB |   325.14 KiB |      -70.14 KiB (-17.7%) |
| Exact `index.js` bytes                                    |    3,163,326 |    2,622,841 |        -540,485 (-17.1%) |
| Exact gzip bytes                                          |      393,337 |      326,457 |         -66,880 (-17.0%) |
| Authored gate median module import (5 runs)               |       779 ms |       691 ms |          -88 ms (-11.3%) |
| Authored gate median test body (5 runs)                   |        59 ms |        61 ms |            +2 ms (noise) |
| Authored gate median process wall time (5 runs)           |       1.18 s |       1.10 s |          -0.08 s (-6.8%) |
| Local workerd startup to first response, warmed toolchain |   664–680 ms |   612–773 ms | no measurable regression |

The workerd probe starts `wrangler dev --local` and polls `/` until the first 404 response. It is a local startup/load proxy, not a Cloudflare production cold-start guarantee.

## Budget and growth check

Cloudflare currently documents compressed Worker limits of 3 MB on the Free plan and 10 MB on the Paid plan: <https://developers.cloudflare.com/workers/platform/limits/>. The repository enforces a stricter 1 MiB gzip budget with:

```sh
pnpm --filter optcg-game bundle:check
```

`pnpm verify` runs this check. The post-OPT-201 bundle uses 326,457 bytes (31.1% of the repository budget and 10.4% of the 3 MiB platform limit), leaving 722,119 bytes of repository budget.

The generated artifact contains 2,319 schemas and is 1,195,143 raw / 115,921 gzip bytes, averaging about 515 raw / 50 gzip bytes per authored card. Recent main sets OP14 and OP15 contain 111 authored cards each; recent starter sets contain up to 15. A representative next five sets (three main plus two starter sets, 363 cards) project about 18 KiB of additional gzip payload. A conservative five-main-set projection (555 cards) is about 28 KiB, taking the whole Worker to roughly 354 KiB gzip (33.8% of the repository budget). These are linear planning estimates; every change must use the bundle check's actual dry-run measurement.

## Registry integrity checks

- `pnpm --filter optcg-game schema:generate` deterministically regenerates the artifact.
- `pnpm --filter optcg-game schema:check` fails when the artifact is stale, a source card is missing or duplicated, a generated payload differs from its source object, or authored-schema validation fails.
- `opt-201-schema-registry-bundle.test.ts` initializes a multi-set game through production setup and executes an authored effect through the production action/resume pipeline.
