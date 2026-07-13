# PaperStraw

PaperStraw is an MVP CO₂ awareness dashboard for private jet flight activity. It estimates emissions from source-attributed scheduled batch imports, presents aggregate awareness metrics, and keeps privacy defaults conservative.

## Stack

- Next.js with TypeScript
- PostgreSQL with Prisma
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

## Explicit Recent Import Compatibility

Run the incremental recent-data API refresh with:

```bash
pnpm ingest:daily
```

This compatibility command is available for explicit operator testing. It is not used by the production cron or the normal
Private Jets admin workflow, and it is not live flight tracking.

The compatibility command:

- fetches recent aircraft-type API snapshots from ADSB.lol
- reads the `ADSB_LOL / DAILY_API` cursor from the PostgreSQL database
- only considers records newer than the last successful scheduled import cursor
- keeps only likely private/business jet aircraft types from the allowlist
- normalizes records into `Aircraft` and `Flight`
- estimates distance from known airport metadata when needed
- calculates estimated CO₂ with the existing emission factor pipeline
- skips duplicates using `dataSource + sourceRecordId`
- updates the last imported timestamp cursor after a successful or partial run
- recalculates daily, monthly, yearly, country, airport, and aircraft type aggregate rollups
- writes an `ImportLog` with start time, end time, status, records fetched, records considered, records imported, and any error message

The app does not implement live flight tracking or show aircraft positions.

## Historical Bootstrap

Complete historical days are now the canonical scheduled Private Jets ingest. Vercel dispatches yesterday UTC to GitHub Actions at 06:00 UTC, and `/admin/private-jets` can dispatch an inclusive range of up to 31 completed days. See [`docs/private-jets-historical-ingestion.md`](docs/private-jets-historical-ingestion.md) for setup, environment variables, retries, and PowerShell verification.

Run a historical ADSB.lol archive bootstrap with:

```bash
pnpm ingest:historical --from YYYY-MM-DD --to YYYY-MM-DD
```

To re-scan dates that were already marked as successful, add `--force` or `--reprocess`:

```bash
pnpm ingest:historical --from YYYY-MM-DD --to YYYY-MM-DD --force
```

Reprocess mode keeps duplicate protection enabled. Existing matching flights are not inserted again; only the attribution
fields (`originAirportIdent`, `destinationAirportIdent`, `originCountryCode`, `destinationCountryCode`,
`attributionSource`, and `attributionConfidence`) are refreshed before rollups are recalculated.

The same historical implementation is used by CLI, protected admin dispatch, and the scheduled GitHub Actions runner.
`pnpm ingest:daily` remains an explicit compatibility command but is no longer the production cron workflow.

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
- allows those already-processed dates to be scanned again when `--force` or `--reprocess` is provided
- streams the split tar archive assets and reads ADSB.lol `traces/**/*.json` files, including gzip-compressed JSON files that do not use a `.gz` suffix
- keeps only aircraft types from the private/business jet allowlist
- creates one aggregate aircraft-day record per matching aircraft for that date
- skips duplicates using the unique `dataSource + sourceRecordId` key
- writes imported flights into the configured PostgreSQL database
- records archive date status, release tag, asset names, files scanned, files matched, records parsed, private jet matches, and records imported
- recalculates daily, monthly, yearly, country, airport, and aircraft type rollups
- prints progress for every date and continues when a date is unavailable

ADSB.lol historical archives are very large. The 2026 archive repository describes the dataset at roughly terabyte scale,
and a single daily release can be large. Start with a small date range first, confirm the output, then expand the range
deliberately.

### Airport Attribution

PaperStraw uses OurAirports as the airport reference dataset. The checked-in file lives at:

```txt
data/ourairports/airports.csv
```

The lookup includes large, medium, and small airports and excludes closed airports. Heliports are excluded by default to
avoid assigning private jet records to city heliports, but can be enabled for research with `OURAIRPORTS_INCLUDE_HELIPORTS=true`.

