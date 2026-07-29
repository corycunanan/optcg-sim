# Preview VQA Runbook

> How to access and sign in to Vercel preview deployments for visual QA.

---

## Configuration scope

The environment details in this runbook—Deployment Protection, Vercel
environment-variable scopes, the database used by Preview, and seed availability—come
from OPT-576 and reflect the project's operational setup as of 2026-07-29. They cannot be
verified from this repository alone; recheck the ticket and dashboards if that setup
changes.

## Open the preview

Under the Deployment Protection configuration recorded in OPT-576, anonymous requests
to preview URLs are intercepted by Vercel. Open the deployment in a browser that is
already authenticated to Vercel; otherwise the request will stop at Vercel instead of
reaching the app.

While that configuration remains enabled, anonymous `curl` and other CLI requests cannot
verify the preview app.

## Sign in with a seeded account

Google sign-in is not supported on preview deployments. With `AUTH_SECRET` present, the
login page still displays **Continue with Google** because
`src/app/(auth)/login/page.tsx` does not gate the button on the Google credentials. Do
not use it on a preview. Clicking it leads to Google's `401 invalid_client` page; this is
the known, accepted OPT-576 behavior, not a new preview regression.

OPT-576 records that the preview database is populated with the email/password accounts
defined in [`prisma/seed.ts`](../../prisma/seed.ts). Open `/login`, leave the form in
sign-in mode, and use one of them:

| Email | Password | Username |
|-------|----------|----------|
| `luffy@optcg.test` | `Gomugomu1!` | `Luffy_D` |
| `zoro@optcg.test` | `Santoryu1!` | `Roronoa_Z` |
| `nami@optcg.test` | `BelliRain1!` | `Nami_Chan` |

The seed file labels these as local-development accounts. OPT-576's operational record
extends their use to the Preview environment for non-production VQA; it does not make
them production credentials. Never use them against production. A successful sign-in
returns to the requested page or, when no callback was supplied, `/decks`.

The current seed also creates friendships between Luffy and Zoro and between Luffy and
Nami, plus one direct message from Luffy to Zoro. Those records are useful when visually
checking social surfaces.

## Keep preview and production accounts separate

OPT-576 records that preview deployments use a non-production database separate from
production. The repository's [deployment guide](../architecture/DEPLOYMENT.md) documents
only the separate Local dev (`dev`) and Production (`main`) Neon branches; it neither
documents nor verifies Preview's database target.

Because Preview and Production use separate databases, do not expect production
credentials or account data to work on a preview. Use the seeded accounts above for
preview VQA, and never try those test credentials against production.

## Why Google sign-in is production-only

[`src/auth.ts`](../../src/auth.ts) reads the Google provider credentials from
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Per OPT-576, those variables are scoped to
Production in Vercel. Google also requires an exact OAuth `redirect_uri`, while Vercel
preview hostnames vary by deployment or branch and cannot be covered by a wildcard.

OPT-576 records the decision to keep Google sign-in production-only and use
email/password for preview VQA. This is intentional and does not indicate a preview
deployment failure.
