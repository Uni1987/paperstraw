# Cruise Coverage & Viability Audit

Generated: 2026-07-02T15:02:20.277Z  
Recent window: 7 day(s)

## Executive Summary

- **acceptedRegistryVessels:** 220
- **verifiedPublicEligibleVessels:** 109
- **registryVesselsWithLinkedMmsi:** 109
- **registryVesselsWithoutLinkedMmsi:** 111
- **verifiedVesselsRecentlySeenInAis:** 109
- **verifiedVesselsWithDailyEmissionsEstimates:** 109
- **currentlyTrackableVerifiedVesselsInHybridMode:** 100
- **currentlyExcludedVerifiedMmsisBecauseOfHybridBatchLimit:** 9
- **candidateVesselsInDiscoveryNotVerified:** 2912
- **readinessStatus:** GLOBAL_COVERAGE_NOT_YET_PROVEN
- **readinessReasons:** Verified subset tracking and estimates exist, but official operator/global fleet denominators are UNKNOWN.

## Claim Safety Matrix

| Claim | Status | Reason | Required evidence |
| --- | --- | --- | --- |
| Tracking a verified subset of ocean cruise ships | SAFE_WITH_QUALIFIER | Verified high-confidence registry matches have recent AIS observations, but coverage is partial. | Keep strict exact-IMO verification and clearly state subset/window limits. |
| Tracking major ocean cruise operators | SAFE_WITH_QUALIFIER | Multiple major operators are represented, but official fleet denominators are incomplete. | Document expected fleet counts and registry completeness per operator. |
| Tracking X% of the global ocean cruise fleet | NOT_YET_SAFE | No authoritative global denominator is recorded in the operator manifest. | Authoritative operator/global fleet denominators and measured coverage calculations. |
| Tracking global cruise ship emissions | NOT_YET_SAFE | Registry/operator completeness and independent emissions-model validation are not yet proven. | High measured coverage, robust AIS availability, MRV/benchmark validation, and scoped public claims. |
| Showing estimated emissions for verified vessels | SAFE_WITH_QUALIFIER | Daily estimates exist for verified vessels, but model validation is still required. | Independent emissions benchmark validation and methodology documentation. |

## Go / No-Go Decision

**Current decision:** CONDITIONAL_GO_FOR_LIMITED_BETA

### Evidence
- 109 verified public-eligible vessels.
- 109 verified vessels have MMSI for tracking.
- 109 verified vessels observed within the selected window.
- 109 verified vessels have daily estimates.

### Blocking Gaps
- Authoritative fleet denominators are not recorded; global percentage claims are unsafe.
- Emission model validation against independent references is still required.
- Current hybrid mode excludes some verified MMSIs because of the practical connection limit.

### Next Highest-Value Actions
- Add authoritative fleet-count evidence to the operator coverage manifest.
- Link missing verified registry entries to MMSIs where authoritative sources allow it.
- Run hybrid with --verified-batch-limit 2 for stable three-connection diagnostics.
- Benchmark daily emissions estimates against independent MRV or operator disclosures.
- Resolve known operator scope gaps before making major-operator or global claims.

## Registry Coverage By Operator

| Operator | Accepted | With MMSI | Recent AIS | Daily estimates | Expected fleet count | Registry coverage |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Royal Caribbean International | 29 | 8 | 8 | 8 | UNKNOWN | UNKNOWN |
| Carnival Cruise Line | 24 | 8 | 8 | 8 | UNKNOWN | UNKNOWN |
| MSC Cruises | 23 | 17 | 17 | 17 | UNKNOWN | UNKNOWN |
| Norwegian Cruise Line | 19 | 8 | 8 | 8 | UNKNOWN | UNKNOWN |
| Princess Cruises | 16 | 7 | 7 | 7 | UNKNOWN | UNKNOWN |
| Celebrity Cruises | 13 | 7 | 7 | 7 | UNKNOWN | UNKNOWN |
| AIDA Cruises | 11 | 11 | 11 | 11 | UNKNOWN | UNKNOWN |
| Holland America Line | 11 | 3 | 3 | 3 | UNKNOWN | UNKNOWN |
| Viking Ocean | 10 | 5 | 5 | 5 | UNKNOWN | UNKNOWN |
| Costa Cruises | 8 | 6 | 6 | 6 | UNKNOWN | UNKNOWN |
| Oceania Cruises | 7 | 7 | 7 | 7 | UNKNOWN | UNKNOWN |
| P&O Cruises | 7 | 6 | 6 | 6 | UNKNOWN | UNKNOWN |
| TUI Cruises / Mein Schiff | 7 | 3 | 3 | 3 | UNKNOWN | UNKNOWN |
| Regent Seven Seas Cruises | 6 | 3 | 3 | 3 | UNKNOWN | UNKNOWN |
| Seabourn | 6 | 1 | 1 | 1 | UNKNOWN | UNKNOWN |
| Disney Cruise Line | 6 | 1 | 1 | 1 | UNKNOWN | UNKNOWN |
| Hapag-Lloyd Cruises | 5 | 2 | 2 | 2 | UNKNOWN | UNKNOWN |
| Cunard | 4 | 2 | 2 | 2 | UNKNOWN | UNKNOWN |
| Virgin Voyages | 4 | 2 | 2 | 2 | UNKNOWN | UNKNOWN |
| Azamara | 4 | 2 | 2 | 2 | UNKNOWN | UNKNOWN |

