# Preview VQA Runbook

> How to access and sign in to Vercel preview deployments for visual QA.

---

## Open the preview

Vercel Deployment Protection intercepts anonymous requests to preview URLs. Open the
deployment in a browser that is already authenticated to Vercel; otherwise the request
will stop at Vercel instead of reaching the app.

Anonymous `curl` and other CLI requests cannot verify the preview app while Deployment
Protection is enabled.

## Sign in with a seeded account

Google sign-in is not supported on preview deployments. Open `/login`, leave the form in
sign-in mode, and use one of the email/password accounts defined in
[`prisma/seed.ts`](../../prisma/seed.ts):

| Email | Password | Username |
|-------|----------|----------|
| `luffy@optcg.test` | `Gomugomu1!` | `Luffy_D` |
| `zoro@optcg.test` | `Santoryu1!` | `Roronoa_Z` |
| `nami@optcg.test` | `BelliRain1!` | `Nami_Chan` |

These credentials are test-only and must never be used in production. A successful
sign-in returns to the requested page or, when no callback was supplied, `/decks`.

The current seed also creates friendships between Luffy and Zoro and between Luffy and
Nami, plus one direct message from Luffy to Zoro. Those records are useful when visually
checking social surfaces.

## Keep preview and production accounts separate

OPT-576 records that preview deployments use a non-production database separate from
production. The repository's [deployment guide](../architecture/DEPLOYMENT.md) likewise
documents separate Neon branches for non-production and production data, although it
does not verify the current Vercel Preview environment-variable scope.

Account records do not cross that boundary: production accounts do not exist in the
preview database, and preview seed accounts do not exist in production. Use the seeded
accounts above for preview VQA rather than production credentials.

## Why Google sign-in is production-only

[`src/auth.ts`](../../src/auth.ts) reads the Google provider credentials from
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Per OPT-576, those variables are scoped to
Production in Vercel. Google also requires an exact OAuth `redirect_uri`, while Vercel
preview hostnames vary by deployment or branch and cannot be covered by a wildcard.

OPT-576 records the decision to keep Google sign-in production-only and use
email/password for preview VQA. This is intentional and does not indicate a preview
deployment failure.
