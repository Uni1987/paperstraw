# PaperStraw

PaperStraw is an MVP CO₂ awareness dashboard for private jet flight activity. It estimates emissions from source-attributed scheduled batch imports, presents aggregate awareness metrics, and keeps privacy defaults conservative.

## Stack

- Next.js with TypeScript
- SQLite with Prisma
- Tailwind CSS
- Recharts
- Vitest for emissions calculation tests

## Homepage Concept

The homepage is an aggregate awareness view, not a naming-and-shaming leaderboard or real-time flight tracker. It highlights current-year estimated private jet CO₂, today's flight activity, understandable equivalents, trend charts, airport totals, country totals, and aircraft type totals from the latest imported batch.

The `/data` route is the public transparency report. It shows dataset health, import activity, and aggregate aircraft type, country, and airport views. It does not show registrations, owners, people, or individual aircraft rankings. Legacy `/leaderboard` and `/aircraft-types` routes redirect to `/data`.

## Demo Data Versus Real Data

PaperStraw first reads stored aggregate rollups generated from imported flight records. If rollups do not exist yet but real flight records do, the app can derive aggregates from those records. If the database is unavailable or contains no current-year flights, the homepage falls back to clearly labeled demo aggregate data so the MVP remains usable after cloning.

Seed data is available through:

```bash
pnpm db:seed
```

## Aggregate Calculations

Server-side aggregate functions live in `lib/awareness/aggregates.ts` and stored rollup recalculation lives in `lib/awareness/rollups.ts`. They calculate:

- today's total flights
- today's total distance
- today's estimated CO₂
- current-year estimated CO₂
- daily emissions time series
- monthly emissions time series
- top airports by estimated emissions
- top countries by estimated emissions, derived from airport metadata in `lib/awareness/airports.ts`
- aircraft type totals

Airport and country totals split a flight's distance and estimated CO₂ evenly between origin and destination airports. Unknown airports are grouped as `Unknown` until airport enrichment is added.

## Frequent Recent Import

Run the incremental recent-data API refresh with:

```bash
pnpm ingest:daily
```

Despite the script name, this command is safe to run every 30-60 minutes. It is still a scheduled batch refresh, not live
flight tracking.

The recent refresh job:

- fetches recent aircraft-type API snapshots from ADSB.lol
- reads the `ADSB_LOL / DAILY_API` cursor from the local SQLite database
- only considers records newer than the last successful daily/recent import cursor
- keeps only likely private/business jet aircraft types from the allowlist
- normalizes records into `Aircraft` and `Flight`
- estimates distance from known airport metadata when needed
- calculates estimated CO₂ with the existing emission factor pipeline
- skips duplicates using `dataSource + sourceRecordId`
- updates the last imported timestamp cursor after a successful or partial run
- recalculates daily, monthly, yearly, country, airport, and aircraft type aggregate rollups
- writes an `ImportLog` with start time, end time, status, records fetched, records considered, records imported, and any error message

The app does not implement live flight tracking, does not show aircraft positions, and recent operation does not reprocess
ADSB.lol historical archives.

## Historical Bootstrap

Run a historical ADSB.lol archive bootstrap with:

```bash
pnpm ingest:historical --from YYYY-MM-DD --to YYYY-MM-DD
```

Historical bootstrap is intended for one-time backfills of a selected date range. After that, use `pnpm ingest:daily` for
frequent recent operation.

Recommended first run:

```bash
pnpm ingest:historical --from 2026-01-01 --to 2026-01-07
```

If no date range is provided, the command defaults to `2026-01-01` through today. PaperStraw does not automatically import
multiple years unless you explicitly pass a multi-year `--from` and `--to` range.

The historical job:

- checks the ADSB.lol GitHub archive repository for each year, such as `adsblol/globe_history_2026`, `globe_history_2025`, `globe_history_2024`, and `globe_history_2023`
- looks for daily release tags such as `v2026.06.21-planes-readsb-prod-0`
- chooses the largest available prod/staging release for that date
- skips any date already marked as successfully processed in `ProcessedArchiveDate`
- also skips dates where matching historical flight records already exist, then marks that date as processed
- streams the split tar archive assets and reads ADSB.lol `traces/**/*.json` files, including gzip-compressed JSON files that do not use a `.gz` suffix
- keeps only aircraft types from the private/business jet allowlist
- creates one aggregate aircraft-day record per matching aircraft for that date
- skips duplicates using the unique `dataSource + sourceRecordId` key
- writes imported flights into the local SQLite database at `prisma/dev.db`
- records archive date status, release tag, asset names, files scanned, files matched, records parsed, private jet matches, and records imported
- recalculates daily, monthly, yearly, country, airport, and aircraft type rollups
- prints progress for every date and continues when a date is unavailable

