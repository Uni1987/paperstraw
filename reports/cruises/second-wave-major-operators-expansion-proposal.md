# Cruise Registry Expansion Proposal: Second-Wave Major Operators

Generated: 2026-07-07  
Branch: `feature/cruises`  
Proposal file: `data/cruises/proposals/second-wave-major-operators-expansion.csv`

This is a proposal-only review artifact. Nothing in this report has been imported into the live registry, no MMSI links were reviewed or applied, no reconcile command was run, and no database data was changed.

## Executive Summary

- Effective accepted registry count in cruises-dev before proposal: 265
- First-wave proposal rows present separately: 45
- Second-wave `READY_FOR_REGISTRY_IMPORT` rows proposed here: 13
- Unresolved items requiring separate review: 3
- Explicit future/not-active exclusions tracked here: 7
- Expected accepted registry size after potential second-wave import: 278
- Verified public-eligible vessels reported by cruises-dev status before proposal: 181

The live CSV `data/cruises/verified-ocean-cruise-registry.csv` still contains 220 accepted rows, but it is not the effective registry baseline. The first-wave proposal has already been imported into the cruises-dev registry database, so this report uses the read-only cruises-dev status baseline of 265 accepted registry entries.

Read-only duplicate check against the second-wave proposal:

| Source checked | ACCEPT rows checked | Duplicate proposal IMOs |
|---|---:|---:|
| Live registry CSV | 220 | 0 |
| First-wave proposal CSV | 45 | 0 |
| Cruises-dev registry database | 265 | 0 |

## Operator Completeness Table

| Operator | Parent group | Official fleet source | Official active fleet count | Current database registry count | First-wave imported count | Second-wave proposed count | Total known coverage after potential import | Missing/unresolved count | Completeness status |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| MSC Cruises | MSC Group | https://www.msccruises.com/cruise/ships | 23 | 23 | 0 | 0 | 23 | 0 | COMPLETE |
| Costa Cruises | Carnival Corporation | https://www.costacruises.com/fleet.html | 9 | 8 | 0 | 1 | 9 | 0 | COMPLETE |
| Princess Cruises | Carnival Corporation | https://www.princess.com/ships-and-experience/ships/ | 17 | 16 | 0 | 1 | 17 | 0 | COMPLETE |
| Norwegian Cruise Line | Norwegian Cruise Line Holdings | https://www.ncl.com/cruise-ship | 21 | 19 | 0 | 2 | 21 | 0 | COMPLETE |
| Royal Caribbean International | Royal Caribbean Group | https://www.royalcaribbean.com/cruise-ships | 29 | 29 | 0 | 0 | 29 | 0 | COMPLETE |
| Celebrity Cruises | Royal Caribbean Group | https://www.celebritycruises.com/cruise-ships | 14 | 13 | 0 | 1 | 14 | 0 | COMPLETE |
| Carnival Cruise Line | Carnival Corporation | https://www.carnival.com/cruise-ships | 29 | 24 | 0 | 5 | 29 | 0 | COMPLETE |
| Disney Cruise Line | Disney | https://disneycruise.disney.go.com/ships/ | 8 | 6 | 0 | 1 | 7 | 1 | PARTIAL |
| Holland America Line | Carnival Corporation | https://www.hollandamerica.com/en/us/cruise-ships | 11 | 11 | 0 | 0 | 11 | 0 | COMPLETE |
| P&O Cruises | Carnival Corporation | https://www.pocruises.com/cruise-ships | 7 | 7 | 0 | 0 | 7 | 0 | COMPLETE |
| AIDA Cruises | Carnival Corporation | https://www.aida.de/kreuzfahrt/schiffe | 11 | 11 | 0 | 0 | 11 | 0 | COMPLETE |
| TUI Cruises / Mein Schiff | Royal Caribbean Group / TUI | https://www.meinschiff.com/schiffe | 8 | 7 | 0 | 1 | 8 | 0 | FUTURE_SHIPS_EXCLUDED |
| Seabourn | Carnival Corporation | https://www.seabourn.com/en/us/cruise-ships | 6 | 6 | 0 | 0 | 6 | 0 | COMPLETE |
| Regent Seven Seas Cruises | Norwegian Cruise Line Holdings | https://www.rssc.com/ships | 6 | 6 | 0 | 0 | 6 | 0 | FUTURE_SHIPS_EXCLUDED |
| Oceania Cruises | Norwegian Cruise Line Holdings | https://www.oceaniacruises.com/ships | 8 | 7 | 0 | 1 | 8 | 0 | COMPLETE |
| Viking Ocean | Viking | https://www.vikingcruises.com/oceans/ships/index.html | Unknown | 10 | 0 | 0 | 10 | 2 | PARTIAL |

