# Database-backed tests

`pnpm test` creates a uniquely named database, applies the full Prisma migration
history, runs database suites, and drops the database afterward.

Set `TEST_DATABASE_URL` to a **disposable PostgreSQL maintenance database** whose
user can create and drop databases:

```sh
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm test
```

Docker, Postgres.app, and a local PostgreSQL installation all work. When the
server is unavailable, database suites skip locally with setup instructions and
fail during global setup in CI. Tests can use `describeWithDatabase` and
`createTestPrisma` from `src/test/database/harness.ts`.
