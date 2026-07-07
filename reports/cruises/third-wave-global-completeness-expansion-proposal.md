# Global Cruise Registry Completeness Program: Third Wave

Generated: 2026-07-07  
Branch: `feature/cruises`  
Proposal file: `data/cruises/proposals/third-wave-global-completeness-expansion.csv`

This is a proposal-only audit artifact. No registry rows were imported, no MMSI links were applied, no reconcile command was run, no AIS worker was started, and no database data was changed.

## Executive Summary

- Effective accepted registry baseline in cruises-dev before this proposal: 278
- Approved MMSI-linked / public-eligible vessels reported by cruises-dev status: 186
- Verified vessels observed in the last 7 days: 141
- Third-wave `READY_FOR_REGISTRY_IMPORT` rows proposed here: 38
- Expected accepted registry size after potential third-wave import: 316
- Unresolved or source-strengthening items tracked in the inventory: 17
- Explicit scope/future exclusions tracked in the inventory: 27
- Current public-launch readiness assessment: not ready for a near-complete global coverage claim.

The current registry is strong for major mainstream ocean operators but still incomplete for expedition, small luxury, yacht-style commercial cruise, and charter-heavy operators. The third wave is deliberately conservative: only vessels with checksum-valid IMOs, official operator evidence, independent identity evidence, and no duplicate against the live CSV or cruises-dev registry are included.

## Coverage Dashboard

| Metric | Value | Basis |
|---|---:|---|
| Accepted registry count | 278 | `pnpm cruises:registry:status` against cruises-dev |
| Approved MMSI-linked vessels | 186 | `pnpm cruises:global-local-filter:status` |
| Verified vessels observed in last 7 days | 141 | `pnpm cruises:global-local-filter:status` |
| Documented operator denominator | 318 | Sum of inventory rows with source-backed numeric fleet counts |
| Current registry rows within documented denominator | 268 | Inventory rows with numeric denominators only |
| Current documented registry coverage | 84.3% | 268 / 318 |
| Third-wave READY rows | 38 | Validated proposal CSV |
| Expected accepted registry after potential import | 316 | 278 baseline + 38 READY rows |
| Potential documented registry coverage after import | 96.2% | 306 / 318 for inventory rows with numeric denominators |
| Duplicate proposal IMOs in live CSV | 0 | Read-only proposal duplicate check |
| Duplicate proposal IMOs in cruises-dev database | 0 | Read-only proposal duplicate check |

Documented registry coverage is calculated only from operator inventory rows with source-backed official fleet counts. It is not a global completeness claim because several target operators still have unresolved denominators or scope decisions.

## Operator Completeness Table

| Operator | Official active fleet count | Current effective registry count | Prior wave count | Third-wave additions | Total after potential import | Missing / unresolved count | Status | Next action |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Royal Caribbean International | 29 | 29 | 0 | 0 | 29 | 0 | COMPLETE | Continue MMSI linkage. |
| Carnival Cruise Line | 29 | 29 | 5 | 0 | 29 | 0 | COMPLETE | Continue MMSI linkage. |
| MSC Cruises | 23 | 23 | 0 | 0 | 23 | 0 | COMPLETE | Monitor future fleet changes. |
| Norwegian Cruise Line | 21 | 21 | 2 | 0 | 21 | 0 | COMPLETE | Continue MMSI linkage. |
| Princess Cruises | 17 | 17 | 1 | 0 | 17 | 0 | COMPLETE | Continue MMSI linkage. |
| Celebrity Cruises | 14 | 14 | 1 | 0 | 14 | 0 | COMPLETE | Continue MMSI linkage. |
| Silversea | 12 | 12 | 12 | 0 | 12 | 0 | COMPLETE | Review MMSI candidates. |
| Ponant | 11 | 11 | 11 | 0 | 11 | 0 | COMPLETE | Review MMSI candidates; keep partner vessels separate. |
| Disney Cruise Line | 8 | 7 | 1 | 0 | 7 | 1 | PARTIAL | Resolve Disney Destiny identity conflict separately. |
| Viking Ocean | Unknown | 10 | 0 | 0 | 10 | 2 | PARTIAL | Strengthen exact IMO evidence for Vela / Vesta. |
| HX / Hurtigruten Expeditions | 4 | 0 | 0 | 4 | 4 | 1 | PARTIAL | Review Santa Cruz II partnership scope separately. |
| Swan Hellenic | 3 | 0 | 0 | 3 | 3 | 0 | PARTIAL | Review/import Tier 1 rows. |
| Aurora Expeditions | 3 | 0 | 0 | 3 | 3 | 0 | PARTIAL | Review/import Tier 1 rows. |
| Atlas Ocean Voyages | 3 | 0 | 0 | 3 | 3 | 2 | PARTIAL | Keep future/transferred Mystic vessels separate. |
| Scenic Luxury Cruises & Tours | 2 | 0 | 0 | 2 | 2 | 0 | PARTIAL | Review/import Tier 1 rows. |
| Emerald Cruises | 2 | 0 | 0 | 2 | 2 | 0 | PARTIAL | Review/import Tier 1 rows. |
| Crystal | 2 | 0 | 0 | 2 | 2 | 0 | PARTIAL | Review/import Tier 1 rows. |
| SeaDream Yacht Club | 2 | 0 | 0 | 2 | 2 | 0 | PARTIAL | Import-ready with yacht-style commercial cruise scope note. |
| The Ritz-Carlton Yacht Collection | 3 | 0 | 0 | 2 | 2 | 1 | PARTIAL | Strengthen Luminara exact IMO evidence. |
| Paul Gauguin Cruises | 1 | 0 | 0 | 1 | 1 | 0 | PARTIAL | Review/import Tier 1 row. |
| Coral Expeditions | 3 | 0 | 0 | 3 | 3 | 0 | PARTIAL | Review/import Tier 1 rows. |
| Heritage Expeditions | 2 | 0 | 0 | 1 | 1 | 1 | PARTIAL | Resolve Heritage Explorer / future Heritage Discoverer scope. |
| Albatros Expeditions | 2 | 0 | 0 | 2 | 2 | 0 | PARTIAL | Review/import Tier 1 rows. |
| Quark Expeditions | 4 | 0 | 0 | 2 | 2 | 2 | PARTIAL | Resolve charter/operator attribution. |
| Lindblad Expeditions / National Geographic | 12 | 0 | 0 | 6 | 6 | 6 | PARTIAL | Resolve small coastal and Galapagos scope. |

