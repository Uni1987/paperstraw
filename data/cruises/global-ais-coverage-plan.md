# Global Verified Cruise AIS Coverage Plan

Generated: 2026-07-02

This plan documents the development hybrid AIS architecture. It does not change registry rules, public eligibility, or database data, and it is not a production deployment plan.

## Current Facts

- Default worker mode: regional corridor subscriptions using `BoundingBoxes`.
- Development modes: `discovery`, `verified-global`, and `hybrid`.
- Current implementation: `lib/cruises/aisstream.ts` sends `APIKey`, `FilterMessageTypes`, and either `BoundingBoxes` for discovery or `FiltersShipMMSI` for verified global batches.
- AISStream official documentation supports optional `FiltersShipMMSI`.
- AISStream official documentation states `FiltersShipMMSI` supports a maximum of 50 MMSI values.
- AISStream documentation also notes that whole-world subscriptions require enough resources to process about 300 messages/second on average.

Source reference: https://aisstream.io/documentation

## Mode A: Discovery / Regional Corridor Mode

How it works:

- Subscribe to configured geographic bounding boxes.
- Receive all AIS messages inside those boxes.
- Filter locally for passenger/cruise-like ships and known candidate records.

Benefits:

- Good for discovering vessels that are not yet in the verified registry.
- Keeps traffic limited to cruise-heavy corridors.
- Implemented and kept as the default mode.

Limitations:

- Coverage is incomplete outside monitored regions.
- It cannot support a public claim of all global cruise traffic.
- Local filtering does not reduce inbound AISStream traffic because messages arrive before PaperStraw filters them.

## Mode B: Global Verified-Vessel Mode

How it works in development:

- Build a registry-derived MMSI allowlist from public-eligible verified ocean cruise ships.
- Subscribe with `FiltersShipMMSI` for verified vessels only.
- Do not use broad unfiltered world bounding boxes.
- Refuse startup if no verified MMSIs are available.

Benefits:

- Minimizes unrelated AIS traffic.
- Focuses database writes on verified public-eligible vessels.
- Better path toward global tracking for known verified cruise ships.

Risks and requirements:

- Requires MMSI values for verified registry-linked ships.
- MMSI values can change or be reassigned; every MMSI must remain linked to an exact verified IMO and be reviewed on conflict.
- AISStream supports a maximum of 50 MMSI values per subscription.
- More than 50 verified MMSIs requires partitioning across multiple connections.
- Provider beta status means subscription limits and behavior should be rechecked before production rollout.

At 220 verified registry entries:

- If every ship had one MMSI, at least `ceil(220 / 50) = 5` AISStream subscriptions/connections would be required.
- Current local verified-MMSI allowlist is smaller because not every registry entry is imported, reconciled, public-eligible, and linked to an MMSI yet.

Ships without MMSI:

- Cannot be globally tracked by MMSI filter yet.
- Must remain in registry as verified IMO records while regional corridor mode continues to discover or refresh AIS identity data.
- Missing-MMSI records should appear in `pnpm cruises:verified-ais-allowlist`.

MMSI changes and conflicts:

- Do not auto-update public verified allowlists from name-only or AIS-only evidence.
- If one MMSI maps to multiple verified IMOs, block that MMSI from global allowlist output and flag it for review.
- If a verified ship changes MMSI, retain the IMO as the source of identity and require a fresh AIS/static-data or external evidence trail before trusting the new MMSI.

## Mode C: Hybrid Mode

How it works in development:

- Keep regional corridor mode for discovery and candidate review.
- Add global verified-vessel mode for verified public-eligible ships with known MMSIs.
- Partition verified MMSIs into batches of 50 per AISStream subscription.
- Continue registry expansion operator-by-operator.
- Reconcile candidates to registry entries using exact IMO matches only.
- If no verified MMSIs are available, continue discovery and log a clear warning.

Benefits:

- Balances global verified coverage with ongoing discovery.
- Avoids subscribing to all world AIS traffic without filters.
- Maintains a path to discover ships missing MMSI or missing registry coverage.
- Keeps public claims conservative and evidence-based.

Recommended production target:

Hybrid mode.

Reason:

- Regional-only is not enough for global public coverage.
- Global whole-world without MMSI filtering is too broad and expensive.
- Global verified-only would miss unlinked verified ships that lack MMSI and would stop discovery.
- Hybrid mode lets PaperStraw say "tracked verified ocean cruises" while avoiding "all cruises worldwide" claims until both registry completeness and verified MMSI coverage are demonstrably high.

## Public Coverage Language

Use:

- tracked verified ocean cruises
- verified cruise vessels with recent AIS positions
- registry coverage in progress
- AIS coverage from monitored regions and verified-vessel subscriptions

Avoid:

- all global cruise emissions
- complete worldwide cruise tracking
- every cruise ship
- live official emissions

## Deployment Partitioning

For local development of hybrid mode:

1. Run `pnpm cruises:verified-ais-allowlist`.
2. Remove conflicting MMSIs from the allowlist until reviewed.
3. Split distinct MMSIs into batches of 50.
4. Run `pnpm cruises:ingest-ais -- --mode hybrid`.
5. Use one long-lived worker process that manages the regional discovery connection plus one verified global WebSocket connection per MMSI batch.
6. Report coverage separately:
   - registry entries
   - public-eligible verified ships
   - public-eligible ships with MMSI
   - active subscriptions required
   - verified ships missing MMSI
   - latest AIS position freshness

## Current Technical Readiness

Hybrid AIS ingestion is implemented for development but is not ready to deploy to production because:

- registry completeness has not been manually reviewed;
- emissions estimation has not been validated for production claims;
- public dashboard copy has not been approved for global verified-vessel coverage;
- registry completeness has not been proven with explicit expected fleet counts;
- current public language must remain conservative.
