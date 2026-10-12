# CrisisRoute validation

## Feature expansion — completed 12 October 2026

All eight capabilities in [FEATURES.md](FEATURES.md) are implemented: incident grouping, citizen follow-ups, linked timelines, accounts/roles, private photos, offline drafts, reconfirmation reminders and local Ollama comparison. All browser data described here is synthetic. Services used `.demo/features-browser.db` and `.demo/features-photos`; the original database was preserved.

| Check | Observed result |
|---|---|
| Backend regression suite | **102 passed** across the full run and a targeted rerun; the initial run had 100 passes and two Windows temporary-directory setup errors, both passing with workspace-scoped TEMP/TMP |
| Citizen production build and checks | Build passed; **25 tests passed** |
| Responder production build, checks and lint | Build passed; **10 tests passed**; lint clean |
| Evidence snapshot regression | Stale photo/reply versions rejected with 409; a refreshed version can be reviewed |
| Actual local Ollama inference | `embeddinggemma:300m-qat-q4_0` ran locally; browser comparison returned an 83.2% semantic-similarity candidate |
| Multilingual inference smoke check | English paraphrase and Hindi related description returned advisory matches; this is a smoke check, not a language-accuracy evaluation |
| Original database preservation | SHA256 still matches the baseline value below |

Backend tests retain one Starlette/AnyIO deprecation warning. Restricted sandbox loopback/process access prevented normal TestClient/service execution; approved execution outside the sandbox completed the checks. No failing application assertions remain.

### Browser acceptance

- Saved and restored a citizen draft, including exact coordinates; saved edits during an intentional backend outage without automatic submission.
- Submitted CR-1 with a synthetic JPEG. Its private key, protected photo and submission timeline appeared in tracking and survived service restarts.
- Asked follow-up questions as a responder and answered from citizen tracking. Both portals updated by polling; new replies invalidated the previous evidence review. The final version-aware review succeeded after the new reply and photo loaded.
- Recorded a 25-unit delivery against the existing 100-unit verified need. Citizen tracking and incident details showed 25 delivered and 75 remaining.
- Reconfirmed the older verified report; its stale reminder cleared while quantities and observation metadata remained unchanged.
- Compared CR-1 to synthetic CR-2 using local Ollama through the UI. The candidate remained advisory. Explicitly accepting the duplicate relationship grouped two reports into one incident with one verified need, preserving 100 required / 25 delivered / 75 uncovered.
- Created a synthetic viewer through account management and signed in. Account management was absent; resource and delivery writes were disabled. API permission enforcement is covered by regression tests.
- Entered a wrong citizen key and confirmed private details disappeared with an access error. Reloading and searching with the previously saved valid key restored access.

Browser evidence: `.demo/screenshots/features-incidents.png` shows both reports, the accepted relationship and the single need. Screenshots, credentials, private images, databases and model/runtime downloads are local rehearsal artifacts and excluded from the source ZIP.

### Current limits

Drafts work in an already loaded app; fresh offline page loads are not supported. AI is advisory and requires a separately installed local Ollama runtime/model. Production HTTPS, account recovery, physical second-PC/firewall checks, real-device GPS, and live responder/shelter feeds remain outside this prototype. See [FEATURES.md](FEATURES.md) for setup and detailed limits.

## Initial integration baseline — 1 October 2026

The following records the earlier integration before the feature expansion above. Its scope statements describe that historical version.

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
- Git checkpoints were pushed to `codex/demo-integration` at `https://github.com/arunk917539-coder/CrisisRoute` on 2 October 2026 after the user explicitly confirmed the destination and approved the push.
