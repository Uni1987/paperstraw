# PaperStraw Cruise Pre-Live Launch Checklist

Generated: 2026-07-10

## Go / No-Go Status

**GO for beta/live integration with caveats.**

The cruise module is ready to merge into the live PaperStraw site as a clearly labelled verified-cruise beta experience, provided the Vercel and Railway environment variables below are checked before deployment and the Vercel preview smoke test passes.

This is not a claim of complete global cruise-industry coverage. Public wording must continue to describe the dataset as verified tracked cruise vessels from the current curated registry, with estimates based on observed AIS positions since monitoring began.

## Current Cruise Launch Readiness

Source: `pnpm cruises:launch-readiness` and `pnpm cruises:ops-summary`.

| Check | Result |
| --- | --- |
| Accepted registry entries | 316 |
| Public eligible vessels | 271 |
| Linked MMSI vessels | 271 |
| Public eligible ratio | 85.8% |
| Observed last 24h | 197 / 271, 72.7% |
| Observed last 7d | 241 / 271, 88.9% |
| Observed last 30d | 244 / 271, 90.0% |
| Pending candidates | 0 |
| Pending conflicts | 0 |
| Total conflicts | 0 |
| Railway worker status | HEALTHY |
| Latest verified position age | 0 min |

## Blockers

None found in this audit.

## Warnings / Caveats

- Cruise coverage is a curated verified subset, not complete global cruise-fleet coverage.
- 45 accepted registry entries are not yet public eligible because they lack an approved MMSI/public verification link.
- 30 public-eligible linked vessels were not observed in the last 7 days during the readiness audit.
- Cruise emissions remain estimates from observed AIS movement and stored daily estimates.
- The branch should be deployed first as a Vercel preview and manually smoke-tested before production aliasing or merging.

## Build And Route Audit

`pnpm build` passed. The build output included all required routes:

| Route | Build status |
| --- | --- |
| `/` | Dynamic, built |
| `/cruises` | Dynamic, built |
| `/admin` | Dynamic, built |
| `/admin/private-jets` | Dynamic, built |
| `/admin/cruises` | Dynamic, built |
| `/data` | Static, built |
| `/data/private-jets` | Dynamic, built |
| `/data/cruises` | Dynamic, built |
| `/methodology` | Static, built |
| `/methodology/private-jets` | Static, built |
| `/methodology/cruises` | Static, built |
| `/comparisons` | Static, built |
| `/comparisons/private-jets` | Dynamic, built |
| `/comparisons/cruises` | Static, built |
| `/support` | Dynamic, built |

Existing compatibility redirects observed in code:

- `/dashboard` redirects to `/`.
- `/leaderboard` redirects to `/data/private-jets`.
- `/aircraft-types` redirects to `/data/private-jets`.

## Database Boundary Audit

Architecture decision confirmed in code: private jets and cruises use separate Neon databases.

Private jets:

- `@/lib/prisma` exports `privateJetsPrisma` from `@/lib/database/privateJets`.
- Private-jet frontend, admin, ingestion, dashboard, data, validation and cron helpers continue to import `@/lib/prisma`.
- `getPrivateJetsDatabaseUrl()` uses `PRIVATE_JETS_DATABASE_URL` first, then legacy `DATABASE_URL`.
- The private-jet client refuses database URLs that look cruise-specific.

Cruises:

- Cruise frontend, admin, scripts and workers import `@/lib/database/cruises`.
- `getCruisesDatabaseUrl()` uses `CRUISES_DATABASE_URL` first, then legacy `CRUISE_DATABASE_URL`.
- Cruise code does not silently fall back to `DATABASE_URL` except in the explicit cruises-dev worker target mode.
- The explicit worker fallback requires `CRUISE_WORKER_DATABASE_TARGET=cruises-dev` and a cruise-looking legacy URL.

Import scan results:

- No cruise module imports `@/lib/prisma`.
- No private-jet module imports `@/lib/database/cruises`.
- `@/lib/prisma` remains private-jet compatibility only.

## Environment Variable Checklist

### Local Development

Required for private-jet features:

