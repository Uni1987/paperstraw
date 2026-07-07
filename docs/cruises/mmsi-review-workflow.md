# Cruise MMSI Candidate Review Workflow

This workflow is for `feature/cruises` and `cruises-dev` only.

The global-local-filter worker may discover exact accepted-registry IMO matches through AIS `ShipStaticData`. Those records are stored in `cruise_static_data_review_queue` for human review. They are never auto-linked.

## Why Candidates Are Not Auto-Linked

An AIS static-data message can provide a useful MMSI candidate, but PaperStraw still requires an explicit operator-controlled decision before adding that MMSI to an existing verified cruise identity record.

The queue is evidence for review, not approval.

PaperStraw does not:

- auto-link MMSIs from AIS static data;
- auto-run registry reconciliation after queue discoveries;
- use vessel names, operators, dimensions, or AIS type as verification proof;
- expose raw AIS payloads through this workflow.

## Safety Requirements

Mutating commands require:

- `CRUISE_WORKER_ENV=development` or `CRUISE_WORKER_ENV=railway-development`
- `CRUISE_WORKER_DATABASE_TARGET=cruises-dev`

Production mutation is intentionally blocked for now.

## List Pending Candidates

Default output is anonymized and hides MMSI, IMO, vessel names, and operators.

```bash
pnpm cruises:review-mmsi-candidates
```

Optional filters:

```bash
pnpm cruises:review-mmsi-candidates -- --status pending --limit 25
pnpm cruises:review-mmsi-candidates -- --status all --format markdown --output reports/cruises/mmsi-review.md
```

## Inspect With Identifiers

Use identifiers only when you are actively reviewing a candidate.

```bash
pnpm cruises:review-mmsi-candidates -- --include-identifiers --limit 10
```

This shows only review fields needed for a decision:

- queue record id;
- registry vessel name;
- registry operator;
- exact registry IMO;
- observed MMSI;
- first/last seen timestamps;
- occurrence count;
- classification;
- current review status;
- linked-MMSI/conflict indicators.

It never shows raw AIS payloads.

## Approve A Candidate

Approval marks a queue record as reviewed. It does not link the MMSI.

```bash
pnpm cruises:review-mmsi-candidates -- --approve QUEUE_RECORD_ID --note "Reviewed exact IMO evidence and approved MMSI link for dry-run apply."
```

Approval is refused unless:

- the queue classification is `NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY`;
- the queue record is pending;
- the registry entry is an exact valid IMO `ACCEPT`;
- the observed MMSI is valid;
- the observed MMSI is not linked elsewhere;
- no unresolved conflict exists.

## Dismiss A Candidate

Dismissal changes only the review queue record.

```bash
pnpm cruises:review-mmsi-candidates -- --dismiss QUEUE_RECORD_ID --note "Rejected after manual source review."
```

Dismissal never changes registry, candidate, verification, or cruise ship data.

## Dry-Run Approved Candidates

Dry-run is the default if neither `--dry-run` nor `--confirm` is supplied.

```bash
pnpm cruises:review-mmsi-candidates -- --apply-approved --dry-run
```

This reports which approved records would be applied and which would be skipped.

## Confirm Apply

Only run this after reviewing and approving candidates one by one.

```bash
pnpm cruises:review-mmsi-candidates -- --apply-approved --confirm
```

Confirmed apply:

- applies only approved eligible queue records;
- updates only the MMSI on the existing exact-registry cruise identity record;
- uses a transaction per queue item;
- skips pending, dismissed, already-applied, conflicting, or stale records;
- updates the queue note with an applied marker;
- does not alter registry decisions;
- does not run full reconciliation.

## Post-Apply Reconciliation

After a confirmed apply, run only a dry-run reconciliation:

```bash
pnpm cruises:registry:reconcile -- --dry-run
```

Do not use:

```bash
pnpm cruises:registry:reconcile -- --apply
```

as a substitute for MMSI review. Queue approval and MMSI application are a separate deliberate workflow.

## Placeholder Example

```bash
pnpm cruises:review-mmsi-candidates -- --include-identifiers --limit 1
pnpm cruises:review-mmsi-candidates -- --approve QUEUE_RECORD_ID --note "PLACEHOLDER: reviewed official evidence."
pnpm cruises:review-mmsi-candidates -- --apply-approved --dry-run
pnpm cruises:review-mmsi-candidates -- --apply-approved --confirm
pnpm cruises:registry:reconcile -- --dry-run
```

`QUEUE_RECORD_ID` is a placeholder. Do not use an example id from documentation.

## Audit Trail

The review queue preserves:

- first and last observed timestamps;
- occurrence count;
- review status;
- approval or dismissal note;
- review timestamp;
- applied marker when a confirmed apply succeeds.

No raw AIS payloads are stored or displayed by this review command.
