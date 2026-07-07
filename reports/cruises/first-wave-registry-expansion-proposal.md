# Cruise Registry Expansion Proposal: First-Wave Operators

Generated: 2026-07-07  
Branch: `feature/cruises`  
Proposal file: `data/cruises/proposals/first-wave-operator-expansion.csv`

This is a read-only registry expansion proposal. It does not import rows into the live registry, does not reconcile MMSI links, does not change public eligibility rules, and does not modify cruise ingestion behavior.

## Summary

- Current accepted live registry entries before this proposal: 220
- Proposed `READY_FOR_REGISTRY_IMPORT` rows in this first-wave file: 45
- Operators with complete proposal coverage from official fleet pages: 5
- Operators with partial proposal coverage pending active-status or scope review: 3
- Operators kept unresolved for explicit policy decision: 2
- Unresolved or excluded review items tracked in this report: 14

Every proposed `ACCEPT` row has:

- an official operator or fleet source supporting fleet membership;
- a separate vessel identity URL supporting the exact IMO identity;
- a valid seven-digit IMO format and checksum;
- a source checked date;
- proposal-only notes that mark the row as `READY_FOR_REGISTRY_IMPORT`.

## Operator Completeness

| Operator | Parent group | Official source | Official fleet count used | Proposed rows | Status |
|---|---:|---|---:|---:|---|
| Silversea | Royal Caribbean Group | https://www.silversea.com/ships.html | 12 | 12 | Complete proposal |
| Explora Journeys | MSC Group | https://explorajourneys.com/int/en/ships | Not fixed because page includes future ships | 2 | Partial: future ships excluded |
| Windstar Cruises | Windstar Cruises | https://www.windstarcruises.com/ships/ | Not fixed because page includes future/new ships | 7 | Partial: Star Explorer excluded as future |
| Ponant | Artemis Group | https://en.ponant.com/cruise-ships | Not fixed because page includes yacht-like and partner vessels | 11 | Partial: scope review remains |
| Fred. Olsen Cruise Lines | Fred. Olsen Group | https://www.fredolsencruises.com/our-ships | 3 | 3 | Complete proposal |
| Marella Cruises | TUI Group | https://www.tui.co.uk/cruise/ships/ | 5 | 5 | Complete proposal |
| Ambassador Cruise Line | Ambassador Cruise Line | https://www.ambassadorcruiseline.com/our-ships/ | 3 | 3 | Complete proposal |
| Celestyal | Celestyal Cruises | https://celestyal.com/us/our-ships/ | 2 | 2 | Complete proposal |
| HX / Hurtigruten Expeditions | Hurtigruten Group | https://www.travelhx.com/ | Not applied | 0 | Scope decision required |
| Hurtigruten Coastal Express | Hurtigruten Group | https://www.hurtigruten.com/ | Not applied | 0 | Recommended exclusion as transport-first coastal service |

## Proposed Vessels

