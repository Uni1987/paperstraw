# Private Jets Daily Historical Ingestion

PaperStraw treats complete ADSB.lol archive days as the canonical Private Jets ingestion source. The recent cursor/snapshot importer remains available as an explicit CLI compatibility tool, but it is not used by the production cron or normal admin workflow.

## Execution Architecture

Historical archive work runs in GitHub Actions. Vercel does not download or scan archives:

1. Vercel Cron calls `GET /api/cron/ingest` with `Authorization: Bearer CRON_SECRET`.
2. The endpoint calculates the previous completed UTC calendar day.
3. Existing `ProcessedArchiveDate` state atomically prevents duplicate queued/running work and skips successful days.
4. The endpoint dispatches `.github/workflows/private-jets-historical-ingest.yml` and returns `202 queued`.
5. GitHub Actions runs the same `runHistoricalImportJob` implementation used by the CLI.
6. Per-date state and one structured `ImportLog` job record expose queued, running, success, partial, failed, and skipped outcomes in `/admin/private-jets`.

This architecture is deliberate. A daily release consists of large split tar assets, and the current annual rollup rebuild reads the selected year of Private Jets flights. That work does not have reliable serverless-request headroom. The workflow runner has a six-hour timeout and the Vercel request performs only short validation, database claiming, and dispatch work.

## Automatic Schedule

`vercel.json` runs the protected dispatcher once daily:

```cron
0 6 * * *
```

The schedule is 06:00 UTC. It requests exactly yesterday in UTC (`from = yesterday`, `to = yesterday`) and never imports the current partial UTC day. The six-hour delay after midnight gives the upstream daily release time to appear. Normal scheduled runs never force reprocessing.

If the archive is unavailable, the date remains partial and retryable. A date is not marked successful until import and required aggregate-rollup rebuilding both finish.

## Admin Workflow

Open `/admin/private-jets` with the existing Basic Auth credentials. The Historical data import form accepts:

- From date, inclusive (`YYYY-MM-DD`)
- To date, inclusive (`YYYY-MM-DD`)
- Force reprocess, off by default

Only completed UTC days are accepted. Manual requests are limited to 31 inclusive days. Successfully imported days are skipped unless force is explicitly selected. The form dispatches the workflow and immediately reports the queued job ID; refresh the admin page to see its final status.

Force mode keeps duplicate-flight protection. Existing matching flights are not inserted again; supported airport attribution fields are updated, then rollups are rebuilt.

## CLI Compatibility

The CLI uses the same job runner:

```powershell
pnpm ingest:historical --from 2026-07-05 --to 2026-07-11
pnpm ingest:historical --from 2026-07-05 --to 2026-07-11 --force
```

CLI ranges remain inclusive. `--reprocess` remains an alias for `--force`.

## Required Environment Variables

Vercel:

- `PRIVATE_JETS_DATABASE_URL`
- `CRON_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `GITHUB_ACTIONS_TOKEN`
- `GITHUB_ACTIONS_REPOSITORY` (`owner/repository`)
- `GITHUB_ACTIONS_REF` (the deployed branch/ref containing the workflow)
- `GITHUB_ACTIONS_WORKFLOW` (optional; defaults to `private-jets-historical-ingest.yml`)

GitHub Actions repository secrets:

- `PRIVATE_JETS_DATABASE_URL`
- `ADSB_LOL_GITHUB_TOKEN` (optional; the workflow otherwise uses its read-only repository token for GitHub API requests)

`GITHUB_TOKEN` remains optional for ADSB.lol public GitHub release API access. Historical ingestion refuses to use the Cruise database and does not silently use `DATABASE_URL`; `PRIVATE_JETS_DATABASE_URL` is required.

The dispatch token should have the least privilege needed to trigger Actions workflows in this repository. Never expose token or database values in client-side code or logs.

## Retry Procedure

1. Open `/admin/private-jets` and identify the failed or partial UTC date.
2. Confirm the upstream ADSB.lol release now exists and review the concise error.
3. Submit that date again without Force. Failed and partial dates are retryable.
4. Use Force only when deliberately rescanning a date already marked successful.
5. Confirm the date becomes success and the job shows imported/skipped/failed counts plus fetched/imported records.

Queued or running claims older than six hours are treated as stale and may be retried. This matches the workflow timeout and prevents permanent lockout after a runner failure.

## Local PowerShell Verification

Use a non-production Private Jets database:

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

Unauthorized cron check:

```powershell
try {
  Invoke-WebRequest "http://localhost:3000/api/cron/ingest" -UseBasicParsing
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected: `401`.

Cron authentication is accepted only through `Authorization: Bearer <CRON_SECRET>`. Query-string credentials and
`x-cron-secret` are rejected so the secret cannot leak through URLs or access logs.

Direct `/api/ingest` mutations are POST-only. The dedicated `/api/cron/ingest` endpoint retains authenticated GET because
Vercel Cron invokes scheduled paths with GET; it requires the Bearer token again inside the route before dispatching work.

Authorized scheduled dispatch:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3000/api/cron/ingest" `
  -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

Expected: `202`, source `scheduled`, timezone `UTC`, and identical yesterday values for `from` and `to`; or `200 skipped` when that date is already successful.

For a direct safe CLI check, choose one completed date in the non-production database. Run it twice without Force and confirm the second run skips. Test Force only on the non-production database. Check `ProcessedArchiveDate`, `ImportLog`, `Flight`, and `AggregateRollup`, then confirm the Cruise database received no writes.

## Production Verification

- Vercel Cron lists `/api/cron/ingest` at `0 6 * * *`.
- Vercel logs show a short `queued` or `skipped` dispatcher response, not archive processing.
- GitHub Actions shows the corresponding Private Jets historical ingest run.
- `/admin/private-jets` shows execution source, requested range, status, date counts, records, timestamps, and workflow link.
- The processed date is successful only after rollups finish.
- Public pages show the latest successful historical import freshness.
