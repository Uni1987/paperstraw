# Global Cruise Registry Coverage Summary

Generated: 2026-07-02

This is a proposal summary for `data/cruises/verified-ocean-cruise-registry.csv`. It describes CSV proposal coverage only. It does not mean the rows have been imported, reconciled, or exposed publicly.

| Operator | Active vessels researched | Vessels accepted | Vessels unresolved | Vessels excluded by scope | Proposal coverage |
|---|---:|---:|---:|---:|---:|
| Royal Caribbean International | 29 | 29 | 0 | 0 | 100% |
| Celebrity Cruises | 13 | 13 | 0 | 0 | 100% |
| Silversea Cruises | 0 | 0 | Unknown | 0 | 0% |
| Carnival Cruise Line | 24 | 24 | 0 | 0 | 100% |
| Princess Cruises | 16 | 16 | 0 | 0 | 100% |
| Holland America Line | 11 | 11 | 0 | 0 | 100% |
| Cunard | 4 | 4 | 0 | 0 | 100% |
| Costa Cruises | 8 | 8 | 0 | 0 | 100% |
| AIDA Cruises | 11 | 11 | 0 | 0 | 100% |
| P&O Cruises | 7 | 7 | 0 | 0 | 100% |
| Seabourn | 6 | 6 | 0 | 0 | 100% |
| Norwegian Cruise Line | 19 | 19 | 0 | 0 | 100% |
| Oceania Cruises | 7 | 7 | 0 | 0 | 100% |
| Regent Seven Seas Cruises | 6 | 6 | 0 | 0 | 100% |
| MSC Cruises | 23 | 23 | 0 | 0 | 100% |
| Disney Cruise Line | 6 | 6 | 0 | 0 | 100% |
| Viking Ocean | 10 | 10 | 0 | 0 | 100% |
| Virgin Voyages | 4 | 4 | 0 | 0 | 100% |
| Explora Journeys | 0 | 0 | Unknown | 0 | 0% |
| Azamara | 4 | 4 | 0 | 0 | 100% |
| Windstar Cruises | 0 | 0 | Unknown | 0 | 0% |
| Ponant | 0 | 0 | Unknown | 0 | 0% |
| Celestyal Cruises | 0 | 0 | Unknown | 0 | 0% |
| Fred. Olsen Cruise Lines | 0 | 0 | Unknown | 0 | 0% |
| Ambassador Cruise Line | 0 | 0 | Unknown | 0 | 0% |
| Marella Cruises | 0 | 0 | Unknown | 0 | 0% |
| TUI Cruises / Mein Schiff | 7 | 7 | 0 | 0 | 100% |
| Hapag-Lloyd Cruises | 5 | 5 | 0 | 0 | 100% |

## Source Quality Caveats

- Many proposal rows use an official brand fleet page as fleet-membership evidence and a ship-specific VesselFinder page as IMO identity evidence.
- The validator flags generic fleet URLs for manual review when selected-operator validation is used. These warnings are expected for operators whose official pages list fleets on a shared page.
- Before running an import with `--apply`, a maintainer should spot-check representative rows per operator and replace generic fleet URLs with more specific official ship pages where available.
- The proposal intentionally avoids HX Hurtigruten Expeditions, Hurtigruten Coastal Express, river cruise brands, ferry-like passenger operators, mixed transport/tourism operators, and unclear expedition-scope vessels.

## Proposal Totals

- Total ACCEPT rows currently in registry CSV: 220
- Existing Royal Caribbean International rows retained: 29
- New proposal rows appended in this global expansion: 191
- Operators with proposal rows: 20
- Operators left unresolved for later review: 8 plus manual-scope categories
