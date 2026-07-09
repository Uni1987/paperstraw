# PaperStraw multi-database architecture

PaperStraw modules use separate databases. Do not merge private-jet data and cruise data into a shared operational database.

## Module database ownership

| Module | Database URL env var | Backwards-compatible fallback | Writes |
| --- | --- | --- | --- |
| Private Jets | `PRIVATE_JETS_DATABASE_URL` | `DATABASE_URL` | private-jet ingestion, rollups, admin refresh |
| Cruises | `CRUISES_DATABASE_URL` | `CRUISE_DATABASE_URL` | cruise AIS/MRV/registry tooling |

`DATABASE_URL` remains supported only as the private-jet default for existing production deployments. New cruise code should not use `DATABASE_URL`.

## Current audit findings

- The Prisma schema still uses one generated Prisma Client, but runtime clients now pass module-specific datasource URLs.
- `lib/prisma.ts` is a compatibility export for the private-jet database.
- Cruise libraries and cruise scripts import `@/lib/database/cruises`.
- Private-jet ingestion and migration scripts resolve `PRIVATE_JETS_DATABASE_URL`, with `DATABASE_URL` fallback.
- Cruise worker/status/review/admin code resolves `CRUISES_DATABASE_URL`, with `CRUISE_DATABASE_URL` fallback.
- The global-local-filter worker still requires `CRUISE_WORKER_ENV` and `CRUISE_WORKER_DATABASE_TARGET`.
- A legacy cruise worker can use `DATABASE_URL` only in an explicit `CRUISE_WORKER_DATABASE_TARGET=cruises-dev` context and only if the URL clearly looks like a cruise database.

## Recommended local `.env.local`

```dotenv
PRIVATE_JETS_DATABASE_URL="postgresql://USER:PASSWORD@PRIVATE_JETS_HOST.neon.tech/PRIVATE_JETS_DB?sslmode=require"
CRUISES_DATABASE_URL="postgresql://USER:PASSWORD@CRUISES_HOST.neon.tech/CRUISES_DB?sslmode=require"

# Optional legacy fallback for private-jet code and Prisma CLI defaults.
DATABASE_URL="postgresql://USER:PASSWORD@PRIVATE_JETS_HOST.neon.tech/PRIVATE_JETS_DB?sslmode=require"

CRUISE_WORKER_ENV=development
CRUISE_WORKER_DATABASE_TARGET=cruises-dev
AISSTREAM_API_KEY="..."
```

Do not copy real secrets into documentation, Git, screenshots, or logs.

## Local commands

Private-jet commands use `PRIVATE_JETS_DATABASE_URL`, then `DATABASE_URL`:

```powershell
pnpm ingest:daily
pnpm ingest:historical -- --from 2026-01-01 --to 2026-01-07
pnpm migrate:sqlite-to-postgres -- --dry-run
```

Cruise commands use `CRUISES_DATABASE_URL`, then `CRUISE_DATABASE_URL`:

```powershell
pnpm cruises:global-local-filter:status -- --since-hours 24
pnpm cruises:ops-summary
pnpm cruises:review-mmsi-candidates -- --include-identifiers --limit 100
pnpm cruises:ingest-global-local-filter -- --allow-long-run
```

Cruise mutation commands should keep the existing safety variables:

```powershell
$env:CRUISE_WORKER_ENV="development"
$env:CRUISE_WORKER_DATABASE_TARGET="cruises-dev"
```

## Vercel environment variables

Set both module databases for branch previews that render both modules:

- `PRIVATE_JETS_DATABASE_URL`
- `CRUISES_DATABASE_URL`
- `DATABASE_URL` only if needed for legacy private-jet deployment compatibility
- existing public/admin variables such as `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `CRON_SECRET`, and `PAYPAL_URL`

Private-jet cron/API routes use the private-jet database. Cruise pages and cruise admin/API routes use the cruise database.

## Railway cruise worker variables

The development worker service should set:

- `CRUISES_DATABASE_URL`
- `AISSTREAM_API_KEY`
- `CRUISE_WORKER_ENV=railway-development`
- `CRUISE_WORKER_DATABASE_TARGET=cruises-dev`
- optional `CRUISE_WORKER_PROFILE=railway`

Start command:

```powershell
pnpm cruises:ingest-global-local-filter -- --allow-long-run
```

Do not point Railway cruise workers at the private-jet database or Neon production private-jet branch.

## Adding a future module

1. Add a module-specific database URL, for example `SUPERYACHTS_DATABASE_URL`.
2. Add a resolver in `lib/database/config.ts`.
3. Add a lazy Prisma client in `lib/database/<module>.ts`.
4. Make module-specific code import that client directly.
5. Keep write commands guarded by module-specific target variables.
6. Document local, Vercel, and worker variables before enabling ingestion.

## Cross-module safety

- Do not import `@/lib/prisma` from new module code; it is private-jet compatibility only.
- Do not set `DATABASE_URL` to the cruise database for normal local development.
- Do not run private-jet historical ingestion with a cruise-looking database URL.
- Do not run cruise scripts without `CRUISES_DATABASE_URL` or `CRUISE_DATABASE_URL`.