ADSB.lol historical archives are very large. The 2026 archive repository describes the dataset at roughly terabyte scale,
and a single daily release can be large. Start with a small date range first, confirm the output, then expand the range
deliberately.

The `/admin` page includes a manual **Refresh latest data now** button plus an import status dashboard showing
daily/recent cursors, recently processed historical archive dates, and recent import logs.

### Providers

Primary provider:

- ADSB.lol API data for frequent recent incremental operation
- ADSB.lol GitHub historical archives for one-time historical bootstrap

Research/fallback provider:

- OpenSky API, configured with `OPENSKY_USERNAME` and `OPENSKY_PASSWORD` when authenticated access is available

Backup import:

- Manual CSV upload remains available at `/admin`

### Private Jet Aircraft Allowlist

Only these aircraft type codes are imported by the recent private jet batch:

```txt
GLEX GLF4 GLF5 GLF6 GLF7 C25A C25B C25C C56X CL30 CL35 LJ45 F2TH F900 F2LX
```

### Scheduling Frequent Recent Imports

Use whichever scheduler fits the deployment. The default interval is 60 minutes:

```bash
pnpm ingest:daily
```

Recommended schedules:

```cron
# Every 60 minutes
0 * * * *

# Every 30 minutes
*/30 * * * *
```

Vercel Cron can call the protected endpoint:

```bash
GET /api/cron/ingest
Authorization: Bearer $CRON_SECRET
```

GitHub Actions can run the script on a schedule:

```yaml
name: PaperStraw recent ingest
on:
  schedule:
    - cron: "0 * * * *"
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm ingest:daily
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DATA_REFRESH_INTERVAL_MINUTES: "60"
```

Linux cron can run:

```cron
0 * * * * cd /path/to/paperstraw && pnpm ingest:daily
```

Windows Task Scheduler can run `pnpm ingest:daily` every 30 or 60 minutes from the project folder. Make sure the task has
`DATABASE_URL` and provider variables available.

## Equivalent Values

Equivalent values are calculated in `lib/awareness/equivalents.ts` from configurable constants:

```ts
CO2_EQUIVALENT_CONSTANTS = {
  paperStrawCo2Kg: 0.0015,
  kgCo2PerCarYear: 4600,
  kgCo2PerHouseholdYear: 7100,
  kgCo2PerTreeYear: 21.8
};
```

The paper-straw equivalent assumes `0.0015 kg CO2` per straw as a simple production-emissions estimate. All equivalent
values are estimates derived from imported aggregate data.

## Local Setup

PaperStraw now uses SQLite for local development and MVP deployment. No Docker or PostgreSQL server is required.

1. Install dependencies:

   ```bash
   pnpm install
   ```

   If pnpm asks to approve package build scripts, approve Prisma and esbuild-related packages, then run:

   ```bash
   pnpm db:generate
   ```

2. Create `.env`:

   ```bash
   cp .env.example .env
   ```

3. Run the SQLite migration:

   ```bash
   pnpm prisma migrate dev
   ```

4. Optionally seed demo development data:

   ```bash
   pnpm db:seed
   ```

5. Optionally run the recent import:

   ```bash
   pnpm ingest:daily
   ```

6. Start the app:

   ```bash
   pnpm dev
   ```

## Environment Variables

```bash
DATABASE_URL="file:./dev.db"
ADMIN_USERNAME=""
ADMIN_PASSWORD=""
DATA_REFRESH_INTERVAL_MINUTES=60
CRON_SECRET="change-me"
ADSB_LOL_DAILY_URL=""
ADSB_EXCHANGE_API_KEY=""
ADSB_EXCHANGE_RECENT_FLIGHTS_URL=""
OPENSKY_USERNAME=""
OPENSKY_PASSWORD=""
GITHUB_TOKEN=""
PAYPAL_URL="https://www.paypal.com/ncp/payment/8JHGP7DSZ28XW"
BUY_ME_A_COFFEE_URL=""
BITCOIN_ADDRESS=""
ETHEREUM_ADDRESS=""
```

On PowerShell, set one-off variables with `$env:`:

```powershell
$env:DATABASE_URL="file:./dev.db"
$env:ADSB_LOL_DAILY_URL="https://example.com/adsb-lol-daily-export.json"
```

Typing `ADSB_LOL_DAILY_URL` by itself runs it as a command; PowerShell environment variables use `$env:ADSB_LOL_DAILY_URL`.