Matching order:

- exact airport ident / ICAO code
- exact IATA code
- airport name or municipality
- nearest coordinate match within `AIRPORT_MATCH_MAX_RADIUS_KM`
- `UNKNOWN` when no reasonable match exists

The default coordinate radius is `75 km`. `ENROUTE` is kept only for current-position snapshots where there is no reliable
destination airport.

### Full Historical Reimport Plan

Do not wipe production data automatically. For a full attribution rebuild:

1. Create a Neon backup or branch from the current production database.
2. Confirm `data/ourairports/airports.csv` is present and current.
3. Deploy migrations so the nullable airport attribution columns exist on `Flight`.
4. On the backup/branch first, clear rebuildable imported data only after confirmation: `Flight`, `AggregateRollup`,
   `ImportLog`, `IngestionCursor`, and `ProcessedArchiveDate`. Keep schema migrations and emission factors.
5. Run a small historical range first, for example:

   ```bash
   pnpm ingest:historical --from 2026-01-01 --to 2026-01-03
   ```

6. Verify duplicate protection with `dataSource + sourceRecordId` by rerunning the same small range.
7. Check `/data` attribution rates, top airports, top countries, and import logs.
8. Run the full intended historical range only after the small-range verification looks correct.
9. Verify rollups, homepage totals, `/data`, `/admin/validation`, and Neon usage before promoting the rebuilt database.

The `/admin/private-jets` page includes a protected **Historical data import** form plus job and processed-date status.

### Providers

Primary provider:

- ADSB.lol GitHub historical archives for complete daily Private Jets imports

Research/fallback provider:

- OpenSky API, configured with `OPENSKY_USERNAME` and `OPENSKY_PASSWORD` when authenticated access is available

Backup import:

- Manual CSV upload remains available at `/admin`

### Private Jet Aircraft Allowlist

Only these aircraft type codes are imported by the recent private jet batch:

```txt
GLEX GLF4 GLF5 GLF6 GLF7 C25A C25B C25C C56X CL30 CL35 LJ45 F2TH F900 F2LX
```

### Scheduling Recent Imports

Use whichever scheduler fits the deployment. The current hosted Vercel Hobby schedule is once per day, and administrators
can trigger additional refreshes manually from `/admin`:

```bash
pnpm ingest:daily
```

Vercel Hobby schedule:

```cron
# Once per day at 06:00 UTC
0 6 * * *
```

Vercel Cron can call the protected endpoint:

```bash
GET /api/cron/ingest
Authorization: Bearer $CRON_SECRET
```

Vercel dispatches `.github/workflows/private-jets-historical-ingest.yml`. That workflow accepts the validated inclusive
date range, force flag, execution source, and existing database job ID, then runs the shared historical CLI on a GitHub
runner with the `PRIVATE_JETS_DATABASE_URL` repository secret.

For self-hosted equivalents, schedule the historical command for yesterday only after the upstream daily release is available. The hosted PaperStraw workflow uses GitHub Actions instead of running archive work inside the Vercel request.

```cron
0 6 * * * cd /path/to/paperstraw && pnpm ingest:historical --from YESTERDAY_UTC --to YESTERDAY_UTC
```

Windows Task Scheduler can run the same historical command. Historical jobs require `PRIVATE_JETS_DATABASE_URL` explicitly.

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

PaperStraw uses PostgreSQL through Prisma. For local development and MVP deployment, create a Neon Postgres database and use its connection string as `DATABASE_URL`.

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

