# Admin defense in depth

PaperStraw retains shared HTTP Basic authentication for the current small admin team. Middleware is only the first rejection
layer: admin pages, admin API handlers, direct ingestion, and server actions independently verify `ADMIN_USERNAME` and
`ADMIN_PASSWORD`. Cron remains a separate Bearer-authenticated machine endpoint using `CRON_SECRET`.

## Protected surface inventory

| Surface | Classification | Privileged behavior |
| --- | --- | --- |
| `/admin` | Read-only | Admin module inventory. Protected in middleware and the admin server layout. |
| `/admin/private-jets` | Read-only, expensive | Import, attribution, cron, and historical-job operational data. Hosts the two protected server actions below. |
| `/admin/cruises` | Read-only, expensive | Cruise operational status and MMSI review data. Hosts browser calls to the protected cruise API routes. |
| `/admin/validation` | Read-only, expensive | Private-jet emissions validation queries. |
| `GET /api/admin/cruises/status` | Read-only, expensive | Cruise operational and verification status. Handler-level Basic authorization runs before queries. |
| `POST /api/admin/cruises/mmsi-candidates/:id/approve` | Mutating | Approves one strictly validated review-queue ID. Requires Basic auth and same-origin validation. |
| `POST /api/admin/cruises/mmsi-candidates/apply-approved` | Mutating, expensive | Dry-runs or explicitly applies previously approved links. Strict JSON accepts only optional boolean `confirm`. |
| `uploadCsvAction` | Mutating, expensive, cache invalidating | Validates and imports a bounded CSV, then revalidates public comparison pages. |
| `startHistoricalImportAction` | Mutating, expensive, external API | Validates a completed UTC date range and dispatches the GitHub Actions historical importer. `force` remains explicit. |
| `POST /api/ingest` | Mutating, expensive, external API | Direct provider ingestion with a strict provider enum. Basic auth and same-origin validation run before body parsing. |
| `GET/POST /api/cron/ingest` | Mutating, expensive, external API | Vercel Cron compatibility endpoint. Bearer-only auth runs inside the handler before dispatch. The authenticated GET is the documented platform exception to POST-only mutation rules. |

No other `route.ts` or `"use server"` file exists in the application. Public dashboard, data, comparison, methodology, and
support routes are intentionally public and read-only.

Operational CLI commands are not web endpoints. Mutating commands remain terminal-only and retain their existing explicit
guards: private-jet ingestion/migration commands; cruise MRV/registry import; AIS workers; registry reconcile apply; MMSI
approve/dismiss/apply; applied-link repair confirm; and position cleanup apply. Read-only audit, status, validation, benchmark,
coverage, launch-readiness, and dry-run modes do not receive browser authentication because they are not remotely routable.

## Authorization and CSRF model

- Basic credentials are decoded once and username/password are compared with timing-safe SHA-256 digest comparisons.
- Missing credentials, malformed Basic headers, and missing credential environment variables fail closed.
- API handlers return a generic `401` and `WWW-Authenticate`; supplied credentials are never logged.
- Browser mutations require an exact allowed `Origin`. Missing/mismatched origins fail before request-body parsing.
- `Sec-Fetch-Site: cross-site` is rejected as an additional signal; it is not used as authentication.
- Server Actions perform the same explicit check. Next.js keeps its native same-origin validation; optional additional hosts
  are derived from comma-separated absolute origins in `ADMIN_ALLOWED_ORIGINS`.
- Cron does not use browser Origin assumptions and accepts only `Authorization: Bearer <CRON_SECRET>`.
- The middleware-injected `x-paperstraw-admin-authenticated` header is an optimization marker only and is never trusted by a handler.

Privileged mutations emit compact JSON audit events containing action, result, timestamp, source, request ID, and a safe
target identifier where useful. They never contain authorization headers, passwords, secrets, database URLs, provider keys,
or request payloads.

## Vercel Firewall recommendation

Configure these rules manually in Vercel; do not replace them with process-local counters:

1. Restrict `/admin*`, `/api/admin*`, and `/api/ingest` to known operator IP ranges where stable addresses are available.
2. Add an IP-based rate limit for `/api/admin*` and `/api/ingest`, starting conservatively around 10 requests per minute per
   IP with a temporary deny action. Tune from observed legitimate usage.
3. Add a broader IP-based rate limit for `/admin*`, starting around 60 requests per minute per IP so page assets/navigation
   are not disrupted.
4. Rate-limit `/api/cron*` to a small burst such as 6 requests per minute per IP, but do not place an interactive challenge
   in front of Vercel Cron. Handler-level Bearer validation remains mandatory.
5. Alert on repeated `401`, `403`, and `paperstraw.security.audit` rejected events. Preserve Vercel system/bot rules in front
   of these custom rules.

Firewall plan capabilities and rule syntax can vary. Verify the path matcher and enforcement action in a preview deployment,
then promote the same reviewed rules to production.

## Deferred identity migration

Basic Auth is intentionally retained for this pass. A later migration should introduce an identity provider with individual
admin accounts, phishing-resistant MFA/passkeys, short-lived sessions, explicit roles, session revocation, and per-user audit
identity. During migration, keep these route/action authorization calls as the policy-enforcement boundary and replace only
the credential-verification implementation. Do not remove the origin, input-validation, or audit layers.