Do not calculate coverage percentages where the official denominator is unknown or where the effective registry needs a separate identity audit.

## Proposed Vessel List

| Operator | Vessel | IMO | Segment | Active status | Official fleet source | Independent IMO identity source | Source checked date | Notes |
|---|---|---:|---|---|---|---|---|---|
| Costa Cruises | Costa Pacifica | 9378498 | OCEAN_CRUISE | ACTIVE | https://www.costacruises.com/fleet.html | https://www.vesselfinder.com/vessels/details/9378498 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Princess Cruises | Star Princess | 9863120 | OCEAN_CRUISE | ACTIVE | https://www.princess.com/ships-and-experience/ships/st-star-princess/ | https://www.vesselfinder.com/vessels/details/9863120 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Norwegian Cruise Line | Norwegian Aqua | 9824007 | OCEAN_CRUISE | ACTIVE | https://www.ncl.com/cruise-ships/norwegian-aqua | https://www.vesselfinder.com/vessels/details/9824007 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Norwegian Cruise Line | Norwegian Luna | 9824019 | OCEAN_CRUISE | ACTIVE | https://www.ncl.com/cruise-ships/norwegian-luna | https://www.vesselfinder.com/vessels/details/9824019 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Carnival Cruise Line | Carnival Sunrise | 9138850 | OCEAN_CRUISE | ACTIVE | https://www.carnival.com/cruise-ships/carnival-sunrise | https://www.vesselfinder.com/vessels/details/9138850 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Carnival Cruise Line | Carnival Radiance | 9172648 | OCEAN_CRUISE | ACTIVE | https://www.carnival.com/cruise-ships/carnival-radiance | https://www.vesselfinder.com/vessels/details/9172648 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Carnival Cruise Line | Carnival Luminosa | 9398905 | OCEAN_CRUISE | ACTIVE | https://www.carnival.com/cruise-ships/carnival-luminosa | https://www.vesselfinder.com/vessels/details/9398905 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Carnival Cruise Line | Carnival Adventure | 9192351 | OCEAN_CRUISE | ACTIVE | https://www.carnival.com.au/cruise-ships/carnival-adventure | https://www.vesselfinder.com/vessels/details/9192351 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Carnival Cruise Line | Carnival Encounter | 9192363 | OCEAN_CRUISE | ACTIVE | https://www.carnival.com.au/cruise-ships/carnival-encounter | https://www.vesselfinder.com/vessels/details/9192363 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Celebrity Cruises | Celebrity Xcel | 9838412 | OCEAN_CRUISE | ACTIVE | https://www.celebritycruises.com/cruise-ships/celebrity-xcel | https://www.vesselfinder.com/vessels/details/9838412 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Disney Cruise Line | Disney Adventure | 9808986 | OCEAN_CRUISE | ACTIVE | https://disneycruise.disney.go.com/ships/adventure/ | https://www.vesselfinder.com/vessels/details/9808986 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| TUI Cruises / Mein Schiff | Mein Schiff Relax | 9862657 | OCEAN_CRUISE | ACTIVE | https://www.meinschiff.com/mein-schiff-relax | https://www.vesselfinder.com/vessels/details/9862657 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |
| Oceania Cruises | Allura | 9876969 | OCEAN_CRUISE | ACTIVE | https://www.oceaniacruises.com/ships/allura | https://www.vesselfinder.com/vessels/details/9876969 | 2026-07-07 | READY_FOR_REGISTRY_IMPORT |

## Existing Coverage Overlap

Ships listed below were already present in `data/cruises/verified-ocean-cruise-registry.csv` and were intentionally not duplicated.

