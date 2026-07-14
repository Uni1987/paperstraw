# Cruise Global-Local-Filter Railway Worker

This document describes how to run the PaperStraw cruise AIS worker as a long-running Railway background worker.

The deployed application now lives on `main`. The worker still uses the deliberately restrictive `railway-development` environment name and `cruises-dev` logical database target. Those values are safety boundaries, not a statement that the command is unsuitable for Railway.

## Purpose

The global-local-filter worker opens one full-world AISStream WebSocket and locally filters the feed to verified ocean cruise vessels only.

It stores:

- verified cruise positions for vessels that already have strict public-eligible MMSI links;
- exact IMO `ShipStaticData` discoveries in the internal review queue;
- daily cruise emission estimates for verified vessels with stored positions.

It does not:

- auto-link MMSIs;
- auto-apply registry reconciliation;
- publish unverified candidate vessels;
- change registry decisions;
- run any private-jet ingestion;
- write to Neon production.

## Intended Branch And Service

- Git branch: `main`
- Railway service: `cruise-global-local-filter-worker`
- Database target: `cruises-dev`
- Worker command:

```bash
pnpm cruises:ingest-global-local-filter -- --allow-long-run
```

## Railway Environment Variables

Set these names in Railway. Do not paste values into logs, tickets, screenshots, or documentation.

Required:

- `CRUISES_DATABASE_URL`
- `AISSTREAM_API_KEY`
- `CRUISE_WORKER_ENV`
- `CRUISE_WORKER_DATABASE_TARGET`

Optional but recommended for this Railway worker:

- `CRUISE_WORKER_PROFILE`

Recommended development values:

- `CRUISE_WORKER_ENV=railway-development`
- `CRUISE_WORKER_DATABASE_TARGET=cruises-dev`
- `CRUISE_WORKER_PROFILE=railway`

The worker refuses to start when `CRUISE_WORKER_ENV` is missing. In `railway-development` mode it also refuses to start unless `CRUISE_WORKER_DATABASE_TARGET` is exactly `cruises-dev` and the command includes `--allow-long-run`.

Production mode is blocked unless a separate future override variable is explicitly set. Do not enable that override for the current Railway service.

## Architecture

The Railway development worker uses:

- exactly one AISStream WebSocket;
- the full-world AISStream bounding box;
- `PositionReport` and `ShipStaticData` messages;
- no `FiltersShipMMSI`;
- local strict verification checks before writing positions.

The worker stores only minimal verified position fields. It does not store raw global AIS payloads for non-verified vessels.

## Expected Resource Profile

Read-only global-feed benchmarks peaked at roughly 79-81 MB RSS. The write-enabled worker also carries Prisma and bounded write/dedupe state, so an initial operational expectation is approximately 100-256 MB RSS under normal traffic. This is a monitoring range, not a resource guarantee; actual Railway use depends on AISStream traffic, verified vessel activity, database latency, and reconnect behavior.

Expected operational shape:

- one WebSocket connection;
- roughly full-world AIS inbound traffic;
- most AIS messages discarded after local verification checks;
- bounded position batches;
- a 256-message in-flight processing ceiling;
- a 50,000-key, 24-hour position dedupe cache;
- a configured-size, 24-hour static-review dedupe cache;
- periodic status logs;
- detailed memory snapshots every five minutes;
- daily estimate updates only for verified vessels touched by stored positions.

Local benchmark projections should be treated as linear estimates from the observed test window, not billing predictions.

## Inbound Traffic

The worker receives all AIS messages matching the full-world subscription before PaperStraw filters for verified cruises. Local filtering reduces database writes, but it does not reduce inbound AISStream traffic.

Wider feed coverage can increase:

- network traffic;
- JSON parsing work;
- CPU usage;
- memory pressure;
- database writes for verified vessels;
- hosting cost.

Do not treat this worker as production-ready until longer Railway soak tests confirm resource behavior.

