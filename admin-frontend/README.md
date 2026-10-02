# CrisisRoute responder portal

React + TypeScript + Vite with Leaflet maps. Uses the real backend for reports, evidence review, relationship decisions, report verification, needs, resources, allocations, deliveries and audit history.

From the repository root run `scripts/Start-CrisisRoute.ps1 -Service admin`. On a second PC append `-BackendUrl http://BACKEND_LAN_IP:8000`.

For direct npm startup, first run `cd admin-frontend` from the repository root. Copy `.env.example` to `.env`, configure `CRISISROUTE_API_TARGET`, and run `npm run dev`. Keep `VITE_API_BASE_URL=/api`. Port 5174 is strict; startup fails clearly if occupied.

See [the shared runbook](../docs/DEMO_RUNBOOK.md) and [validation results](../docs/VALIDATION.md).