- MSC Cruises: MSC Armonia; MSC Bellissima; MSC Divina; MSC Euribia; MSC Fantasia; MSC Grandiosa; MSC Lirica; MSC Magnifica; MSC Meraviglia; MSC Musica; MSC Opera; MSC Orchestra; MSC Poesia; MSC Preziosa; MSC Seascape; MSC Seashore; MSC Seaside; MSC Seaview; MSC Sinfonia; MSC Splendida; MSC Virtuosa; MSC World America; MSC World Europa.
- Costa Cruises: Costa Deliziosa; Costa Diadema; Costa Fascinosa; Costa Favolosa; Costa Fortuna; Costa Serena; Costa Smeralda; Costa Toscana.
- Princess Cruises: Caribbean Princess; Coral Princess; Crown Princess; Diamond Princess; Discovery Princess; Emerald Princess; Enchanted Princess; Grand Princess; Island Princess; Majestic Princess; Regal Princess; Royal Princess; Ruby Princess; Sapphire Princess; Sky Princess; Sun Princess.
- Norwegian Cruise Line: Norwegian Bliss; Norwegian Breakaway; Norwegian Dawn; Norwegian Encore; Norwegian Epic; Norwegian Escape; Norwegian Gem; Norwegian Getaway; Norwegian Jade; Norwegian Jewel; Norwegian Joy; Norwegian Pearl; Norwegian Prima; Norwegian Sky; Norwegian Spirit; Norwegian Star; Norwegian Sun; Norwegian Viva; Pride of America.
- Royal Caribbean International: Adventure of the Seas; Allure of the Seas; Anthem of the Seas; Brilliance of the Seas; Enchantment of the Seas; Explorer of the Seas; Freedom of the Seas; Grandeur of the Seas; Harmony of the Seas; Icon of the Seas; Independence of the Seas; Jewel of the Seas; Liberty of the Seas; Mariner of the Seas; Navigator of the Seas; Oasis of the Seas; Odyssey of the Seas; Ovation of the Seas; Quantum of the Seas; Radiance of the Seas; Rhapsody of the Seas; Serenade of the Seas; Spectrum of the Seas; Star of the Seas; Symphony of the Seas; Utopia of the Seas; Vision of the Seas; Voyager of the Seas; Wonder of the Seas.
- Celebrity Cruises: Celebrity Apex; Celebrity Ascent; Celebrity Beyond; Celebrity Constellation; Celebrity Eclipse; Celebrity Edge; Celebrity Equinox; Celebrity Infinity; Celebrity Millennium; Celebrity Reflection; Celebrity Silhouette; Celebrity Solstice; Celebrity Summit.
- Carnival Cruise Line: Carnival Breeze; Carnival Celebration; Carnival Conquest; Carnival Dream; Carnival Elation; Carnival Firenze; Carnival Freedom; Carnival Glory; Carnival Horizon; Carnival Jubilee; Carnival Legend; Carnival Liberty; Carnival Magic; Carnival Miracle; Carnival Panorama; Carnival Paradise; Carnival Pride; Carnival Spirit; Carnival Splendor; Carnival Sunshine; Carnival Valor; Carnival Venezia; Carnival Vista; Mardi Gras.
- Disney Cruise Line: Disney Dream; Disney Fantasy; Disney Magic; Disney Treasure; Disney Wish; Disney Wonder.
- Holland America Line: Eurodam; Koningsdam; Nieuw Amsterdam; Nieuw Statendam; Noordam; Oosterdam; Rotterdam; Volendam; Westerdam; Zaandam; Zuiderdam.
- P&O Cruises: Arcadia; Arvia; Aurora; Azura; Britannia; Iona; Ventura.
- AIDA Cruises: AIDAbella; AIDAblu; AIDAcosma; AIDAdiva; AIDAluna; AIDAmar; AIDAnova; AIDAperla; AIDAprima; AIDAsol; AIDAstella.
- TUI Cruises / Mein Schiff: Mein Schiff 1; Mein Schiff 2; Mein Schiff 3; Mein Schiff 4; Mein Schiff 5; Mein Schiff 6; Mein Schiff 7.
- Seabourn: Seabourn Encore; Seabourn Ovation; Seabourn Pursuit; Seabourn Quest; Seabourn Sojourn; Seabourn Venture.
- Regent Seven Seas Cruises: Seven Seas Explorer; Seven Seas Grandeur; Seven Seas Mariner; Seven Seas Navigator; Seven Seas Splendor; Seven Seas Voyager.
- Oceania Cruises: Insignia; Marina; Nautica; Regatta; Riviera; Sirena; Vista.
- Viking Ocean: Viking Jupiter; Viking Mars; Viking Neptune; Viking Orion; Viking Saturn; Viking Sea; Viking Sky; Viking Star; Viking Sun; Viking Venus.

No ships from the first-wave proposal overlap with the second-wave target operators.

## Unresolved / Needs Review

| Vessel / operator | Reason unresolved | Missing evidence | Recommended next action |
|---|---|---|---|
| Disney Destiny / Disney Cruise Line | The candidate IMO `9834741` is already present in the effective registry under Disney Treasure. | Separate effective-registry identity audit is needed before adding or correcting Disney Destiny. | Do not add in this proposal; audit Disney Wish-class IMO assignments separately. |
| Viking Vela / Viking Ocean | Active ship appears to be outside current 10-row database coverage but exact IMO source was not strong enough for this proposal. | Independent exact IMO identity source with checksum-confirmed IMO. | Keep unresolved until exact IMO identity is verified from a reliable source. |
| Viking Vesta / Viking Ocean | Active ship appears to be outside current 10-row database coverage but exact IMO source was not strong enough for this proposal. | Independent exact IMO identity source with checksum-confirmed IMO. | Keep unresolved until exact IMO identity is verified from a reliable source. |

## Explicit Exclusions

