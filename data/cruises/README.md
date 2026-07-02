# Cruise Registry Data

`verified-ocean-cruise-registry.csv` is a manually maintained verification source for PaperStraw's cruise module.

The file may contain both `ACCEPT` and `EXCLUDE` decisions, but every row must be supported by documented provenance. Do not add vessels from memory, name guesses, AIS passenger codes, dimensions, MRV passenger classification, or generic "cruise" text alone.

Required columns:

```csv
imo,canonical_name,operator,operator_group,vessel_segment,registry_decision,active_status,source_name,source_url,source_checked_at,notes
```

Accepted enum values:

- `vessel_segment`: `OCEAN_CRUISE`, `EXPEDITION_CRUISE`
- `registry_decision`: `ACCEPT`, `EXCLUDE`
- `active_status`: `ACTIVE`, `RETIRED`, `UNKNOWN`

For `ACCEPT` rows, the provenance standard is:

- exact seven-digit IMO;
- explicit source name;
- source URL;
- checked date in `YYYY-MM-DD` format;
- evidence that the vessel is an ocean-going leisure cruise ship or overnight expedition cruise ship.

`EXCLUDE` rows are useful for known ferries, RoPax vessels, river vessels, high-speed craft, yachts, water taxis, or other out-of-scope passenger vessels that appear in AIS candidate intake.

Generated review exports such as `review-queue.csv` should not be committed.