Prisma commands such as `pnpm prisma migrate dev` also require `DATABASE_URL`. For local development, use `DATABASE_URL="file:./dev.db"`. Prisma stores the SQLite database at `prisma/dev.db`.

The minimal MVP run sequence is:

```bash
pnpm install
pnpm prisma migrate dev
pnpm ingest:daily
pnpm dev
```

To backfill a small historical range into the same local SQLite database at `prisma/dev.db`, run:

```bash
pnpm ingest:historical --from 2026-01-01 --to 2026-01-07
```

`pnpm ingest:daily` uses ADSB.lol public `/type/{aircraftType}` API snapshots for the configured private/business jet
allowlist and advances the `ADSB_LOL / DAILY_API` cursor after a successful or partial run. It can run every 30-60 minutes
without rescanning historical archives. Historical archives are only scanned by `pnpm ingest:historical`.

`ADMIN_USERNAME` and `ADMIN_PASSWORD` protect `/admin`, admin server actions, `/api/admin/*`, `/api/cron/*`, and `/api/ingest`.
If either value is missing, protected routes return `401 Unauthorized`.

`DATA_REFRESH_INTERVAL_MINUTES` controls how the app labels the refresh cadence and how ADSB.lol snapshot fallback records
are bucketed. The default is `60`; `30` is also a recommended schedule. `CRON_SECRET` can also authorize `/api/cron/ingest`
for schedulers that send bearer tokens.

`ADSB_EXCHANGE_RECENT_FLIGHTS_URL` is retained for the older ADS-B Exchange adapter, but `pnpm ingest:daily` uses ADSB.lol first.

OpenSky is included as a fallback/research provider. Current OpenSky documentation describes OAuth2 client credentials for authenticated access, while this MVP keeps the requested username/password variables for compatibility with older setups. Anonymous calls may still be rate-limited and incomplete.

`GITHUB_TOKEN` is optional. Historical ingestion uses the public GitHub releases API for ADSB.lol archive metadata and
assets; adding a token can help avoid anonymous rate limits during backfills.

## Support Configuration

The public navigation links to `/support`. PayPal is the primary support method and defaults to the live PaperStraw payment
link:

```bash
PAYPAL_URL="https://www.paypal.com/ncp/payment/8JHGP7DSZ28XW"
```

Legacy or secondary options remain backward-compatible, but empty values are hidden from the UI:

```bash
BUY_ME_A_COFFEE_URL=""
BITCOIN_ADDRESS="bc1..."
ETHEREUM_ADDRESS="0x..."
```

The homepage support section and `/support` page both read these values. The support page uses PaperStraw-styled buttons
and does not embed third-party donation widgets.

## Running Tests

```bash
pnpm test
```

The emissions calculation is isolated in `lib/emissions/calculate.ts` and covered by `tests/emissions.test.ts`. Aggregate and equivalent helpers are covered by `tests/awareness.test.ts`.

## CSV Import

Open `/admin` with HTTP Basic Auth and upload a CSV with these columns:

```csv
aircraft registration,icao hex,aircraft type,origin,destination,departure date/time,arrival date/time,distance_km,optional verified public entity
N742QS,A1B2C3,G650,KTEB,KLAX,2026-06-01T09:30:00Z,2026-06-01T14:40:00Z,3974,
```

The importer validates required fields before writing. Entity names should only be populated when public-source verification is explicit.

## Scheduled Ingestion

Run provider ingestion manually or from cron:

```bash
pnpm ingest:daily
pnpm ingest:historical --from 2026-01-01 --to 2026-01-07
pnpm ingest:adsb-lol
pnpm ingest:adsb
pnpm ingest:opensky
```

There is also a protected cron endpoint for frequent recent refreshes:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/ingest
```

The same cron endpoint also accepts admin Basic Auth:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" http://localhost:3000/api/cron/ingest
```

The older generic endpoint remains available for local/manual provider testing, but it is admin-protected:

```bash
curl -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" "http://localhost:3000/api/ingest?provider=daily"
```

`vercel.json` includes an hourly cron schedule for hosted deployments. To refresh every 30 minutes, change the schedule to
`*/30 * * * *`.

Historical ingestion and recent ingestion are intentionally separate:

- `pnpm ingest:historical` is for one-time backfill from ADSB.lol archive releases and can scan large archive assets.
- `pnpm ingest:daily` is for frequent recent updates from the API/cursor path and does not scan historical archives.

Every imported flight stores `dataSource` and `sourceAttribution`, and every job writes an `ImportLog`.

