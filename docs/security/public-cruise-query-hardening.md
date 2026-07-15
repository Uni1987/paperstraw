# Public Cruise query hardening

This document describes the anonymous, read-only Cruise query path after the third security and reliability remediation pass. It does not cover admin, ingestion, registry review, or worker queries.

## Public query inventory

| Route | Helper / query group | Cruise tables | Round trips on a cache refresh | Maximum result shape | User-specific | Cache | Cost risk after remediation |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `/cruises` KPI, charts, status | `getCruiseDashboardData` | `cruise_ships`, `cruise_vessel_verifications`, `cruise_vessel_registry_entries`, `cruise_positions`, `cruise_emissions_daily_estimates` | 6 | one row per day plus one row per verified ship | No | `dashboard`, 120 seconds | Medium on refresh; low on hit |
| `/cruises` map | `getCruiseDashboardMapData` | same identity tables, `cruise_positions`, `cruise_emissions_daily_estimates` | 5 | one latest point per verified ship for each of three fixed periods | No | `map`, 120 seconds | Medium on refresh; low on hit |
| `/comparisons/cruises` | `getCruiseDashboardData` | same as dashboard | 6 | cached dashboard DTO | No | reuses `dashboard`, 120 seconds | Low |
| `/data/cruises` | `getCruisePublicDataSummary` | registry, verification, ship, and position tables | 2 | one four-count row | No | `data-summary`, 120 seconds | Low |
| `/cruises/[shipId]` | `getCruiseShipDetail` | registry, verification, ship, position, daily estimate, annual estimate tables | 7 | one eligible ship, one latest position, one current-day row, one aggregate row, one annual row | No | request memoization only | Low to medium |

The table-availability check and strict verified-vessel lookup account for two round trips in each uncached eligibility group. The `/cruises` shell can share its request-scoped base lookup when dashboard and map refresh together. Counts above are conservative independent-refresh counts.

No public Cruise route imports `@/lib/database/privateJets` or `@/lib/prisma`. All reads use `@/lib/database/cruises`. The only legacy `DATABASE_URL` compatibility path requires an explicit `CRUISE_WORKER_DATABASE_TARGET=cruises-dev` and a cruise-looking database name; public Vercel deployments must set `CRUISES_DATABASE_URL`.

## Before and after

| Public view | Before | After | Main reduction |
| --- | ---: | ---: | --- |
| `/cruises` full cold render | about 17 | 7 when the base is request-shared; at most 11 if dashboard and map refresh separately | grouped statistics, database-side daily/ship aggregates, one three-period map query |
| `/comparisons/cruises` | about 14 per request | 6 per refresh, 0 on cache hit | shared dashboard cache |
| `/data/cruises` | about 28 per request | 2 per refresh, 0 on cache hit | one public summary query instead of two operational audits |
| `/cruises/[shipId]` | 8 | 7 | combined total/min-date aggregate and narrow selects |

The former dashboard path transferred every daily estimate since monitoring began and hydrated ranking rows in separate queries. The replacement transfers at most one aggregate per UTC date and one aggregate per verified ship. The map previously ran one position query per period; all fixed periods now use one parameterized query.

## Cache policy

Public aggregates use Next.js `unstable_cache` with exactly three allowlisted keys: `dashboard`, `map`, and `data-summary`. Each entry revalidates after 120 seconds. This is within the 60-300 second operating target and means newly ingested data becomes visible within roughly two minutes without coupling ingestion to cache invalidation.

Only serialized DTOs are cached. Cached date strings are validated and revived before use. A serialized entry is rejected above 1.5 MB, below Next.js's 2 MB data-cache limit. A successful value is retained in a bounded, process-local five-minute last-known-good slot so a transient refresh failure can degrade gracefully. The framework cache remains the primary cache; the process-local value is only an error fallback.

The key type and runtime allowlist reject arbitrary keys. Search parameters never enter a cache key. Admin, authentication, ingestion, preview, and mutation paths do not import the public cache helper.