The complete operator inventory is maintained in `data/cruises/global-operator-coverage-inventory.csv`.

## Proposed Vessel List

| Operator | Vessel count | Segment | Evidence summary |
|---|---:|---|---|
| HX / Hurtigruten Expeditions | 4 | EXPEDITION_CRUISE | Official HX ships page plus VesselFinder exact IMO pages. |
| Swan Hellenic | 3 | EXPEDITION_CRUISE | Official Swan Hellenic ships page plus VesselFinder exact IMO pages. |
| Aurora Expeditions | 3 | EXPEDITION_CRUISE | Official Aurora ships page plus VesselFinder exact IMO pages. |
| Atlas Ocean Voyages | 3 | EXPEDITION_CRUISE | Official Atlas ships page plus VesselFinder exact IMO pages. |
| Scenic Luxury Cruises & Tours | 2 | EXPEDITION_CRUISE | Official Scenic ocean ships page plus VesselFinder exact IMO pages. |
| Emerald Cruises | 2 | OCEAN_CRUISE | Official Emerald yachts page plus VesselFinder exact IMO pages. |
| Crystal | 2 | OCEAN_CRUISE | Official Crystal ships page plus VesselFinder exact IMO pages. |
| SeaDream Yacht Club | 2 | OCEAN_CRUISE | Official SeaDream yachts page plus VesselFinder exact IMO pages; yacht-style scope to review. |
| The Ritz-Carlton Yacht Collection | 2 | OCEAN_CRUISE | Official Ritz-Carlton yachts page plus VesselFinder exact IMO pages. |
| Paul Gauguin Cruises | 1 | OCEAN_CRUISE | Official Paul Gauguin ship page plus VesselFinder exact IMO page. |
| Coral Expeditions | 3 | EXPEDITION_CRUISE | Official Coral ships page plus VesselFinder exact IMO pages. |
| Heritage Expeditions | 1 | EXPEDITION_CRUISE | Official Heritage ships page plus VesselFinder exact IMO page. |
| Albatros Expeditions | 2 | EXPEDITION_CRUISE | Official Albatros ships page plus VesselFinder exact IMO pages. |
| Quark Expeditions | 2 | EXPEDITION_CRUISE | Official Quark ships page plus VesselFinder exact IMO pages. |
| Lindblad Expeditions / National Geographic | 6 | EXPEDITION_CRUISE | Official Lindblad expedition ships page plus VesselFinder exact IMO pages. |

Every row in the CSV has `registry_decision=ACCEPT`, `active_status=ACTIVE`, a source checked date of 2026-07-07, and notes containing `proposal-only READY_FOR_REGISTRY_IMPORT`.

## Unresolved And Scope Decisions