| Operator | Ship | IMO | Segment | Official fleet source | IMO identity source |
|---|---|---:|---|---|---|
| Silversea | Silver Cloud | 8903923 | EXPEDITION_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/8903923 |
| Silversea | Silver Wind | 8903935 | EXPEDITION_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/8903935 |
| Silversea | Silver Shadow | 9192167 | OCEAN_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9192167 |
| Silversea | Silver Whisper | 9192179 | OCEAN_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9192179 |
| Silversea | Silver Spirit | 9437866 | OCEAN_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9437866 |
| Silversea | Silver Muse | 9784350 | OCEAN_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9784350 |
| Silversea | Silver Moon | 9838618 | OCEAN_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9838618 |
| Silversea | Silver Dawn | 9857937 | OCEAN_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9857937 |
| Silversea | Silver Nova | 9826990 | OCEAN_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9826990 |
| Silversea | Silver Ray | 9827009 | OCEAN_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9827009 |
| Silversea | Silver Origin | 9837937 | EXPEDITION_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9837937 |
| Silversea | Silver Endeavour | 9821873 | EXPEDITION_CRUISE | https://www.silversea.com/ships.html | https://www.vesselfinder.com/vessels/details/9821873 |
| Explora Journeys | Explora I | 9869875 | OCEAN_CRUISE | https://explorajourneys.com/int/en/ships | https://www.vesselfinder.com/vessels/details/9869875 |
| Explora Journeys | Explora II | 9869887 | OCEAN_CRUISE | https://explorajourneys.com/int/en/ships | https://www.vesselfinder.com/vessels/details/9869887 |
| Windstar Cruises | Wind Star | 8420878 | OCEAN_CRUISE | https://www.windstarcruises.com/ships/ | https://www.vesselfinder.com/vessels/details/8420878 |
| Windstar Cruises | Wind Spirit | 8603509 | OCEAN_CRUISE | https://www.windstarcruises.com/ships/ | https://www.vesselfinder.com/vessels/details/8603509 |
| Windstar Cruises | Wind Surf | 8700785 | OCEAN_CRUISE | https://www.windstarcruises.com/ships/ | https://www.vesselfinder.com/vessels/details/8700785 |
| Windstar Cruises | Star Pride | 8707343 | OCEAN_CRUISE | https://www.windstarcruises.com/ships/ | https://www.vesselfinder.com/vessels/details/8707343 |
| Windstar Cruises | Star Legend | 9008598 | OCEAN_CRUISE | https://www.windstarcruises.com/ships/ | https://www.vesselfinder.com/vessels/details/9008598 |
| Windstar Cruises | Star Breeze | 8807997 | OCEAN_CRUISE | https://www.windstarcruises.com/ships/ | https://www.vesselfinder.com/vessels/details/8807997 |
| Windstar Cruises | Star Seeker | 9904819 | OCEAN_CRUISE | https://www.windstarcruises.com/ships/star-seeker/ | https://www.vesselfinder.com/vessels/details/9904819 |
| Ponant | Le Boreal | 9502506 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9502506 |
| Ponant | L'Austral | 9502518 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9502518 |
| Ponant | Le Soleal | 9641675 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9641675 |
| Ponant | Le Lyrial | 9701968 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9701968 |
| Ponant | Le Laperouse | 9814026 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9814026 |
| Ponant | Le Champlain | 9814038 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9814038 |
| Ponant | Le Bougainville | 9814040 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9814040 |
| Ponant | Le Dumont d'Urville | 9814052 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9814052 |
| Ponant | Le Bellot | 9852406 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9852406 |
| Ponant | Le Jacques Cartier | 9852418 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9852418 |
| Ponant | Le Commandant Charcot | 9846249 | EXPEDITION_CRUISE | https://en.ponant.com/cruise-ships | https://www.vesselfinder.com/vessels/details/9846249 |
| Fred. Olsen Cruise Lines | Balmoral | 8506294 | OCEAN_CRUISE | https://www.fredolsencruises.com/our-ships | https://www.vesselfinder.com/vessels/details/8506294 |
| Fred. Olsen Cruise Lines | Borealis | 9122552 | OCEAN_CRUISE | https://www.fredolsencruises.com/our-ships | https://www.vesselfinder.com/vessels/details/9122552 |
| Fred. Olsen Cruise Lines | Bolette | 9188037 | OCEAN_CRUISE | https://www.fredolsencruises.com/our-ships | https://www.vesselfinder.com/vessels/details/9188037 |
| Marella Cruises | Marella Discovery | 9070632 | OCEAN_CRUISE | https://www.tui.co.uk/cruise/ships/ | https://www.vesselfinder.com/vessels/details/9070632 |
| Marella Cruises | Marella Discovery 2 | 9070620 | OCEAN_CRUISE | https://www.tui.co.uk/cruise/ships/ | https://www.vesselfinder.com/vessels/details/9070620 |
| Marella Cruises | Marella Explorer | 9106297 | OCEAN_CRUISE | https://www.tui.co.uk/cruise/ships/ | https://www.vesselfinder.com/vessels/details/9106297 |
| Marella Cruises | Marella Explorer 2 | 9072446 | OCEAN_CRUISE | https://www.tui.co.uk/cruise/ships/ | https://www.vesselfinder.com/vessels/details/9072446 |
| Marella Cruises | Marella Voyager | 9106302 | OCEAN_CRUISE | https://www.tui.co.uk/cruise/ships/ | https://www.vesselfinder.com/vessels/details/9106302 |
| Ambassador Cruise Line | Ambience | 8521232 | OCEAN_CRUISE | https://www.ambassadorcruiseline.com/our-ships/ | https://www.vesselfinder.com/vessels/details/8521232 |
| Ambassador Cruise Line | Ambition | 9172777 | OCEAN_CRUISE | https://www.ambassadorcruiseline.com/our-ships/ | https://www.vesselfinder.com/vessels/details/9172777 |
| Ambassador Cruise Line | Renaissance | 8919257 | OCEAN_CRUISE | https://www.ambassadorcruiseline.com/our-ships/ | https://www.vesselfinder.com/vessels/details/8919257 |
| Celestyal | Celestyal Journey | 8919269 | OCEAN_CRUISE | https://celestyal.com/us/our-ships/ | https://www.vesselfinder.com/vessels/details/8919269 |
| Celestyal | Celestyal Discovery | 9221566 | OCEAN_CRUISE | https://celestyal.com/us/our-ships/ | https://www.vesselfinder.com/vessels/details/9221566 |