## Known Unresolved Operators From The Current Internal Scope Review

- **Royal Caribbean International:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Carnival Cruise Line:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **MSC Cruises:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Norwegian Cruise Line:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Princess Cruises:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Celebrity Cruises:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **AIDA Cruises:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Holland America Line:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Viking Ocean:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Costa Cruises:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **P&O Cruises:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Oceania Cruises:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **TUI Cruises / Mein Schiff:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Disney Cruise Line:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Seabourn:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Regent Seven Seas Cruises:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Hapag-Lloyd Cruises:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Virgin Voyages:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Cunard:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Azamara:** INCLUDED_UNKNOWN_FLEET_COUNT. Accepted registry rows exist; official denominator not recorded in this manifest. Next action: research registry inclusion.
- **Silversea:** UNRESOLVED_RESEARCH_REGISTRY_INCLUSION. Known unresolved operator from current scope review; requires curated exact-IMO registry proposal. Next action: research registry inclusion.
- **Explora Journeys:** UNRESOLVED_RESEARCH_REGISTRY_INCLUSION. Known unresolved operator from current scope review; requires curated exact-IMO registry proposal. Next action: research registry inclusion.
- **Windstar:** UNRESOLVED_RESEARCH_REGISTRY_INCLUSION. Known unresolved operator from current scope review; requires curated exact-IMO registry proposal. Next action: research registry inclusion.
- **Ponant:** UNRESOLVED_SCOPE_DECISION_REQUIRED. Known unresolved expedition/ocean operator; scope and exact-IMO registry inclusion require review. Next action: scope decision required.
- **Celestyal:** UNRESOLVED_RESEARCH_REGISTRY_INCLUSION. Known unresolved operator from current scope review; requires curated exact-IMO registry proposal. Next action: research registry inclusion.
- **Fred. Olsen:** UNRESOLVED_RESEARCH_REGISTRY_INCLUSION. Known unresolved operator from current scope review; requires curated exact-IMO registry proposal. Next action: research registry inclusion.
- **Ambassador:** UNRESOLVED_RESEARCH_REGISTRY_INCLUSION. Known unresolved operator from current scope review; requires curated exact-IMO registry proposal. Next action: research registry inclusion.
- **Marella:** UNRESOLVED_RESEARCH_REGISTRY_INCLUSION. Known unresolved operator from current scope review; requires curated exact-IMO registry proposal. Next action: research registry inclusion.
- **HX / Hurtigruten Expeditions:** UNRESOLVED_SCOPE_DECISION_REQUIRED. Known unresolved expedition operator; scope and exact-IMO registry inclusion require review. Next action: scope decision required.
- **Hurtigruten Coastal Express:** UNRESOLVED_SCOPE_DECISION_REQUIRED. Known unresolved mixed coastal operator; scope decision required before inclusion. Next action: scope decision required.
- **river cruise brands:** EXCLUDE_NON_OCEAN_SCOPE. Known out-of-scope category for ocean-cruise launch; do not include without a separate branch decision. Next action: exclude permanently as non-ocean-cruise.
- **ferry-like or mixed operators:** UNRESOLVED_SCOPE_DECISION_REQUIRED. Known review bucket; avoid inclusion unless exact ocean-cruise scope is documented. Next action: exclude permanently as non-ocean-cruise.

## Emissions Data Readiness

- Verified vessels with at least one daily estimate: 109
- Verified vessels with estimates in recent window: 109
- Validation note: Emission model validation against independent references is still required.