## Health Verification

Use Railway logs to confirm sanitized startup lines similar to:

```text
global-local-filter startup safety | workerEnv=railway-development | databaseTarget=cruises-dev | profile=railway
```

Healthy interval logs should include:

- `mode=global-local-filter`
- `connected=true`
- `messagesReceived`
- `verifiedPositionMatches`
- `positionsStored`
- `batchFlushes`
- `databaseWriteFailures=0`
- `queueWriteFailures=0`
- `status=HEALTHY`

Every five minutes, a separate `global-local-filter memory` line reports:

- `rssMB`, `heapUsedMB`, `heapTotalMB`, and `externalMB`;
- pending message and position counts;
- position and static-review dedupe cache sizes;
- touched ship/day count.

The cache and concurrency limits protect the process during a slow database period. If the in-flight ceiling is reached, the worker records `messagesDroppedBackpressure` and reports `BACKPRESSURE_RISK` instead of retaining messages without limit.

## Out-Of-Memory Response

If Railway reports an OOM warning:

1. Check whether RSS or heap grows monotonically across at least six five-minute memory snapshots.
2. Check `pendingMessages`, `pendingPositions`, both dedupe-key counts, `messagesDroppedBackpressure`, and `backlogObserved`.
3. Confirm only one AIS worker is using the key and that reconnect count is stable.
4. Run the read-only health commands below and check database latency/failures.
5. Restart the service only after capturing the final memory and health lines.
6. Increase Railway memory only after confirming the bounded counters are stable; a steadily growing bounded counter indicates a separate leak that should be investigated first.

The logs must not include API keys, database URLs, MMSIs, IMOs, or vessel names.

## Confirm The Database Target

The worker logs only the logical database target:

```text
databaseTarget=cruises-dev
```

It does not infer or print Neon branch names from `CRUISES_DATABASE_URL`. Confirm in Railway that the `CRUISES_DATABASE_URL` secret points to the `cruises-dev` Neon branch before starting the service.

Never point this development worker at Neon production.

## Safe Stop

Stop the Railway service from the Railway dashboard.

On `SIGTERM`, the worker should:

- stop accepting new AIS messages;
- close the WebSocket;
- flush pending verified position batches;
- finish pending review queue writes;
- finish in-flight daily estimate writes;
- disconnect Prisma through the process shutdown path;
- print a sanitized final summary.

Shutdown is bounded so the process does not wait forever.

## Local Inspection Commands

Inspect worker status locally:

```bash
pnpm cruises:ops-summary
pnpm cruises:global-local-filter:status -- --since-hours 1
```

Inspect registry status locally:

```bash
pnpm cruises:registry:status
```

Dry-run registry reconciliation only:

```bash
pnpm cruises:registry:reconcile -- --dry-run
```

Do not run reconciliation with `--apply` as part of Railway worker testing.

## Review Queue

Exact accepted-registry IMO discoveries from `ShipStaticData` are stored in the review queue for later human review. They do not automatically update MMSI links or public eligibility.

Use local read-only review/status scripts to inspect queue counts. Avoid logging vessel identities in shared output.

## Credential Rotation

To rotate AISStream credentials:

1. Stop the Railway worker.
2. Replace `AISSTREAM_API_KEY` in Railway variables.
3. Redeploy or restart the worker.
4. Confirm logs show a successful sanitized startup.

Never paste the old or new key into logs, screenshots, or commits.

## Safety Checklist

Before starting Railway:

- Branch is `main`.
- Service is `cruise-global-local-filter-worker`.
- `CRUISE_WORKER_ENV=railway-development`.
- `CRUISE_WORKER_DATABASE_TARGET=cruises-dev`.
- `CRUISE_WORKER_PROFILE=railway`.
- `CRUISES_DATABASE_URL` points to `cruises-dev`, not production.
- No other AISStream worker is running with the same key unless intentionally tested.
- No registry reconcile `--apply` command is running.