## Local Cron Testing With PowerShell

Use these copy-pasteable commands from the project folder.

Start the site locally:

```powershell
$env:DATABASE_URL="file:./dev.db"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="replace-this-password"
$env:CRON_SECRET="replace-this-cron-secret"
$env:DATA_REFRESH_INTERVAL_MINUTES="60"
pnpm dev
```

In a second PowerShell window, test that anonymous cron access is blocked:

```powershell
try {
  Invoke-WebRequest "http://localhost:3000/api/cron/ingest" -UseBasicParsing
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected result:

```text
401
```

Test authorized cron access with the bearer secret:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/cron/ingest" `
  -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

Test authorized cron access with admin Basic Auth:

```powershell
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$env:ADMIN_USERNAME`:$env:ADMIN_PASSWORD"))
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/cron/ingest" `
  -Headers @{ Authorization = "Basic $basic" }
```

Verify a new `ImportLog` appeared:

```powershell
$env:DATABASE_URL="file:./dev.db"
pnpm prisma studio
```

Open the `ImportLog` table and check the latest row. You should see provider `ADSB_LOL`, mode `DAILY_API`, status, records
fetched, records considered, and records imported. You can also open `/admin` with your Basic Auth credentials and check
the Cron refresh status panel.

## Deploying Automatic Refresh On Vercel

`vercel.json` configures Vercel Cron:

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "0 * * * *"
    }
  ]
}
```

That schedule means every 60 minutes. It matches the default:

```bash
DATA_REFRESH_INTERVAL_MINUTES=60
```

Required Vercel environment variables:

```bash
DATABASE_URL="file:./dev.db"
CRON_SECRET="use-a-long-random-token"
DATA_REFRESH_INTERVAL_MINUTES=60
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="use-a-long-random-password"
PAYPAL_URL="https://www.paypal.com/ncp/payment/8JHGP7DSZ28XW"
```

Optional Vercel environment variables:

```bash
ADSB_LOL_DAILY_URL=""
GITHUB_TOKEN=""
ADSB_EXCHANGE_API_KEY=""
ADSB_EXCHANGE_RECENT_FLIGHTS_URL=""
OPENSKY_USERNAME=""
OPENSKY_PASSWORD=""
```

Use `ADSB_LOL_DAILY_URL` only if you have a specific ADSB.lol export/API URL to use instead of the built-in public type
snapshot path. Use `GITHUB_TOKEN` for historical archive backfills if GitHub rate limits become a problem.

After deployment:

- Open Vercel project settings and confirm the environment variables are set for Production.
- Open the Vercel Cron page and confirm `/api/cron/ingest` is listed with schedule `0 * * * *`.
- After the next hourly run, check Vercel function logs for `/api/cron/ingest`.
- Open PaperStraw `/admin` with Basic Auth and check the Cron refresh status panel.
- Confirm the latest `ImportLog` row has provider `ADSB_LOL`, mode `DAILY_API`, and a recent timestamp.

## Admin Authentication

Administrative functionality is protected by middleware before the request reaches the page or route handler.

Protected:

- `/admin`
- `/api/admin/*`
- `/api/cron/*`
- `/api/ingest`

Public:

- `/`
- `/data`
- `/methodology`
- `/support`

Set strong credentials in `.env`:

```bash
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="replace-with-a-long-random-password"
CRON_SECRET="replace-with-a-long-random-token"
```

Unauthenticated requests receive `401 Unauthorized` with a Basic Auth challenge. `/api/cron/*` also accepts
`Authorization: Bearer $CRON_SECRET` for scheduler integrations.

## Methodology And Ethics

- Emissions are estimates: `distance_km * kg_CO2_per_km`.
- Emission factors live in the `EmissionFactor` table and can be updated without changing calculation code.
- Personal names are not exposed by default.
- The homepage avoids personal naming and focuses on systemic aggregate awareness.
- Recent ingestion does not store or display owners, individual people, or ownership claims.
- Visible pages use aggregation only: global totals, trends, countries, airports, and aircraft types.
- Homepage totals, equivalents, and rankings may contain incomplete, delayed, duplicated, or corrected data.

## Provider Notes

- ADS-B Exchange data products include historical aircraft activity and daily operations feeds for completed flight events.
- OpenSky REST APIs expose state vectors and flight endpoints, but coverage, rate limits, and authentication requirements vary.

Useful docs:

- ADS-B Exchange data products: https://www.adsbexchange.com/data-products/
- OpenSky REST API: https://openskynetwork.github.io/opensky-api/rest.html
