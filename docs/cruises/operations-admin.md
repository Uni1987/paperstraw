# Cruise operations admin

PaperStraw includes an internal cruise operations dashboard for the `feature/cruises` development workflow.

Route:

```text
/admin/cruises
```

The route is protected by the existing PaperStraw admin Basic Auth middleware. Configure:

```text
ADMIN_USERNAME
ADMIN_PASSWORD
```

## Purpose

The dashboard is for operating the cruise `global-local-filter` workflow against the development cruise database. It shows:

- latest verified cruise position timestamp and age;
- verified position and vessel counts for the last 24 hours;
- accepted registry entries and public-eligible vessel ratios;
- 24h, 7d and 30d observation coverage;
- pending MMSI review candidates and conflicts;
- read-only applied-link repair-needed count;
- alert state for stale data, pending reviews, conflicts, low coverage and repair needs.

## Mutation safety

Read-only dashboard viewing does not require cruise worker mutation env vars.

Review actions that mutate `cruises-dev` require the existing guarded environment:

```text
CRUISE_WORKER_ENV=development
CRUISE_WORKER_DATABASE_TARGET=cruises-dev
```

Railway development may use:

```text
CRUISE_WORKER_ENV=railway-development
CRUISE_WORKER_DATABASE_TARGET=cruises-dev
```

Do not use Neon production for this workflow.

## Safe actions

The dashboard can approve a pending MMSI candidate only when the same CLI safety rules pass:

- classification is `NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY`;
- registry IMO exists and is valid;
- registry entry has no linked MMSI;
- observed MMSI is not linked elsewhere;
- no unresolved conflict exists;
- review status is `PENDING`.

The approval note is:

```text
Exact IMO static-data match; no existing MMSI link or conflict.
```

The dashboard also supports:

```text
Apply approved dry-run
Apply approved confirm
```

Dry-run is the default. Confirm requires an explicit browser confirmation and the guarded `cruises-dev` environment variables above.

The dashboard does not:

- auto-approve MMSIs;
- run broad registry reconcile apply;
- run imports;
- start workers;
- change private-jet data or flows.

## API endpoints

```text
GET  /api/admin/cruises/status
POST /api/admin/cruises/mmsi-candidates/:id/approve
POST /api/admin/cruises/mmsi-candidates/apply-approved
```

`apply-approved` defaults to dry-run unless the JSON body contains:

```json
{ "confirm": true }
```

## Railway daily summary foundation

A read-only summary command is available for future Railway scheduled jobs:

```powershell
pnpm cruises:ops-summary
```

It prints:

- accepted registry entries;
- verified public-eligible vessels;
- public-eligible ratio;
- observed 24h, 7d and 30d counts;
- pending candidates;
- pending conflicts;
- repair-needed count;
- latest position timestamp and age;
- alert state.

It performs zero database writes.

Future Railway scheduled command:

```text
pnpm cruises:ops-summary
```

Use the same Railway service environment as the development cruise worker, but do not point it at Neon production.