3. Add your Neon PostgreSQL connection string to `.env`:

   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require"
   ```

4. Run the PostgreSQL migration:

   ```bash
   pnpm prisma migrate dev
   ```

5. Optionally seed demo development data:

   ```bash
   pnpm db:seed
   ```

6. Optionally run the recent import:

   ```bash
   pnpm ingest:daily
   ```

7. Start the app:

   ```bash
   pnpm dev
   ```

## Environment Variables

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require"
ADMIN_USERNAME=""
ADMIN_PASSWORD=""
DATA_REFRESH_INTERVAL_MINUTES=1440
CRON_SECRET="change-me"
ADSB_LOL_DAILY_URL=""
ADSB_EXCHANGE_API_KEY=""
ADSB_EXCHANGE_RECENT_FLIGHTS_URL=""
OPENSKY_USERNAME=""
OPENSKY_PASSWORD=""
GITHUB_TOKEN=""
AIRPORT_MATCH_MAX_RADIUS_KM=75
OURAIRPORTS_INCLUDE_HELIPORTS=false
PAYPAL_URL="https://www.paypal.com/ncp/payment/8JHGP7DSZ28XW"
BUY_ME_A_COFFEE_URL=""
BITCOIN_ADDRESS=""
ETHEREUM_ADDRESS=""
```

On PowerShell, set one-off variables with `$env:`:

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require"
$env:ADSB_LOL_DAILY_URL="https://example.com/adsb-lol-daily-export.json"
```

Typing `ADSB_LOL_DAILY_URL` by itself runs it as a command; PowerShell environment variables use `$env:ADSB_LOL_DAILY_URL`.

Prisma commands such as `pnpm prisma migrate dev` also require `DATABASE_URL`. Use the Neon PostgreSQL connection string from your Neon project dashboard.

The minimal MVP run sequence is:

```bash
pnpm install
pnpm prisma migrate dev
pnpm ingest:daily
pnpm dev
```

## Migrating To Neon PostgreSQL

This migration prepares the schema for PostgreSQL only. Do not import historical or daily flight data until the migration has been applied and the app starts successfully.

1. Create a Neon project and database.

2. Copy the Neon PostgreSQL connection string. It should look like:

   ```bash
   postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require
   ```

3. Set `DATABASE_URL` in `.env` locally and in your hosting provider:

   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require"
   ```

4. Generate the Prisma client:

   ```bash
   pnpm db:generate
   ```

5. Apply migrations locally or to a development Neon branch:

   ```bash
   pnpm prisma migrate dev
   ```

6. For production deployment, apply the checked-in migrations:

   ```bash
   pnpm prisma migrate deploy
   ```

7. Start the app and confirm public pages load:

   ```bash
   pnpm dev
   ```

8. Only after the schema is confirmed, run ingestion when you are ready:

   ```bash
   pnpm ingest:daily
   ```

To backfill a small historical range into the same PostgreSQL database, run:

```bash
pnpm ingest:historical --from 2026-01-01 --to 2026-01-07
```

To test improved airport/country attribution against dates that were previously imported, run the same command with
`--force` or `--reprocess`. This re-scans the archives and updates only attribution fields on duplicate flights:

```bash
pnpm ingest:historical --from 2026-01-01 --to 2026-01-07 --force
```

`pnpm ingest:daily` remains available for explicit compatibility/research use. The production scheduler and normal admin
workflow use `pnpm ingest:historical` through the shared GitHub Actions runner.

`ADMIN_USERNAME` and `ADMIN_PASSWORD` protect `/admin`, admin server actions, `/api/admin/*`, `/api/cron/*`, and `/api/ingest`.
If either value is missing, protected routes return `401 Unauthorized`.

`CRON_SECRET` authorizes `/api/cron/ingest` for the daily historical workflow dispatcher. Historical execution requires
`PRIVATE_JETS_DATABASE_URL`; it does not silently fall back to an ambiguous generic database variable.

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

There is also a protected cron endpoint that dispatches yesterday UTC to the historical GitHub Actions workflow:

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

`vercel.json` includes a once-per-day 06:00 UTC cron schedule for Vercel Hobby deployments.

`pnpm ingest:historical` is the canonical scheduled and manual Private Jets workflow. `pnpm ingest:daily` is retained only
for explicit compatibility use and is not invoked by Vercel Cron.

