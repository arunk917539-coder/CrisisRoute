# Final integration validation

Completed 1 October 2026. Work began with the 29 September audit and resumed after interruptions. All report examples below are controlled synthetic demonstrations, not real emergencies.

## Result

The real citizen → backend → SQLite → responder → human review → verified need → allocation/delivery → citizen tracking flow was exercised through both browser frontends. No dispatch service, AI model, responder GPS feed, shelter feed or file-upload service is implied.

| Check | Observed result |
|---|---|
| Backend regression suite | **69 passed**, one dependency deprecation warning; isolated temporary database |
| Citizen production build | Passed, including TypeScript checking |
| Citizen checks | **20 passed** after a fresh production build |
| Responder production build | Passed, including TypeScript checking |
| Responder lint | Passed without warnings |
| Both frontend API proxies | `/api/health` returned the same backend health response |
| Backend LAN bind | API responded at the host's LAN IPv4 address on port 8000 |
| Cross-process persistence | Automated test passed; browser request/review/allocation also survived service restarts |
| Existing database preservation | Tracked database unchanged; SHA256 below |

The citizen bundler needed execution outside the tool sandbox because esbuild could not read a parent directory. The approved rerun passed. This was a sandbox restriction, not an application build failure. The local ignored admin `.env` was updated from its stale LAN API address to `/api`, then its production build was rerun successfully.

## Browser acceptance evidence

Test services used the same isolated SQLite file, `.demo/browser-validation.db`, with backend port 8000, citizen port 5173 and responder port 5174.

- [x] Submitted **CR-1** from the citizen form: water, 100 units, high priority, manual coordinates 12.9716 / 77.5946 and supporting text.
- [x] Received a real backend-generated tracking ID and confirmation.
- [x] Read the matching report and need directly from SQLite; verified saved coordinates, quantity, priority, decision and note.
- [x] Opened that same report in the responder dashboard; inspected source, supporting text and explicitly unknown observation freshness.
- [x] Recorded evidence review; the report remained unverified until explicit acceptance.
- [x] Accepted the report and created **Need #1** for 100 units; the citizen saw the verification note and status.
- [x] Created water inventory through the responder form; allocated 50 units and recorded its linked delivery through the UI.
- [x] Both portals automatically showed **100 required / 50 delivered / 50 uncovered**, with **0 outstanding allocated / 50 remaining to allocate**.
- [x] Allocated and delivered the remaining 50 units through the UI. Citizen tracking automatically became **Resolved**, with **100 delivered / 0 remaining**. Completed need disappeared from the active map.
- [x] Submitted **CR-2** from the citizen frontend while the admin dashboard remained open. It appeared by polling in the list/map and generated a **90% advisory duplicate** against CR-1.
- [x] Accepted the duplicate relationship and confirmed CR-2 remained unverified: a relationship decision did not create another need or add quantity.
- [x] Marked CR-2 unresolved, then rejected, with separate review notes; its open citizen tracking page automatically displayed both outcomes.
- [x] Added two explicitly synthetic bridge reports through the internal intake API. The open dashboard showed **possible conflict**, **stale** versus **fresh** evidence, source/context, synthetic labels and incoming map markers.
- [x] Inspected rendered map and coverage screens. Browser console checks before the intentional outage returned no errors or warnings.
- [x] Stopped the backend deliberately. Both portals showed connection/update errors while retaining last-known data. Restarting the same database restored them automatically and preserved resolved status.

Browser screenshots are saved locally under `.demo/screenshots/` (ignored by Git): `citizen-partial.jpg`, `citizen-coverage.jpg`, and `admin-map.jpg`. The concise coverage screenshot shows 100 required, 100 delivered and zero remaining.

## Additional automated coverage

Tests cover emergency verification without a relief need; explicit evidence-review guards; rejected/unresolved decisions; verified-need transition guards; accepted duplicate groups preventing double-counted needs; resource type/unit matching; linked delivery limits; fractional quantities; non-finite input; invalid IDs; paired coordinates; public projections; UTC timestamps; scoped conflict detection (including non-Latin locations); CORS allowlists; process-to-process persistence; additive legacy schema migration; and fresh/aging/stale synthetic seed records.

Original `backend/crisisroute.db` SHA256 before and after validation:

`55CFD1BB765C1157ED359F340D00F8D56A03C9FD9063DE827D2E8DB192CA0824`

## Remaining external checks and limits

- **Physical second-PC connectivity is not tested.** Local proxy/LAN-address checks and CORS tests passed; firewall rules, peer isolation and the venue network still need the runbook's second-PC check.
- GPS permission/accuracy on the presenting devices was not exercised. Manual coordinates were tested as the dependable fallback.
- Internet-backed route/landmark services are retained but were not exercised end-to-end in this validation. They are optional references and cannot establish disaster-route safety.
- Photo storage, live responder/vehicle tracking and verified shelters are unsupported. Reconciliation is offline lexical/rule assistance, with human decisions and deterministic quantities.
- Proposal/checkpoint files listed in the master prompt were not present in this checkout, so their additional requirements could not be independently assessed.
- Git checkpoints are local on `codex/demo-integration`. Push was blocked by automatic approval review because the configured GitHub destination's trust/ownership was not established. No remote push is claimed.