- `DATABASE_URL` or `PRIVATE_JETS_DATABASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Required for cruise pages/admin/scripts:

- `CRUISES_DATABASE_URL`

Required only for local cruise worker testing:

- `AISSTREAM_API_KEY`
- `CRUISE_WORKER_ENV=development`
- `CRUISE_WORKER_DATABASE_TARGET=cruises-dev`

Optional:

- `PAYPAL_URL`
- `CRON_SECRET`
- `DATA_REFRESH_INTERVAL_MINUTES`

### Vercel

Required:

- `DATABASE_URL` = private jet Neon DB, retained for legacy/private-jet fallback
- `PRIVATE_JETS_DATABASE_URL` = private jet Neon DB
- `CRUISES_DATABASE_URL` = cruise Neon DB
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Recommended / existing production variables:

- `CRON_SECRET`
- `DATA_REFRESH_INTERVAL_MINUTES`
- `PAYPAL_URL`
- `ADSB_LOL_DAILY_URL` if the private-jet importer needs an explicit source
- `GITHUB_TOKEN` if still used by private-jet historical/source tooling

Do not set Railway worker-only values in Vercel unless there is a specific reason:

- `AISSTREAM_API_KEY`
- `CRUISE_WORKER_ENV`
- `CRUISE_WORKER_DATABASE_TARGET`
- `CRUISE_WORKER_PROFILE`

### Railway Cruise Worker

Required:

- `CRUISES_DATABASE_URL` = cruise Neon DB
- `CRUISE_WORKER_ENV=railway-development`
- `CRUISE_WORKER_DATABASE_TARGET=cruises-dev`
- `AISSTREAM_API_KEY`
- `CRUISE_WORKER_PROFILE=railway`

Expected Railway start command:

```powershell
pnpm cruises:ingest-global-local-filter -- --allow-long-run
```

Do not configure Railway with the private-jet Neon database.

## Admin / Auth Audit

Middleware protects:

- `/admin/:path*`
- `/api/admin/:path*`
- `/api/cron/:path*`
- `/api/ingest/:path*`

Admin routes checked:

- `/admin`
- `/admin/private-jets`
- `/admin/cruises`

Cruise write-action safety:

- Candidate approval requires the existing admin-protected API route.
- Apply-approved dry-run performs no writes.
- Apply-approved confirm requires `CRUISE_WORKER_ENV=development` or `railway-development`.
- Apply-approved confirm also requires `CRUISE_WORKER_DATABASE_TARGET=cruises-dev`.
- Repair tooling keeps dry-run behavior unless explicit confirm is used.

## Cruise Wording Audit

Allowed wording is present:

- verified tracked cruise vessels
- current curated registry
- since monitoring began
- estimates based on observed AIS positions
- coverage is improving / coverage caveats

Overclaiming scan found no public affirmative claim of:

- all cruises worldwide
- complete global cruise fleet
- exact total emissions of the cruise industry
- real-time exact tracking

The phrases `all cruises worldwide` and `complete global cruise emissions` only appeared in negated caveats such as "do not claim all cruises worldwide" or "not complete global cruise emissions."

## Private-Jet Regression Risk Audit

Critical private-jet flows remain present:

- Homepage `/` builds as the private-jet overview.
- `/data/private-jets` exists and builds dynamically.
- `/methodology/private-jets` exists and builds.
- `/comparisons/private-jets` exists and builds dynamically.
- `/admin/private-jets` exists, builds dynamically and is protected by middleware.
- Legacy private-jet redirects remain in place for `/leaderboard` and `/aircraft-types`.

No import scan evidence showed private-jet code using the cruise database client.

## Commands To Run Locally Before Merge

```powershell
git branch --show-current
pnpm build
pnpm test
.\node_modules\.bin\tsc.cmd --noEmit
pnpm cruises:launch-readiness
pnpm cruises:ops-summary
```

Expected current readiness targets:

- Public eligible ratio: at least 85%
- Pending candidates: 0 or explicitly acceptable
- Pending conflicts: 0
- Total conflicts: 0
- Worker status: HEALTHY
- Latest verified position age: healthy/recent

## Vercel Preview Manual Pages To Check

Open these routes in the Vercel preview:

- `/`
- `/cruises`
- `/data`
- `/data/private-jets`
- `/data/cruises`
- `/methodology`
- `/methodology/private-jets`
- `/methodology/cruises`
- `/comparisons`
- `/comparisons/private-jets`
- `/comparisons/cruises`
- `/support`

Admin/auth checks:

- Visit `/admin` without credentials and confirm `401 Unauthorized`.
- Visit `/admin/private-jets` without credentials and confirm `401 Unauthorized`.
- Visit `/admin/cruises` without credentials and confirm `401 Unauthorized`.
- Log in and confirm both admin modules load.
- On `/admin/cruises`, verify health, public-eligible ratio, pending candidates and pending conflicts.
- Use dry-run before any cruise MMSI apply action.

Redirect checks:

- `/dashboard` -> `/`
- `/leaderboard` -> `/data/private-jets`
- `/aircraft-types` -> `/data/private-jets`

Visual/data checks:

- Homepage private-jet map and KPIs render.
- Cruise map renders verified cruise positions only.
- Cruise page does not show YTD/global-complete claims.
- Cruise data/methodology pages explain verified subset and monitoring-start basis.

## Merge / Deploy Steps

1. Confirm the working tree contains only intended cruise-launch files.
2. Run the validation commands above.
3. Push `feature/cruises`.
4. Confirm Vercel preview build passes.
5. Set/verify Vercel environment variables exactly as listed above.
6. Smoke-test all preview routes and auth checks.
7. Confirm Railway worker is still writing to `cruises-dev`, not private-jet production.
8. Merge only after preview smoke tests pass.
9. Monitor `/admin/cruises` and Railway logs after merge.

## Rollback Plan

Fast rollback:

1. Revert the cruise merge commit or redeploy the previous Vercel production deployment.
2. Stop or pause the Railway `cruise-global-local-filter-worker` service if cruise data collection is suspected.
3. Leave the private-jet Neon database untouched.
4. Leave the cruise Neon database intact for forensic review; do not delete rows as part of emergency rollback.
5. Verify `/`, `/data/private-jets`, `/methodology/private-jets`, `/comparisons/private-jets`, and `/admin/private-jets`.

Data-boundary rollback checks:

- Confirm Vercel `DATABASE_URL` and `PRIVATE_JETS_DATABASE_URL` still point to private-jet Neon.
- Confirm Railway `CRUISES_DATABASE_URL` points to cruise Neon.
- Confirm no worker is configured with the private-jet database.

## Final Safety Confirmation

This audit did not require schema changes, registry imports, data mutations, ingestion formula changes, Railway configuration changes, Vercel configuration changes, or production deployment actions.