## Unresolved Or Needs Review

These were intentionally not added to the proposal CSV.

| Item | Operator | Reason |
|---|---|---|
| Explora III | Explora Journeys | Launch is scheduled for 24 July 2026; this proposal only accepts already-active vessels. |
| Explora IV | Explora Journeys | Future fleet name; not added in this first-wave active proposal. |
| Explora V | Explora Journeys | Future fleet name; not added in this first-wave active proposal. |
| Explora VI | Explora Journeys | Future fleet name; not added in this first-wave active proposal. |
| Star Explorer | Windstar Cruises | Official source says first season begins December 2026; this proposal only accepts already-active vessels. |
| Le Ponant | Ponant | Yacht-like sailing vessel; keep out of first-wave import pending scope decision. |
| Spirit of Ponant | Ponant | Yacht-like/small sailing product; keep out of first-wave import pending scope decision. |
| Paul Gauguin | Ponant / Paul Gauguin Cruises | Partner or separately branded vessel; requires separate operator and scope review. |
| Aqua Expeditions vessels | Ponant / Aqua Expeditions | Partner fleet; outside this first-wave Ponant operator proposal. |
| MS Roald Amundsen | HX / Hurtigruten Expeditions | Expedition scope decision required before inclusion. |
| MS Fridtjof Nansen | HX / Hurtigruten Expeditions | Expedition scope decision required before inclusion. |
| MS Fram | HX / Hurtigruten Expeditions | Expedition scope decision required before inclusion. |
| MS Spitsbergen | HX / Hurtigruten Expeditions | Expedition scope decision required before inclusion. |
| Hurtigruten Coastal Express fleet | Hurtigruten Coastal Express | Recommended exclusion as transport-first coastal passenger service unless a later policy branch expands scope. |

## Exclusions

The proposal intentionally excludes:

- river cruise brands;
- ferries and RoPax vessels;
- transport-first coastal passenger services;
- excursion vessels and water taxis;
- private yachts;
- future ships without confirmed active service status;
- partner or separately branded vessels that require their own operator-scope review.

## HX / Hurtigruten Recommendation

Recommended decision:

- `HX / Hurtigruten Expeditions`: keep unresolved pending an explicit expedition-cruise scope decision. Do not import in this first-wave proposal.
- `Hurtigruten Coastal Express`: recommend exclusion as a transport-first coastal passenger service. Do not import in this first-wave proposal unless PaperStraw later adopts a separate mixed coastal passenger policy.

This keeps the strict ocean-cruise registry rule intact and avoids silently mixing expedition leisure ships with transport-first coastal operations.

## Import Readiness

The proposal CSV is structurally ready for dry-run validation.

Before any live registry import, a maintainer should:

1. Review every row in `data/cruises/proposals/first-wave-operator-expansion.csv`.
2. Confirm the official fleet source still supports active fleet membership.
3. Confirm the vessel identity source still supports the exact IMO.
4. Decide whether to import the entire proposal or split by operator.
5. Run the registry import in `--dry-run` mode first.
6. Do not run any apply/import/reconcile command until review is complete.

## Next Actions

1. Validate the proposal file:

   ```powershell
   pnpm cruises:validate-registry -- --file data/cruises/proposals/first-wave-operator-expansion.csv
   ```

2. Optional future dry-run only:

   ```powershell
   pnpm cruises:import-registry -- --file data/cruises/proposals/first-wave-operator-expansion.csv --dry-run
   ```

3. Keep HX and Hurtigruten Coastal Express out of the import until their scope decision is explicit.

No database writes were performed to create this proposal.
