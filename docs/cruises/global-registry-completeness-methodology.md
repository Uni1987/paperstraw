# Global Cruise Registry Completeness Methodology

PaperStraw's cruise registry is intentionally stricter than raw AIS passenger-vessel discovery. A ship can appear in public cruise statistics only after exact IMO-based registry review and MMSI linkage review. This document defines how PaperStraw measures progress toward defensible global cruise coverage without overstating what the dataset can support.

## Scope Definition

`Commercial ocean cruise` means an active passenger vessel marketed and operated as an overnight leisure cruise product on ocean or sea itineraries, with a stable IMO identity and an operator source that presents the vessel as part of the current fleet.

`Expedition cruise` means an active commercial passenger vessel marketed and operated for overnight expedition cruise itineraries in polar, remote, island, coastal-wilderness, or nature-focused regions, where the voyage is sold as a cruise product rather than as public transport.

`Small luxury commercial cruise` means a small-ship or yacht-style vessel that is sold by a commercial cruise operator on scheduled cruise itineraries, carries paying passengers, has a stable IMO identity, and is not merely a private charter yacht.

Excluded mixed passenger/coastal services include ferries, RoPax vessels, cruise-ferries, coastal express or public transport-first services, excursion boats, day-trip boats, water taxis, sightseeing vessels, private yachts, yacht-support vessels, cargo/passenger hybrids, and vessels that are retired, laid up, sold away, renamed away, scrapped, or not yet active in passenger service.

## Evidence Standard

A vessel is `READY_FOR_REGISTRY_IMPORT` only when all of the following are documented:

- Official operator source confirming current fleet membership.
- Independent exact IMO identity source proving the seven-digit IMO belongs to the named vessel.
- Active passenger-service evidence, either from the operator's current fleet/ship page or a reliable active-service source.
- Valid seven-digit IMO checksum.
- No duplicate against the current cruises-dev registry, the live registry CSV, or prior proposal/import files.
- Documented source checked date.

Rows must not be accepted from name-only matching, fuzzy matching, AIS passenger type, operator name, dimensions, destination strings, or third-party fleet aggregators alone.

## Coverage Measurement

PaperStraw uses separate coverage metrics because each measures a different layer of certainty:

- Registry coverage: accepted registry entries divided by documented active in-scope fleet denominator.
- MMSI linkage coverage: approved linked vessels divided by accepted registry entries.
- AIS observation coverage: vessels observed in 7 days and 30 days divided by approved linked vessels.
- Emissions coverage: vessels with usable daily estimate data divided by observed vessels.

Never call any one of these "global coverage" without naming which layer is being measured. A high registry count does not imply high AIS observation coverage, and a recent AIS observation does not imply full-year emissions coverage.

## Publication Readiness Thresholds

These thresholds are recommendations for internal planning, not current coverage claims.

### Internal Preview

- Registry baseline is reproducible from the live CSV plus imported proposal waves and cruises-dev status.
- All public outputs remain gated to exact-IMO accepted registry entries with approved MMSI links.
- Coverage and methodology disclaimers are visible to reviewers.
- No unresolved high-risk identity conflicts are exposed publicly.

### Limited Public Beta

- 80%+ registry coverage across documented high-volume in-scope operators.
- 70%+ approved MMSI linkage across accepted registry entries.
- 60%+ linked fleet observed at least once over 30 days.
- Major unresolved operators are explicitly listed in the methodology or data page.
- Public copy avoids "complete global coverage" and "official real-time emissions" claims.

### Public Launch

- 90%+ registry coverage across documented in-scope operators.
- 85%+ approved MMSI linkage across accepted registry entries.
- 75%+ linked fleet observed at least once over 30 days.
- No unresolved high-volume major operator.
- Methodology page and coverage disclaimer are visible.

### Near-Complete Global Coverage Claim

- 95%+ documented registry coverage.
- 90%+ approved MMSI linkage.
- 85%+ linked fleet observed over 30 days.
- Every included operator has a source-backed fleet denominator or explicitly documented `UNKNOWN` status.
- Expedition, yacht-style, and mixed coastal edge cases have explicit scope decisions.

## Read-Only Audit Commands

Use these commands to refresh the baseline without mutating registry data:

```powershell
pnpm cruises:registry:status
pnpm cruises:registry:completeness
pnpm cruises:global-local-filter:status
$env:CRUISE_WORKER_DATABASE_TARGET='cruises-dev'; pnpm cruises:check-registry-proposal -- --file data/cruises/proposals/third-wave-global-completeness-expansion.csv
pnpm cruises:validate-registry -- --file data/cruises/proposals/third-wave-global-completeness-expansion.csv
```

Do not run import, reconcile, review-apply, or ingest commands as part of proposal review.