References: [Next.js 15 `unstable_cache`](https://nextjs.org/docs/15/app/api-reference/functions/unstable_cache) and [Next.js caching guide](https://nextjs.org/docs/15/app/guides/caching).

## Input and result bounds

- Map periods are the fixed allowlist `week`, `month`, and `since-monitoring`; invalid values normalize to `since-monitoring` and are removed from the visible URL.
- Public ship IDs are limited to 64 ASCII alphanumeric, underscore, or hyphen characters. Invalid IDs return the existing unavailable/not-found result before a database query.
- Public routes expose no user-selected sort column, order direction, page size, search text, arbitrary comparison period, or history sample count.
- Map SQL returns one latest point per verified ship and fixed period, never raw position history. The 1.5 MB cache payload guard is a second bound.
- Detail queries return one ship and one latest position. They do not return raw AIS payloads.
- Daily chart data returns at most one aggregate row per observed UTC date. Ship rankings and operator totals return at most one aggregate row per strictly verified ship before presentation limits are applied.
- All raw SQL values are Prisma parameters. No user-controlled identifier, expression, table, sort field, or column is interpolated.

## Index review

The current schema already matches the public predicates:

- `cruise_positions(ship_id, timestamp)` supports latest-position and bounded ship-position reads.
- `cruise_positions(mmsi, timestamp)` and the position uniqueness constraint support ingestion and deduplication, but are not relied on for public identity.
- `cruise_emissions_daily_estimates(ship_id, date)` supports per-ship date windows.
- `cruise_emissions_daily_estimates(date)` supports the fixed period aggregates.
- the unique verification `ship_id` and indexed `registry_entry_id` support strict public eligibility joins.

No new index or migration is recommended from this audit. If `EXPLAIN (ANALYZE, BUFFERS)` later shows repeated scans as position history grows, evaluate a partial covering position index on `(ship_id, timestamp DESC)` for valid coordinates in a separate, reviewed migration. Its write amplification and storage cost must be measured first.

## Connection and timeout controls

On Vercel only (`VERCEL=1`), the Cruise Prisma URL receives defaults when the same option is not already explicit:

- `connection_limit=3`
- `connect_timeout=5`
- `pool_timeout=5`
- `socket_timeout=10`
- `application_name=paperstraw-cruises-web`

Explicit URL settings win. Railway and local worker URLs are returned unchanged, so worker connection behavior is not altered. The socket timeout bounds a stalled database response; the application also returns only generic Cruise-data errors. A server-side PostgreSQL `statement_timeout` can be considered later on a dedicated read-only web role, but must not be applied globally to the ingestion worker.

Reference: [Prisma PostgreSQL connection URL arguments](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql) and [Prisma connection management](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections).

## Failure behavior and observability

Cruise route segments have user-safe error boundaries. Query failures are converted to a generic error before they can reach UI output. Logs do not include SQL, provider messages, database hosts, URLs, credentials, vessel identifiers, or raw AIS payloads.

Public query events contain a fixed allowlisted operation name, duration, outcome, safe result count, and `refresh` or `uncached` status. Successful events are emitted only at or above the default 1,500 ms slow threshold, or when `CRUISE_QUERY_TIMING=true`; failures are always emitted. The threshold can be bounded between 250 and 10,000 ms with `CRUISE_SLOW_QUERY_MS`. Cache events distinguish refresh, hit (diagnostic mode only), last-known-good, oversized, and unavailable states. Correlation IDs are omitted from cached functions because Next cache scopes must not read request-specific headers.

## Recommended Vercel Firewall rollout

These are conservative starting points, not deployed settings. Start in log-only mode for at least 24 hours, inspect legitimate navigation, prefetch, crawler, shared-NAT, cron, and admin traffic, then tune before enforcement.

| Match | Initial window / count | Staged action | Notes |
| --- | --- | --- | --- |
| `/cruises*`, `/data/cruises*`, `/comparisons/cruises*` | 120 requests / IP / minute | log, then rate limit | Allows normal navigation and Next prefetch; exempt verified search crawlers only after observed evidence |
| future `/api/cruises*` | 60 / IP / minute | log, then rate limit | Lower further for expensive endpoints; no public Cruise API exists now |
| `/api/admin*` | 10 / IP / minute | log, then rate limit; consider trusted-IP allowlist | Keep application authorization; firewall is defense in depth |
| `/admin*` | 60 / IP / minute | log, then challenge or rate limit | Do not challenge API requests |
| `/api/ingest` | 6 / IP / minute | log, then deny/rate limit non-approved sources | Preserve existing authentication and approved automation source |
| `/api/cron*` | 6 / IP / minute | log, then deny/rate limit non-cron sources | Exempt verified Vercel Cron; do not use an interactive challenge |

Rollout: create matching rules in log mode, observe for 24-72 hours, document legitimate peaks and exemptions, enable rate limiting one rule at a time, monitor 429/5xx/cache-refresh/slow-query events, and retain a quick disable path.

References: [Vercel WAF custom rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules) and [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

## Expected Neon impact and deferred work

Steady public navigation should normally hit the Vercel data cache and cause zero Cruise database round trips. On refresh, the largest transfer changes from all historical daily-estimate rows to one row per day plus one row per verified ship. The public data page changes from two operational audit runs to one compact row. This should substantially reduce Neon compute wakeups, query execution, and network transfer, although exact savings depend on traffic, cache locality, and ingestion growth.

Do not add a materialized view yet. Revisit daily/operator rollups only if slow-query events or database plans show the bounded aggregate refreshes exceeding the latency budget as history grows. Any such change must preserve strict verified-only eligibility and be isolated to the Cruise database.