Every imported flight stores `dataSource` and `sourceAttribution`, and every job writes an `ImportLog`.

## Local Cron Testing With PowerShell

Use these copy-pasteable commands from the project folder.

Start the site locally:

```powershell
  $env:PRIVATE_JETS_DATABASE_URL="postgresql://USER:PASSWORD@NON_PRODUCTION_HOST/PRIVATE_JETS_DB?sslmode=require"
  $env:DATABASE_URL=$env:PRIVATE_JETS_DATABASE_URL
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="replace-this-password"
$env:CRON_SECRET="replace-this-cron-secret"
  $env:GITHUB_ACTIONS_TOKEN="replace-with-workflow-dispatch-token"
  $env:GITHUB_ACTIONS_REPOSITORY="OWNER/REPOSITORY"
  $env:GITHUB_ACTIONS_REF="feature/private-jets-historical-ingest"
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
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require"
pnpm prisma studio
```

Open the `ImportLog` table and check the latest row. You should see provider `ADSB_LOL`, mode `HISTORICAL_BOOTSTRAP`, the
queued/running/final status, records fetched, records considered, and records imported. You can also open
`/admin/private-jets` and check the Scheduled historical import panel.

## Deploying Automatic Refresh On Vercel

`vercel.json` configures Vercel Cron:

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
        "schedule": "0 6 * * *"
    }
  ]
}
```

That schedule means once per day at 06:00 UTC. Required Vercel variables are:

```bash
DATA_REFRESH_INTERVAL_MINUTES=1440
```

Required Vercel environment variables:

```bash
  PRIVATE_JETS_DATABASE_URL="postgresql://USER:PASSWORD@HOST.neon.tech/PRIVATE_JETS_DB?sslmode=require"
