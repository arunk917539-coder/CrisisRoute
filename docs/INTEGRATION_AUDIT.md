# Integration audit — 29 September 2026

This is the **pre-change** audit. Code and the supplied master prompt are the available sources. The proposal DOCX files, research packs, checkpoint summaries, source TXT files and demo ZIP named in the prompt were not supplied in this checkout; their contents remain unknown. See VALIDATION.md for tested final behavior.

## Architecture and boundaries

- Backend: FastAPI, Pydantic, SQLAlchemy, one SQLite file; `backend/app/main.py`, `models.py`, `schemas.py`, `db.py`.
- Citizen: React 19, React Router, Vite 6, Leaflet; `frontend/src`.
- Responder: React 19, Vite 8, React Leaflet; `admin-frontend/src`.
- Reconciliation: offline token normalization, lexical similarity and deterministic contradiction rules in `backend/app/reconcile.py`. No LLM or embedding model exists. Suggestions require human judgment.
- Needs, inventory, allocation and delivery arithmetic belong to the backend. Accepting a suggested relationship is separate from verifying a report.

## Feature matrix

| Feature | Initial state | Implementation / issue | Dependency | Priority |
|---|---|---|---|---|
| Public submission and persistence | Implemented | `/public/reports`; SQLite | Backend reachable | P0 |
| Citizen build | Broken | Duplicate coordinate declarations; build skipped type checking | TypeScript | P0 |
| Citizen startup | Broken | API module throws without an environment variable | API config | P0 |
| One backend across two PCs | Partial | Local-only CORS/bind defaults; stale local admin LAN override; no runbook | LAN, firewall | P0 |
| Citizen location | Partial/broken | Shared map/GPS exists, request page also keeps conflicting GPS state | Browser geolocation; manual fallback | P0 |
| Incoming responder list/detail | Implemented | Real `/reports`, evidence and queue APIs | Backend | P0 |
| Live updates | Missing | Initial/manual refresh only in both portals | Lightweight polling | P0 |
| Human report review | Missing | Only relationship decisions and relief need creation; emergency never progresses | New additive review endpoint | P0 |
| Test database isolation | Broken | Tests delete/reset tracked demo database | Configurable DB and temporary test database | P0 |
| Verified relief needs | Implemented | `/needs`, evidence-review guard | Human review | P0 |
| Coverage / allocation | Broken | Delivered allocations counted twice in remaining allocation capacity | Deterministic accounting | P1 |
| Resource compatibility | Partial | Unit checked, resource category ignored | Need/report category | P1 |
| Duplicate/conflict suggestions | Broken in edge cases | Cross-location false conflict; `safe` matches `unsafe` | Scoped matching and word boundaries | P1 |
| Evidence / freshness | Partial | Evidence endpoints exist; public context discarded; reviewed state misleading | Review history | P1 |
| Priority | Missing | No persisted priority field or filters | Additive schema | P1 |
| Public lifecycle | Partial | Needs drive status; rejection/unresolved/emergency absent | Report review state | P1 |
| Public coverage/update time | Missing | Public response omits operational progress | Safe response fields | P1 |
| Incoming map markers | Missing | Admin map shows only verified needs | Report coordinates | P1 |
| Request-local reconciliation/history | Partial | Global queue and `/audit` exist; UI omits details/history | Existing APIs | P1 |
| Synthetic demo scenario | Partial | Seed exists but dates fixed to January and no coordinates | Fresh/stale relative data | P1 |
| Map/address/route services | Implemented, external | OSM tiles, Nominatim, OSRM, Overpass require internet; route is reference only | External free services | P2 |
| Photo upload | Missing / not required for core | Metadata only; no file storage API | Out of demo scope | P2 |
| Shelter / responder / vehicle live feed | Not implemented / not required | No authoritative backend feed | Unknown data source | P2 |
| Production auth, dispatch, route safety | Not required | Trusted-network prototype, no production claims | Separate future work | — |

## Baseline checks

- Admin build and lint pass.
- Citizen production bundling passes, but TypeScript reports 10 errors from duplicate latitude/longitude declarations.
- Existing citizen tests pass 17/17; most are source-string checks and do not establish a working browser workflow.
- Reproduced two unsafe reports falsely conflicting and opposite statuses in different villages falsely conflicting.
- Backend tests deliberately not run until database isolation is fixed.

## Controlled implementation batches

1. Preserve the architecture; correct startup, proxy configuration and test isolation.
2. Add report review lifecycle and correct deterministic coverage/reconciliation invariants; run backend regression suite.
3. Connect both existing frontends to the agreed contracts, polling and map fallbacks; build/typecheck/lint.
4. Exercise the actual citizen → backend → admin → review → coverage → citizen browser workflow; record only observed results.
5. Commit and push tested checkpoints on a working branch. Keep physical two-PC reachability separate from local proxy/browser verification.
