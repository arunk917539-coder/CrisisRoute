# Demo runbook

## One backend, one database

Backend PC owns the only SQLite file. Do not start another backend on the second PC or copy a live database between PCs. Default path is `backend/crisisroute.db`; `CRISISROUTE_DATABASE_URL` can select a different SQLite file. The startup script accepts `-DatabasePath .demo\rehearsal.db` for an isolated rehearsal.

### Recommended: frontend server on each PC

On the backend/responder PC, open separate PowerShell terminals at the repository root:

```powershell
.\scripts\Start-CrisisRoute.ps1 -Service backend -DatabasePath .demo\rehearsal.db
.\scripts\Start-CrisisRoute.ps1 -Service admin
```

On the citizen PC (replace `192.168.1.20` with the backend PC's actual Wi-Fi/Ethernet IPv4):

```powershell
.\scripts\Start-CrisisRoute.ps1 -Service citizen -BackendUrl http://192.168.1.20:8000
```

Open `http://localhost:5173` on the citizen PC and `http://localhost:5174` on the responder PC. The browser calls its local frontend; that frontend forwards `/api` to the shared backend. Localhost browser access also permits browser geolocation where the user grants it. The backend binds to `0.0.0.0:8000`.

### Alternative: both frontend servers on the backend PC

Start all three services there. The second PC opens `http://BACKEND_LAN_IP:5173`. Allow ports 5173 and 5174 in addition to 8000 as needed. Geolocation commonly requires HTTPS or localhost and can be unavailable over plain LAN HTTP: use the map pin or manual coordinates.

### Connectivity checks

1. Put both PCs on the same non-isolated network. Guest Wi-Fi/client isolation may block peer connections.
2. Run `ipconfig` on the backend PC and use the connected adapter's IPv4 address. Recheck after changing networks; the address is not hardcoded into the app.
3. From the second PC run `Test-NetConnection BACKEND_LAN_IP -Port 8000` and open `http://BACKEND_LAN_IP:8000/health`. If unreachable, check that the backend is running and allow Python/TCP 8000 for the intended private network in Windows Firewall. The application does not change firewall settings.
4. Open `http://localhost:5173/api/health` and `http://localhost:5174/api/health` on their respective PCs. Both should show the same backend health response.
5. Submit one request and confirm the identical `CR-...` identifier appears through both portals.

Both Vite servers have strict ports and a same-origin `/api` proxy. `CRISISROUTE_API_TARGET` controls the server-side target. The startup script overrides old `.env` values; direct `npm run dev` uses local `.env`, so copy `.env.example` when configuring manually. Restart Vite after changing environment variables.

Direct browser-to-backend API use is optional: set `VITE_API_BASE_URL=http://BACKEND_LAN_IP:8000` and set backend `CRISISROUTE_CORS_ORIGINS` to a comma-separated list of exact browser origins before starting it. For this option, start each frontend with `npm run dev` from its own folder in a new terminal; the launcher always overrides the API URL to `/api`. Default origins are localhost/127.0.0.1 on ports 5173 and 5174. The proxy setup does not require additional CORS origins.

## Controlled synthetic data

Use an isolated database. The existing seed command is intentionally a reset: it deletes all records in the selected database. Stop the backend before resetting and only point it at the rehearsal file:

```powershell
$env:CRISISROUTE_DATABASE_URL = 'sqlite:///C:/path/to/CrisisRoute/.demo/rehearsal.db'
.\.venv\Scripts\python.exe backend\seed.py
```

Create `.demo` first if needed. Start the backend with that same database path. Seeded records are labelled synthetic and include map coordinates, related reports and fresh/stale evidence. Public submissions are labelled citizen submissions; use `[SYNTHETIC DEMO]` in your description when rehearsing. Existing SQLite data is not rewritten by the validation suite.

## Core acceptance walkthrough

1. Keep responder incoming reports open, then submit a citizen relief request: category **Potable Drinking Water**, description **Residents in the affected area require drinking water. [SYNTHETIC DEMO]**, 100 units, and an explicit location pin or manual coordinates. Save its `CR-...` ID.
2. Within about five seconds, find the same report in the responder list and on the map. Open details and inspect priority, timestamps, source/context and freshness. A nearby repeated report with the same category/location demonstrates the advisory duplicate comparison.
3. Record an evidence review, then explicitly accept/verify 100 units. Relationship decisions alone do not verify the report.
4. Create matching **drinking water** inventory, using the same unit as the verified need. Allocate 50 units and record a linked delivery of 50.
5. Confirm required 100, delivered 50, uncovered 50 and remaining to allocate 50. This last value checks the corrected historical-allocation arithmetic.
6. The citizen tracking page should update automatically to **Partially Delivered** and show the same 50-unit gap. Allocate/deliver the remainder to resolve it.
7. On separate reports, demonstrate rejected and unresolved decisions and their public notes. An emergency report can be reviewed and verified without creating a quantity-based relief need.

## Offline / degraded service behavior

The core API, database, review, coverage and polling work without an AI service or cloud account. Leaflet's base map tiles need internet; pin/coordinate fields and the request list remain the fallback. Address search uses Nominatim, optional resource routes use OSRM, and nearby landmark lookup uses Overpass. Failure of these services must not prevent submission or human review. Landmark and route results are reference data, not verified shelters or disaster-safe routing.

If the backend disconnects, use visible error/last-refresh indicators; do not assume a failed or timed-out submission was lost. Check its tracking ID/list before retrying if the result is uncertain. Reports use browser-held tracking IDs, with no authenticated citizen identity or confidential case access.

## Checks before presenting

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q -p no:cacheprovider
npm --prefix frontend run build
npm --prefix frontend test
npm --prefix admin-frontend run build
npm --prefix admin-frontend run lint
```

Backend tests create a temporary database. Physical second-PC connectivity, firewall rules and browser permissions must be checked on the actual venue network. Local browser/proxy tests do not prove those conditions.
