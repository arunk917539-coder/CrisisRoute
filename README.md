# CrisisRoute

Evidence-supported report reconciliation for disaster response. Citizens submit and track reports; responders compare advisory suggestions, review evidence, verify needs and record coverage. Both React portals use one FastAPI backend and one SQLite database.

## Run locally (Windows / PowerShell)

Prerequisites: Python 3.11+ and Node.js 22.12+ (or Node 24). Install once:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm --prefix frontend ci
npm --prefix admin-frontend ci
```

From the repository root, use three terminals:

```powershell
.\scripts\Start-CrisisRoute.ps1 -Service backend
.\scripts\Start-CrisisRoute.ps1 -Service citizen
.\scripts\Start-CrisisRoute.ps1 -Service admin
```

Open citizen at `http://localhost:5173` and responder at `http://localhost:5174`. The launcher overrides stale frontend `.env` API addresses and sends both portals through `/api` to the same backend. Stop a service with Ctrl+C. Starting the backend preserves existing data.

For an isolated rehearsal database, add `-DatabasePath .demo\rehearsal.db` to the backend command. A missing file is created empty; an existing rehearsal file is preserved. This does not reset the checked-in database.

## Two-PC demonstration

See [the demo runbook](docs/DEMO_RUNBOOK.md) for exact LAN configuration, checks, synthetic seeding and fallback behavior. Run only one backend. The second PC's frontend proxy must target the backend PC's LAN address.

## Validation and scope

- [Pre-change feature audit](docs/INTEGRATION_AUDIT.md)
- [Validation results](docs/VALIDATION.md)
- [Demo runbook and acceptance walkthrough](docs/DEMO_RUNBOOK.md)

Reconciliation uses deterministic offline lexical matching and contradiction rules; no LLM or embedding service is configured. Suggestions never verify a report or change quantities. Human review and explicit delivery recording control operational state. Maps use external services and reference routes are not verified safe routes. This prototype has no authentication, live responder/vehicle feed, verified shelter feed or photo storage; use controlled data on a trusted demo network.
