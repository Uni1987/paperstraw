# Global AISStream Coverage Audit

Generated: 2026-07-03T06:28:19.179Z

## Executive Summary

- Verdict: **STRONG_SIGNAL_FOR_GLOBAL_LOCAL_FILTER**
- Accepted registry vessels: 220
- Linked MMSI vessels: 109
- Unlinked registry vessels: 111
- Verified MMSIs observed: 48
- Exact registry IMO static matches: 39
- New MMSI candidates: 5
- Conflict count: 0
- Combined observed registry coverage: 25%
- Label: Observed during this audit window, not global fleet completeness.

## Subscription

| Metric | Value |
| --- | --- |
| WebSocket connections | 1 |
| Bounding boxes | 1 |
| Uses exact global bounding box | true |
| Coordinate order | [latitude, longitude] |
| MMSI filter | false |
| Message types | PositionReport, ShipStaticData |

## Feed Health

| Metric | Value |
| --- | ---: |
| Total messages | 62710 |
| Average messages/sec | 104.5 |
| Peak one-second rate | 139 |
| PositionReport messages | 53154 |
| ShipStaticData messages | 9556 |
| Malformed messages | 0 |
| No usable MMSI | 55 |
| No usable IMO | 4628 |

## Static Data Enrichment

| Metric | Value |
| --- | ---: |
| Checksum-valid IMO values seen | 4928 |
| Exact accepted-registry IMO matches | 39 |
| Distinct accepted registry IMOs via static data | 30 |
| Already linked confirmations | 34 |
| New MMSI candidates | 5 |
| Conflicts requiring review | 0 |
| Accepted registry entries unseen in static data | 190 |

## Resources

| Metric | Value |
| --- | ---: |
| Inbound bytes | 35061188 |
| Inbound MB | 33.4 |
| Average / peak KB/sec | 57.1 / 76.1 |
| Projected GB/day | 4.7 |
| Projected GB/30-day month | 141.1 |
| Process CPU average / peak % | 1.6 / 3.6 |
| RSS start/peak/end MB | 67.4 / 80.9 / 77.1 |
| Heap used start/peak/end MB | 12.3 / 15.8 / 15 |
| Event-loop mean/p95/max ms | 26.9 / 32.5 / 36.5 |
| Backlog observed | false |

## Safety

| Metric | Value |
| --- | ---: |
| Non-verified position messages discarded | 53021 |
| Non-registry static messages discarded | 9517 |
| Database writes attempted | 0 |
| Database writes completed | 0 |
| Raw payload retention | false |
| Unsafe matching used | false |

## Caveats

- This audit is read-only and does not prove all registry ships are reachable.
- Static-data matches are evidence for later review, not automatic identity updates.
- Coverage is observed during this audit window, not global fleet completeness.