| Vessel / operator | Classification | Reason |
|---|---|---|
| MSC World Asia / MSC Cruises | FUTURE_NOT_ACTIVE | Future/newbuild ship not yet in active passenger service for this proposal. |
| Legend of the Seas / Royal Caribbean International | FUTURE_NOT_ACTIVE | Future ship not yet active as of this proposal. |
| Carnival Festivale / Carnival Cruise Line | FUTURE_NOT_ACTIVE | Future ship not yet active as of this proposal. |
| Carnival Tropicale / Carnival Cruise Line | FUTURE_NOT_ACTIVE | Future ship not yet active as of this proposal. |
| Disney Believe / Disney Cruise Line | FUTURE_NOT_ACTIVE | Future Disney ship not yet active as of this proposal. |
| Mein Schiff Flow / TUI Cruises | FUTURE_NOT_ACTIVE | Future ship not yet active as of this proposal. |
| Seven Seas Prestige / Regent Seven Seas Cruises | FUTURE_NOT_ACTIVE | Future Regent ship not yet active as of this proposal. |

The proposal also continues to exclude river cruise vessels, ferries, RoPax vessels, transport-first coastal passenger services, sightseeing vessels, private yachts, superyachts, cargo/passenger hybrids, charter-only vessels without clear operator fleet membership, and any vessel already present in the effective registry or first-wave proposal.

## Why The Second-Wave Proposal Contains Only 13 READY Rows

| Operator | Why only this many READY rows were found |
|---|---|
| MSC Cruises | Existing active vessels are already covered by the effective registry; MSC World Asia remains future/not active. |
| Costa Cruises | Existing registry covered eight active vessels; Costa Pacifica was the only missing active fleet member found. |
| Princess Cruises | Existing registry covered 16 active vessels; Star Princess was the only missing active fleet member found. |
| Norwegian Cruise Line | Existing registry covered 19 active vessels; Norwegian Aqua and Norwegian Luna were missing active fleet members. |
| Royal Caribbean International | Existing active vessels are already covered by the effective registry; Legend of the Seas remains future/not active. |
| Celebrity Cruises | Existing registry covered 13 active vessels; Celebrity Xcel was the only missing active fleet member found. |
| Carnival Cruise Line | Existing registry covered 24 active vessels; five missing active vessels were found after Australia fleet integration and renamed/refit ships. |
| Disney Cruise Line | Disney Adventure was a new active fleet member; Disney Destiny remains unresolved due an effective-registry IMO conflict. |
| Holland America Line | Existing active vessels are already covered by the effective registry; no further active vessel found after official fleet comparison. |
| P&O Cruises | Existing active vessels are already covered by the effective registry; no further active vessel found after official fleet comparison. |
| AIDA Cruises | Existing active vessels are already covered by the effective registry; no further active vessel found after official fleet comparison. |
| TUI Cruises / Mein Schiff | Mein Schiff Relax was the only missing active vessel found; Mein Schiff Flow remains future/not active. |
| Seabourn | Existing active vessels are already covered by the effective registry; no further active vessel found after official fleet comparison. |
| Regent Seven Seas Cruises | Existing active vessels are already covered by the effective registry; Seven Seas Prestige remains future/not active. |
| Oceania Cruises | Existing registry covered seven active vessels; Allura was the only missing active fleet member found. |
| Viking Ocean | Recent active ships Viking Vela and Viking Vesta remain unresolved due source gap for exact IMO evidence. |

## Import Readiness

| Classification | Count | Notes |
|---|---:|---|
| READY_FOR_REGISTRY_IMPORT | 13 | Rows in `second-wave-major-operators-expansion.csv`. |
| NEEDS_SOURCE_STRENGTHENING | 2 | Viking Vela and Viking Vesta need stronger exact IMO identity evidence. |
| FUTURE_NOT_ACTIVE | 7 | Explicit future/newbuild exclusions above. |
| ALREADY_IN_REGISTRY | 203 | Existing effective-registry target-operator rows were not duplicated. |
| DUPLICATE_PROPOSAL | 0 | No duplicate IMO rows were found against first-wave or within this proposal. |
| NEEDS_SCOPE_DECISION | 0 | No second-wave target vessel was accepted as expedition-only or scope-borderline. |
| EXCLUDE | 0 | No active commercial ocean-cruise candidate was excluded for non-cruise scope in this wave. |

## Recommended Import Sequence

Import as one full second-wave batch after human review. The 13 READY rows are all normal ocean-cruise fleet additions for already-covered major operators and do not require a separate expedition or coastal-passenger scope decision.

Recommended dry-run command only:

```powershell
pnpm cruises:import-registry -- --file data/cruises/proposals/second-wave-major-operators-expansion.csv --dry-run
```

Do not run `--apply` until the proposal has been reviewed.
