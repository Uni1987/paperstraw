# Yacht Dataset Feasibility Analysis

## Executive summary

Current assessment: **viable only after metadata enrichment**.

The existing AIS/cruise dataset contains 3,150 unique candidate vessel identities after deduplication. It includes 1 high-confidence yacht candidates, 0 probable yacht candidates, 1,448 uncertain candidates, and 1,701 likely false positives.

Existing CO2 values are reused from the cruise emissions estimate table only as a feasibility signal. They should not be presented as validated yacht emissions without a yacht-specific method review.

## Data sources inspected

| Source | Fields used |
| --- | --- |
| cruise_ships | id, IMO, MMSI, name, operator, ship_type, gross_tonnage, length, width, source |
| cruise_positions | position counts, first/latest observation, active days |
| cruise_emissions_daily_estimates | total estimated CO2 and latest available month CO2 |
| cruise_emissions_annual | row count and MRV availability context |
| cruise_vessel_verifications | known cruise verification status/confidence |
| cruise_vessel_registry_entries | known accepted/excluded cruise registry context |

Rows inspected: {"cruiseShips":3150,"cruisePositions":343423,"cruiseEmissionsDailyEstimates":6231,"cruiseEmissionsAnnual":0,"cruiseVesselVerifications":3150,"cruiseVesselRegistryEntries":316}.

## Candidate population

| Classification | Count |
| --- | ---: |
| VERIFIED_YACHT | 1 |
| PROBABLE_YACHT | 0 |
| UNCERTAIN | 1448 |
| LIKELY_FALSE_POSITIVE | 1701 |
| Total | 3150 |

## AIS type distribution

| Column 1 | Column 2 | Column 3 | Column 4 | Column 5 |
| --- | --- | --- | --- | --- |
| Passenger ship | Passenger ship | 2555 | 81.1% | 2176 |
| 60 | Passenger | 245 | 7.8% | 205 |
| 69 | Passenger | 196 | 6.2% | 169 |
| Ocean cruise ship | Ocean cruise ship | 129 | 4.1% | 0 |
| 61 | Passenger | 9 | 0.3% | 9 |
| 65 | Passenger | 4 | 0.1% | 4 |
| 0 | AIS type 0 | 3 | 0.1% | 2 |
| 62 | Passenger | 2 | 0.1% | 2 |
| 63 | Passenger | 2 | 0.1% | 2 |
| 67 | Passenger | 2 | 0.1% | 2 |
| 51 | AIS type 51 | 1 | 0% | 1 |
| 66 | Passenger | 1 | 0% | 1 |

## Size coverage

- Reliable length >= 24 m: 1899
- Reliable length >= 40 m: 1154
- Reliable length >= 80 m: 695
- Reliable or plausible length >= 24 m: 1900
- Reliable or plausible length >= 40 m: 1154
- Reliable or plausible length >= 80 m: 695

## Metadata quality

- Reliable dimensions: 2573
- Plausible but unverified dimensions: 2
- Missing dimensions: 191
- Implausible dimensions: 384
- Reliable-dimension percentage: 81.7%

Identity summary: 3150 raw vessel records, 3150 unique identities, 0 duplicates merged, 0 conflicting metadata identities.

## Highest-emitting candidates

| Column 1 | Column 2 | Column 3 | Column 4 | Column 5 |
| --- | --- | --- | --- | --- |
| ARVIA | LIKELY_FALSE_POSITIVE | 2,233.1 | Passenger ship | 344 |
| MEIN SCHIFF 1 | LIKELY_FALSE_POSITIVE | 2,085.1 | Passenger ship | 316 |
| CELEBRITY APEX | LIKELY_FALSE_POSITIVE | 1,954 | Passenger ship | 306 |
| NIEUW STATENDAM | LIKELY_FALSE_POSITIVE | 1,908.2 | Passenger ship | 299 |
| AIDAPERLA | LIKELY_FALSE_POSITIVE | 1,897.1 | Passenger ship | 300 |
| MSC EURIBIA | LIKELY_FALSE_POSITIVE | 1,890.6 | Passenger ship | 332 |
| CARNIVAL FIRENZE | LIKELY_FALSE_POSITIVE | 1,816.9 | Passenger ship | 324 |
| EUROPA 2 | LIKELY_FALSE_POSITIVE | 1,803.5 | Passenger ship | 226 |
| ARCADIA | LIKELY_FALSE_POSITIVE | 1,785.5 | Passenger ship | 285 |
| MSC WORLD EUROPA | LIKELY_FALSE_POSITIVE | 1,720.8 | Passenger ship | 333 |

## False positives and uncertainty

Likely false positives are primarily vessels already verified as cruise ships, commercial passenger/cruise-scale vessels, service vessels, or records with implausible or sub-24 m dimensions. Uncertain records generally lack explicit yacht metadata or reliable dimensions.

## Methodological limitations

- The current dataset was collected through the cruise/AIS pipeline, not a yacht-specific registry.
- Existing daily CO2 estimates were calibrated for cruise monitoring and are not validated yacht emissions estimates.
- AIS type alone is not sufficient for yacht identification.
- Unknown and Other AIS types are retained separately in the CSV outputs.
- Name-only identity matching is not used except as a last-resort analytical fallback when no IMO, MMSI, or internal id exists.

## Recommended Yacht MVP filter

Recommended first-release filter before any public Yacht dashboard:

- Require IMO or MMSI.
- Require reliable length and width.
- Require length >= 24 m.
- Include VERIFIED_YACHT and manually approved PROBABLE_YACHT only.
- Exclude known cruise ships, ferries, cargo, tankers, fishing, tugs, pilot/service vessels, military/law-enforcement, and sub-24 m craft.
- Do not publish yacht CO2 totals until yacht-specific emissions assumptions are reviewed.

## Recommended next step

Manually verify the candidate list first, then enrich metadata and define yacht-specific emissions factors. Do not build a public Yacht dashboard from the current dataset without that verification pass.