CRON_SECRET="use-a-long-random-token"
  GITHUB_ACTIONS_TOKEN="least-privilege-actions-dispatch-token"
  GITHUB_ACTIONS_REPOSITORY="OWNER/REPOSITORY"
  GITHUB_ACTIONS_REF="main"
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
AIRPORT_MATCH_MAX_RADIUS_KM=75
OURAIRPORTS_INCLUDE_HELIPORTS=false
```

Set the GitHub Actions repository secret `PRIVATE_JETS_DATABASE_URL` to the same Private Jets database. `GITHUB_TOKEN`
remains optional for historical source API rate limits.

Cruise module variables are optional and disabled by default:

```bash
ENABLE_CRUISES=false
ENABLE_AISSTREAM_INGESTION=false
AISSTREAM_API_KEY=""
```

After deployment:

- Open Vercel project settings and confirm the environment variables are set for Production.
- Open the Vercel Cron page and confirm `/api/cron/ingest` is listed with schedule `0 6 * * *`.
- After the next scheduled dispatch, check Vercel logs for a short queued/skipped response and GitHub Actions for execution.
- Open `/admin/private-jets` with Basic Auth and check Scheduled historical import.
- Confirm the latest `ImportLog` row has provider `ADSB_LOL`, mode `HISTORICAL_BOOTSTRAP`, and the expected UTC date range.

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

## Cruise Ship Emissions Module

PaperStraw can also track aggregate cruise ship emissions using free/open sources first. This module is feature flagged so
the private jet dashboard remains unchanged while cruise ingestion is tested.

Develop cruise changes on the `feature/cruises` branch and use a separate `DATABASE_URL` or Neon branch for cruise
testing. Before applying migrations, inspect the generated SQL and confirm it only creates cruise-related tables and
indexes. Never apply cruise migrations directly to production first; apply them to a Neon branch or disposable database,
verify the migration, then promote deliberately.

Enable the public cruise pages after deploying the cruise migration:

```bash
ENABLE_CRUISES=true
```

AIS ingestion is separate and disabled by default:

```bash
ENABLE_AISSTREAM_INGESTION=false
AISSTREAM_API_KEY="your-aisstream-key"
AISSTREAM_LOG_LEVEL="info"
CRUISE_AIS_INGEST_MODE="discovery"
AISSTREAM_BOUNDING_BOXES=""
```

The AIS worker connects to:

```txt
wss://stream.aisstream.io/v0/stream
```

Create a free AISStream account at https://aisstream.io, copy the API key, and set `AISSTREAM_API_KEY` in `.env` or in
the environment where the worker runs.

PaperStraw does not subscribe to the entire world by default. The built-in AISStream coverage uses route-focused cruise
corridors and coastal cruise regions so message volume stays manageable.

The default cruise coverage regions are:

- Mediterranean
- Caribbean
- North Sea
- Baltic Sea
- Alaska
- Norwegian Fjords
- US East Coast
- US West Coast
- Mexico / Baja California
- Canary Islands / Madeira / Azores
- Red Sea
- Persian Gulf / Dubai
- Singapore / Southeast Asia
- Japan
- Australia East Coast
- New Zealand
- South Pacific
- South America / Patagonia
- Antarctica cruise approach routes

Local cruise filtering does not reduce incoming AISStream traffic. AISStream sends all ship messages inside subscribed
bounding boxes first, then PaperStraw filters for passenger/cruise-like vessels or known MRV ships locally. Wider
coverage increases incoming messages, network usage, CPU parsing work, database writes, and potential hosting cost.

Route coverage is not the same thing as complete global vessel coverage. Long ocean crossings outside configured
corridors may not be captured until a vessel enters one of the subscribed boxes.

To override the regions, set `AISSTREAM_BOUNDING_BOXES` to a JSON array. If this variable is missing, empty, or blank,
PaperStraw uses all default cruise corridor regions. If it is set, it fully replaces the defaults; custom boxes are not
merged with the built-in list. Invalid explicit JSON fails startup with an actionable error.

Supported override format:

```json
[
  {
    "id": "test-mediterranean",
    "name": "Test Mediterranean",
    "boundingBox": [[35.0, 10.0], [43.0, 22.0]]
  }
]
```

`boundingBox` uses `[[minLat, minLon], [maxLat, maxLon]]`, the same order expected by AISStream.

Only relevant vessels are persisted: passenger/cruise-like AIS ship types or ships already known from imported MRV data by
IMO or MMSI. Cargo, tanker, fishing, military, corrupt, implausibly fast, duplicate, and impossible-jump messages are
ignored. The worker reconnects automatically with exponential backoff and logs status once per minute.

Import EMSA THETIS-MRV annual emissions from a CSV/manual export:

```bash
pnpm cruises:import-mrv --file path/to/thetis-mrv.csv
```

The import matches ships by IMO, upserts `cruise_ships`, and writes annual CO2 and fuel records to
`cruise_emissions_annual`. It is idempotent and safe to rerun with corrected CSV data.

Run AIS ingestion locally:

```bash
ENABLE_AISSTREAM_INGESTION=true
pnpm cruises:ingest-ais
```

AIS ingestion modes:

- `discovery`: default mode. Uses the configured regional cruise corridor bounding boxes and collects passenger/cruise-like candidate vessels for future registry matching.
- `verified-global`: uses the verified AIS allowlist and AISStream `FiltersShipMMSI` to track verified public-eligible cruise ships globally. It refuses to start if no verified MMSIs are available.
- `hybrid`: runs both discovery corridors and verified global MMSI-filtered subscriptions. If no verified MMSIs are available, it continues with discovery only and logs a warning.

The default remains `discovery` so existing development behavior does not silently change. Set `CRUISE_AIS_INGEST_MODE=hybrid` for current local cruise-development testing when you want both candidate discovery and verified global tracking.

Mode commands:

```bash
pnpm cruises:ingest-ais -- --mode discovery
pnpm cruises:ingest-ais -- --mode verified-global
pnpm cruises:ingest-ais -- --mode hybrid
pnpm cruises:verified-ais-allowlist
pnpm cruises:registry:reconcile -- --apply
```

For a short startup validation without leaving the worker running:

```bash
pnpm cruises:ingest-ais -- --mode verified-global --max-runtime-ms 10000
```

AISStream connection diagnostics:

```bash
pnpm cruises:ingest-ais -- --diagnostic-profile discovery --max-runtime-ms 10000
pnpm cruises:ingest-ais -- --diagnostic-profile verified-global --max-runtime-ms 10000
pnpm cruises:ingest-ais -- --diagnostic-profile hybrid-discovery-first --max-runtime-ms 10000
pnpm cruises:ingest-ais -- --diagnostic-profile hybrid-verified-first --max-runtime-ms 10000
pnpm cruises:ingest-ais -- --diagnostic-profile hybrid-one-batch --max-runtime-ms 10000
pnpm cruises:ingest-ais -- --diagnostic-profile hybrid-two-batches --max-runtime-ms 10000
pnpm cruises:ingest-ais -- --diagnostic-profile hybrid-three-batches --max-runtime-ms 10000
pnpm cruises:ingest-ais -- --diagnostic-profile discovery --discovery-region-limit 1 --max-runtime-ms 10000
```

Diagnostics log sanitized subscription summaries only: connection label, mode/type, bounding-box count, MMSI count, and message types. API keys are never logged. If AISStream rejects or rate-limits handshakes, rapid failures back off more slowly to avoid noisy retry loops.

In PowerShell:

```powershell
$env:ENABLE_AISSTREAM_INGESTION="true"
$env:AISSTREAM_API_KEY="your-aisstream-key"
$env:CRUISE_AIS_INGEST_MODE="hybrid"
pnpm cruises:ingest-ais -- --mode hybrid
```

The worker runs continuously until stopped with `Ctrl+C`.

Leave `ENABLE_AISSTREAM_INGESTION=false` in production unless you explicitly want a long-running AIS worker in that
environment. Vercel serverless functions are not a good place for persistent WebSocket workers; run the AIS worker from a
machine or service designed for long-running processes.

Do not deploy the hybrid worker to Railway or production until registry completeness has been reviewed, coverage reporting is understood, cruise emissions estimation has been validated, and public dashboard copy has been approved. Hybrid mode does not mean complete worldwide cruise coverage: verified-global covers only registry-linked verified ships with known MMSIs, while discovery corridors remain regional candidate collection.

Expected database growth depends on region coverage and cruise traffic. As a starting estimate, a handful of busy cruise
regions can store thousands to tens of thousands of position rows per day after filtering. Monitor
`cruise_positions`, Neon storage, and network transfer before expanding bounding boxes.

Troubleshooting:

- If the worker exits immediately, confirm `ENABLE_AISSTREAM_INGESTION=true`.
- If authentication fails, confirm `AISSTREAM_API_KEY` is set and current.
- If no rows are stored, import MRV data first or confirm AIS messages include passenger/cruise ship type values.
- If reconnects are frequent, check local network stability and AISStream service status.
- Use `AISSTREAM_LOG_LEVEL=debug` to see filtered-message reasons during development.

Cruise estimates:

- use EMSA THETIS-MRV annual CO2 as the baseline when available
- estimate daily/YTD emissions from observed AIS underway time and distance
- fall back to lower-confidence size/speed heuristics when MRV data is unavailable
- store a `confidence_score` and method version for every daily estimate
- are always presented as estimates, not official real-time emissions

Cruise pages:

- `/cruises`
- `/cruises/[shipId]`

Source attribution is shown for AISStream.io and EMSA THETIS-MRV.

## Cruise Verification Workflow

PaperStraw's cruise module treats AIS records as candidate vessel data, not public-ready cruise scope verification.

Workflow:

1. AISStream ingestion produces passenger-vessel candidates in `cruise_ships` and `cruise_positions`.
2. Candidates are not automatically public-eligible.
3. Curated registry imports define exact IMO-level `ACCEPT` and `EXCLUDE` decisions.
4. Registry reconciliation creates transparent verification states.
5. Only `VERIFIED_OCEAN_CRUISE` vessels may later be used for public cruise maps, emissions totals, rankings, and dashboard claims.
6. Review queue exports help identify unresolved candidates for manual verification.

Strict verification rule:

`VERIFIED_OCEAN_CRUISE` requires an exact IMO match against a curated registry entry with `registry_decision=ACCEPT`.

AIS passenger type, vessel names, dimensions, speed patterns, MRV passenger classification, or text containing "cruise" are useful evidence, but they must never verify a vessel by themselves.

THETIS-MRV is useful for annual CO2/fuel baselines and IMO-level evidence. An MRV match may enrich a review record, but it is not sufficient to verify leisure ocean-cruise scope without an exact curated registry match.

Seed registry workflow:

Use `data/cruises/verified-ocean-cruise-registry.csv` to build a small, manually verified seed list of roughly 20-30 major ocean cruise ships. Start with well-known ocean cruise vessels whose public identity can be verified from primary or high-quality sources. Do not copy large vessel directories into the registry, and do not accept any ship from name matching, AIS passenger type, MRV classification, dimensions, operator text, or route patterns alone.

Before adding an `ACCEPT` row, a maintainer must verify:

- one official operator or fleet source proving that the vessel belongs to an ocean-going leisure cruise fleet
- one IMO identity source proving the exact seven-digit IMO for that same vessel
- a valid IMO checksum
- canonical vessel name, operator, vessel segment, active status, source URL, and source checked date

`EXCLUDE` rows should document why a candidate is out of scope, such as ferry, RoPax, river cruise, water taxi, excursion vessel, high-speed passenger craft, yacht, cargo vessel, tanker, fishing vessel, military vessel, or another non-ocean-cruise category.

Recommended seed workflow:

1. Pick one candidate vessel from the local review queue or from an official operator fleet page.
2. Verify ocean-cruise fleet membership from an official operator/fleet source.
3. Verify the exact IMO from a separate IMO identity source.
4. Add one row to `data/cruises/verified-ocean-cruise-registry.csv`.
5. Run the validation report.
6. Dry-run the registry import.
7. Apply and reconcile only on `cruises-dev` after the CSV passes review.

CSV validation report:

```bash
pnpm cruises:validate-registry -- --file data/cruises/verified-ocean-cruise-registry.csv
```

The report is read-only and shows `ACCEPT`/`EXCLUDE` counts, duplicate IMO conflicts, missing source URLs, missing source checked dates, invalid IMO format/checksum rows, missing names/operators, missing or invalid vessel segments, and active versus retired counts.

Curated registry commands:

```bash
pnpm cruises:import-registry -- --file data/cruises/verified-ocean-cruise-registry.csv --dry-run
pnpm cruises:import-registry -- --file data/cruises/verified-ocean-cruise-registry.csv --apply
```

Registry status report:

```bash
pnpm cruises:registry:status
```

This command is read-only and reports registry entries, verified candidate matches, accepted registry entries not yet seen in AIS data, current public-eligible vessels, and candidate ships still awaiting review.

Registry expansion manifest:

`data/cruises/registry-expansion-manifest.csv` tracks the planned operator-by-operator registry expansion. It is a planning and coverage file only; it does not make any vessel public eligible.

Manifest statuses:

- `NOT_STARTED`
- `RESEARCHING`
- `READY_FOR_REVIEW`
- `IMPORTED`
- `NEEDS_MANUAL_SCOPE_DECISION`

Manifest expected scope values:

- `OCEAN_CRUISE`
- `EXPEDITION_CRUISE`
- `REVIEW_REQUIRED`

Standard operator batch process:

1. Select one operator from `data/cruises/registry-expansion-manifest.csv`.
2. Verify official active-fleet membership from an operator, fleet, annual report, investor fleet list, or official company source.
3. Verify exact IMO identity using an independent vessel identity source.
4. Add only fully sourced rows to `data/cruises/verified-ocean-cruise-registry.csv`.
5. Run selected-operator validation:

```bash
pnpm cruises:validate-registry -- --file data/cruises/verified-ocean-cruise-registry.csv --operator "MSC Cruises"
```

6. Review the CSV diff.
7. Run import dry-run:

```bash
pnpm cruises:import-registry -- --file data/cruises/verified-ocean-cruise-registry.csv --dry-run
```

8. Apply the registry import only after manual review and only on the intended database.
9. Run reconciliation dry-run:

```bash
pnpm cruises:registry:reconcile -- --dry-run
```

10. Apply reconciliation only after match counts are understood.
11. Run the read-only coverage report:

```bash
pnpm cruises:registry:coverage
pnpm cruises:registry:coverage -- --output data/cruises/registry-coverage-report.json
```

12. Commit the operator batch separately:

```bash
git commit -m "Add verified MSC Cruises registry batch"
```

The registry coverage command is read-only. It reports ACCEPT coverage by operator/group, AIS candidate matching, unmatched candidates, manifest operator status, public-eligible vessel counts, verified vessels with recent AIS positions, verified vessels with daily estimates, and a conservative dashboard-readiness label.

Registry completeness, AIS coverage, and public dashboard coverage are different:

- Registry completeness means the curated IMO registry has enough verified active ships for each operator. Do not claim completeness unless the manifest includes an explicit expected fleet count or other documented completeness evidence.
- AIS geographic coverage means the worker is receiving AIS messages in configured regions or future verified-vessel subscriptions. The current 19 corridor mode is discovery-oriented and does not provide complete global vessel coverage.
- Public dashboard coverage means a ship is both registry-verified and public-eligible, and has enough recent AIS/emissions data for display.

Global cruise tracking requires both:

1. a sufficiently complete verified IMO registry;
2. AIS coverage for verified MMSIs.

Current public claims should remain conservative: use "tracked verified ocean cruises" rather than "all global cruise emissions" until registry completeness and verified-MMSI coverage are proven.

Read-only coverage commands:

```bash
pnpm cruises:registry:coverage
pnpm cruises:registry:completeness
pnpm cruises:registry:completeness -- --operator "MSC Cruises"
pnpm cruises:verified-ais-allowlist
```

Optional JSON outputs:

```bash
pnpm cruises:registry:completeness -- --output data/cruises/registry-completeness-report.json
pnpm cruises:verified-ais-allowlist -- --output data/cruises/verified-ais-allowlist.json
```

The global AIS coverage design lives in `data/cruises/global-ais-coverage-plan.md`. AISStream supports `FiltersShipMMSI` with a documented maximum of 50 MMSI values per subscription, so a future verified-vessel mode must partition verified MMSIs across multiple connections and keep regional corridor discovery separate.

Documentation-only CSV example. This row is fictional, intentionally uses a non-real placeholder identity, and must not be imported:

```csv
imo,canonical_name,operator,operator_group,vessel_segment,registry_decision,active_status,source_name,source_url,source_checked_at,notes
0000000,Fictional Ocean Example,Fictional Cruise Line,Fictional Group,OCEAN_CRUISE,ACCEPT,ACTIVE,Documentation example only,https://example.invalid/not-a-real-source,2026-07-02,DO NOT USE - fictional placeholder row for format documentation only
```

Reconciliation commands:

```bash
pnpm cruises:registry:reconcile -- --dry-run
pnpm cruises:registry:reconcile -- --apply
pnpm cruises:registry:reconcile -- --dry-run --output data/cruises/reconciliation-report.json
```

Review queue export:

```bash
pnpm cruises:export-review-queue -- --output data/cruises/review-queue.csv
```

Do not apply registry imports or reconciliation against Neon production until the registry and migration have been tested on `cruises-dev`.

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
   
 
