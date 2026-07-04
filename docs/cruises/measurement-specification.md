# Cruise Measurement Specification v0.1

## Purpose

This document defines the agreed methodology and public measurement contract for PaperStraw's future cruise-emissions feature before further dashboard or ingest development.

It is intended to keep product wording, data inclusion rules, emissions estimates, privacy treatment, and public interpretation aligned as the cruise module evolves.

## Scope

### Included

- Verified ocean cruise ships.
- Verified expedition cruise ships.
- Only vessels in the ACCEPT registry.

### Excluded for v0.1

- Ferries.
- River cruises.
- Cargo/passenger hybrids.
- Ordinary pleasure boats.
- Superyachts.
- Yacht support vessels.

### Geographic Scope

PaperStraw's cruise feature may use worldwide AISStream observations, subject to source availability and observation gaps.

This does not mean complete worldwide coverage. It means PaperStraw may observe verified vessels wherever AISStream provides relevant messages and PaperStraw is able to receive, validate, and store them.

### Time Scope

Cruise-emissions reporting should be framed as:

"Since PaperStraw monitoring began."

Data must not be framed as historical calendar-year emissions unless historical data is later independently acquired and documented in a revised methodology.

## Inclusion Rules

A vessel may be included in public cruise-emissions reporting only when all of the following are true:

- It has an ACCEPT registry entry.
- Its IMO is checksum-valid.
- Its identity is confirmed through an exact IMO/MMSI relationship under existing strict verification rules.
- Its position data passes validity checks.

Names, operators, vessel type, dimensions, destination, country code, fuzzy matching, and heuristics cannot establish eligibility.

These fields may support human review, documentation, or investigation, but they must not create public eligibility on their own.

## Observation Coverage

"Observed" means PaperStraw received at least one valid AIS message for a verified vessel in the stated period.

Coverage is measured per vessel and per reporting window. For example, a ship may be well observed during one day, partially observed during a week, and not observed during another period.

Rankings and comparisons must include an observation-coverage indicator.

Low-observation vessels must not be treated as directly comparable to highly observed vessels. When coverage is sparse, public copy should make clear that the result reflects observed activity, not complete vessel activity.

## Gap Treatment

PaperStraw v0.1 does not invent emissions during long AIS gaps.

PaperStraw v0.1 does not interpolate missing routes.

Longer gaps are marked as unobserved. Weekly and monthly estimates must be described as estimates from observed activity.

Future interpolation may be introduced only after separate validation and an explicit methodology revision.

## Emissions Method

Cruise emissions are modelled CO₂ estimates. They are not measured exhaust output and they are not actual fuel consumption.

Inputs may include:

- Distance.
- Speed.
- Vessel category.
- Technical assumptions.
- Hotel-load assumptions.

Estimates are calculated only for verified vessels with valid stored positions.

Other pollutants must not be shown until separately validated.

Independent benchmarking against MRV, operator reports, or other credible references is still required before PaperStraw makes stronger public claims about cruise emissions accuracy.

## Uncertainty Labels

PaperStraw should use uncertainty labels to communicate data quality and modelling confidence.

### High

Strong observation coverage and vessel-specific or model inputs are available.

### Medium

Adequate observation coverage exists, but the estimate depends on meaningful assumptions or contains notable gaps.

### Low

Observation coverage is sparse, or the estimate depends on generic technical assumptions.

### No Estimate

There is insufficient data to produce a responsible estimate.

These labels are methodology targets and may not yet be fully implemented in the dashboard.

## Data Retention

- Raw verified cruise positions: retain 90 days initially.
- Daily, weekly, and monthly aggregates: retain permanently.
- Unknown-vessel AIS messages: never store.
- Static-data review candidates: retain until reviewed or dismissed.

## Public Map Delay

Public cruise map positions are not delayed.

PaperStraw may show the latest verified cruise-vessel positions available from stored AIS observations.

This policy applies only to verified ocean and expedition cruise ships included under this specification.

Any future superyacht scope requires a stricter privacy review and likely a longer delay.

## Public Wording

Approved wording:

"Estimated CO₂ emissions from verified ocean cruise ships observed by PaperStraw since monitoring began."

Avoid wording such as:

- "Global cruise emissions"
- "All cruise ships"
- "Actual fuel consumption"
- "Real-time exact vessel tracking"
- "Worldwide complete coverage"

## Current Limitations

- Coverage is observation-based and not yet proven complete.
- AISStream availability and reception gaps can affect data.
- The emissions model still needs independent validation.
- The current registry and MMSI linkage set is growing.
- This document is version 0.1 and should be updated when interpolation, superyachts, historical data, or validated emissions factors are introduced.

## Change Control

Any change to scope, eligibility, gap treatment, emissions assumptions, map delay, or public wording must be documented in a new version of this specification before implementation.