| Operator / bucket | Recommendation | Reason |
|---|---|---|
| HX / Hurtigruten Expeditions Santa Cruz II partnership | RESEARCH_MORE | Exact operator control and fleet-membership scope should be documented separately. |
| Lindblad / National Geographic small Galapagos and coastal vessels | SCOPE_DECISION_REQUIRED | Some vessels are small coastal or Galapagos products; include only after a small-vessel policy decision. |
| SeaDream Yacht Club | INCLUDE with scope note | Scheduled commercial cruise product but yacht-style branding should be acknowledged during review. |
| The Ritz-Carlton Yacht Collection Luminara | RESEARCH_MORE | Active-service evidence exists but exact IMO evidence was not strong enough for this batch. |
| Four Seasons Yachts | RESEARCH_MORE | Include only after active passenger service and exact IMO identity are verified. |
| Aqua Expeditions ocean-going vessels | RESEARCH_MORE | Potentially in scope but vessel-level exact IMO and scheduled ocean-cruise evidence need strengthening. |
| Adventure Canada | RESEARCH_MORE | Charter-heavy model requires exact current vessel identity before registry rows. |
| Poseidon Expeditions Sea Spirit | RESEARCH_MORE | Candidate appears in scope but exact IMO evidence was not accepted in this pass. |
| Quark chartered World Voyager / World Explorer | SCOPE_DECISION_REQUIRED | Operator attribution and future transfer status must be resolved before inclusion. |
| Heritage Explorer / Heritage Discoverer | SCOPE_DECISION_REQUIRED | Heritage Explorer is very small; Heritage Discoverer is future/not active. |
| Hurtigruten Coastal Express | EXCLUDE | Transport-first coastal service remains outside launch scope. |
| River cruise brands | EXCLUDE | Out of ocean-cruise launch scope. |
| Ferry-like passenger operators | EXCLUDE | Transport-first passenger services remain out of scope. |

## Operators That Block Public-Launch Completeness

- Disney Cruise Line: unresolved Disney Destiny identity conflict.
- Viking Ocean: recent vessels need stronger exact IMO evidence.
- Lindblad / National Geographic: denominator is known but only larger expedition vessels are ready; smaller/coastal/Galapagos scope remains undecided.
- Quark Expeditions: chartered vessels need operator-attribution policy.
- Ritz-Carlton Yacht Collection: Luminara requires stronger exact IMO evidence.
- Aqua Expeditions / Adventure Canada / Poseidon: source strengthening required before READY rows.
- Any operator with low MMSI linkage after import: registry coverage alone is insufficient for public dashboard coverage.

## Recommended Import Sequence

Tier 1: immediately import-ready after human review:

- HX / Hurtigruten Expeditions
- Swan Hellenic
- Aurora Expeditions
- Atlas Ocean Voyages
- Scenic Luxury Cruises & Tours
- Emerald Cruises
- Crystal
- SeaDream Yacht Club
- The Ritz-Carlton Yacht Collection Evrima and Ilma
- Paul Gauguin Cruises
- Coral Expeditions
- Heritage Adventurer
- Albatros Expeditions
- Quark Ultramarine and Ocean Explorer
- Lindblad larger expedition ships

Tier 2: source strengthening required:

- Ritz-Carlton Luminara
- Viking Vela / Vesta
- Poseidon Sea Spirit
- Aqua Expeditions ocean-going vessels
- Adventure Canada current charter vessels

Tier 3: policy decision required:

- Lindblad small coastal and Galapagos vessels
- Heritage Explorer
- Quark chartered/transfer vessels
- Any transport-first coastal service

## Go-Live Readiness Roadmap

1. Review/import Tier 1 registry rows.
2. Let Railway collect AIS static data.
3. Review and apply MMSI candidates.
4. Measure 30-day observation coverage.
5. Resolve Tier 2 operator gaps.
6. Decide Tier 3 scope.
7. Build/verify public methodology and coverage disclosure.
8. Release limited beta.
9. Reassess public launch threshold.

## Validation Snapshot

Read-only checks completed for this proposal:

- `pnpm cruises:validate-registry -- --file data/cruises/proposals/third-wave-global-completeness-expansion.csv`
- `$env:CRUISE_WORKER_DATABASE_TARGET='cruises-dev'; pnpm cruises:check-registry-proposal -- --file data/cruises/proposals/third-wave-global-completeness-expansion.csv`

The duplicate check reported 38 proposal ACCEPT rows, 0 duplicates in the live registry CSV, 0 duplicates in first-wave proposal rows, 0 duplicates in the cruises-dev database, and 0 database writes attempted.
