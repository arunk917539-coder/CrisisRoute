# CrisisRoute

## Evidence-Supported Disaster Response Coordination System

CrisisRoute is a disaster-response coordination platform built for the **Build for Billions 24-hour hackathon**.

The system connects two interfaces:

- **Citizen Frontend** — citizens submit and track emergency/relief requests.
- **Admin/Responder Frontend** — responders review incoming reports, reconcile related reports, verify evidence, manage resources, record deliveries, and monitor coverage.
- **Backend** — a centralized FastAPI service that manages reports, reconciliation, verification, resources, allocations, deliveries, coverage, and audit records.

The main idea is:

> **Citizen Report → Reconciliation → Human Verification → Verified Need → Resource Allocation → Delivery → Coverage**

---

# 1. Core Features

## Citizen

The Citizen frontend supports:

- Submit relief/emergency requests
- Capture/select location
- Capture latitude and longitude
- Address/location search
- Location confirmation using a map
- Receive a backend-generated request ID
- Track submitted requests
- View request status
- View request history
- Display request information without exposing admin-only APIs

## Admin / Responder

The Admin frontend supports:

- View incoming reports
- View report details
- View report locations
- Reconciliation of related reports
- Possible duplicate detection
- Possible conflict detection
- Human reconciliation decisions
- Evidence review
- Evidence freshness information
- Verified need creation
- Resource inventory
- Resource allocation
- Delivery recording
- Coverage calculation
- Uncovered requirement display
- Operational map
- Suggested response routing
- Nearby landmark fallback when vehicle routing is unavailable
- Dashboard/operational overview

## Backend

The backend provides:

- Citizen public report API
- Citizen request tracking API
- Report management
- Deterministic report reconciliation
- Evidence review workflow
- Human verification workflow
- Verified need management
- Resource management
- Allocation management
- Delivery management
- Coverage calculation
- Audit logging
- Operational map data
- CORS support for separate frontend applications

---

# 2. Technology Stack

## Backend

- **Python**
- **FastAPI**
- **Uvicorn**
- **SQLAlchemy**
- **SQLite**
- **Pydantic**
- **Pytest**

## Citizen Frontend

- **React**
- **TypeScript**
- **Vite**
- **React Router**
- **Leaflet**

## Admin Frontend

- **React**
- **TypeScript**
- **Vite**
- **Leaflet**

## Communication

- REST APIs
- JSON
- HTTP
- CORS

---

# 3. Architecture

CrisisRoute uses a centralized backend architecture.

```text
                    ┌───────────────────────┐
                    │     Backend PC        │
                    │                       │
                    │ FastAPI :8000         │
                    │ SQLite Database       │
                    └───────────┬───────────┘
                                │
                   LAN / REST / JSON
                         ┌──────┴──────┐
                         │             │
                         ▼             ▼
                ┌─────────────┐ ┌─────────────┐
                │ Citizen PC  │ │  Admin PC   │
                │ Frontend    │ │  Frontend   │
                │ :5173       │ │  :5174      │
                └─────────────┘ └─────────────┘
````

Only **one backend/database instance** should be used during the multi-PC demonstration.

---

# 4. Backend Architecture

```text
Citizen Request
      │
      ▼
Public API
      │
      ▼
Report
      │
      ▼
Reconciliation Engine
      │
      ├── Possible Duplicate
      └── Possible Conflict
      │
      ▼
Human Verification
      │
      ▼
Verified Need
      │
      ▼
Resource
      │
      ▼
Allocation
      │
      ▼
Delivery
      │
      ▼
Coverage
```

---

# 5. Report Reconciliation

CrisisRoute uses a **deterministic reconciliation engine**.

The engine compares related reports using token/lexical similarity and rule-based checks.

It can identify:

* Possible duplicates
* Possible conflicts
* Similarity between reports
* Reasons for the detected relationship

The reconciliation engine is **advisory**.

It does not automatically decide that a report is true or false.

A human responder makes the final reconciliation decision.

Possible decisions include:

```text
Accept
Reject
Unresolved
```

This keeps operational decisions under human control.

---

# 6. Evidence and Verification

The system separates:

1. Report submission
2. Evidence review
3. Human verification
4. Verified need creation

Viewing evidence does not automatically make a report verified.

A responder must explicitly review the evidence before creating a verified need.

The current prototype stores evidence metadata such as:

* Evidence status
* Evidence source
* Evidence note
* Evidence observation time

The current prototype does **not** implement direct photo/video file upload or object storage.

---

# 7. Resources and Coverage

Once a need has been verified, responders can manage resources.

The workflow is:

```text
Verified Need
     ↓
Available Resource
     ↓
Allocation
     ↓
Delivery
     ↓
Coverage
```

The system checks:

* Available resource quantity
* Remaining requirement
* Unit compatibility
* Allocation limits
* Delivery limits

Coverage is calculated from **delivered quantities**, not merely allocated quantities.

Example:

```text
Required:       500
Allocated:      400
Delivered:      300
Uncovered:      200
Coverage:        60%
```

---

# 8. API Endpoints

Important backend endpoints include:

## Health

```text
GET /health
```

## Reports

```text
GET  /reports
POST /reports
```

## Public Citizen Requests

```text
POST /public/reports
GET  /public/requests/{request_id}
GET  /public/requests?request_ids=...
```

## Evidence

```text
GET  /reports/{report_id}/evidence
POST /reports/{report_id}/evidence/review
```

## Reconciliation

```text
GET  /relationships
POST /relationships/{relationship_id}/decision
GET  /reconciliation/queue
```

## Needs

```text
POST /needs
```

## Resources

```text
GET  /resources
POST /resources
```

## Allocation

```text
GET  /allocations
POST /allocations
```

## Deliveries

```text
POST /deliveries
```

## Coverage

```text
GET /coverage
```

## Dashboard

```text
GET /dashboard
```

## Audit

```text
GET /audit
```

## Map

```text
GET /map/needs
```

---

# 9. Running the Backend

From the project root:

```powershell
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

The backend will be available at:

```text
http://localhost:8000
```

For a multi-PC LAN demonstration, use the backend PC's LAN IP.

Example:

```text
http://10.30.69.5:8000
```

Health check:

```text
http://10.30.69.5:8000/health
```

Expected response:

```json
{
  "status": "ok",
  "demo_data": "synthetic"
}
```

---

# 10. Running the Citizen Frontend

Install dependencies:

```powershell
npm --prefix frontend install
```

For a multi-PC demonstration, configure:

```text
frontend/.env.local
```

with:

```env
VITE_API_BASE_URL=http://10.30.69.5:8000
```

Start the frontend:

```powershell
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173
```

Open:

```text
http://localhost:5173
```

---

# 11. Running the Admin Frontend

Install dependencies:

```powershell
npm --prefix admin-frontend install
```

Configure:

```text
admin-frontend/.env.local
```

with:

```env
VITE_API_BASE_URL=http://10.30.69.5:8000
```

Start the frontend:

```powershell
npm --prefix admin-frontend run dev -- --host 0.0.0.0 --port 5174
```

Open:

```text
http://localhost:5174
```

---

# 12. Three-PC Demo Setup

Recommended setup:

```text
BACKEND PC
IP: 10.30.69.5
FastAPI: 8000

        │
        │ LAN
        │
        ├───────────────────┐
        │                   │
        ▼                   ▼

CITIZEN PC             ADMIN PC
Frontend :5173         Frontend :5174
```

Do not run separate backend instances on the Citizen or Admin PCs.

Both frontends should communicate with the same backend:

```env
VITE_API_BASE_URL=http://10.30.69.5:8000
```

---

# 13. Testing

## Backend Tests

Run:

```powershell
python -m pytest backend/tests -q
```

The current validated backend checkpoint passes:

```text
38 passed
```

## Citizen Production Build

Run:

```powershell
npm --prefix frontend run build
```

## Citizen Type Check

Run:

```powershell
npm --prefix frontend run typecheck
```

## Citizen Tests

Run:

```powershell
node frontend/test-citizen.mjs
```

---

# 14. Demo Workflow

The recommended demonstration flow is:

```text
1. Citizen submits a request
            ↓
2. Backend generates request ID
            ↓
3. Request appears in Admin dashboard
            ↓
4. Admin reviews related reports
            ↓
5. Reconciliation relationship is reviewed
            ↓
6. Human responder makes a decision
            ↓
7. Evidence is reviewed
            ↓
8. Need is verified
            ↓
9. Resource is added/selected
            ↓
10. Resource is allocated
            ↓
11. Delivery is recorded
            ↓
12. Coverage is calculated
            ↓
13. Citizen can track request status
```

---

# 15. Important Design Principle

CrisisRoute separates automated assistance from human decision-making.

### System assists with:

* Report comparison
* Similarity detection
* Possible duplicate/conflict identification
* Evidence information
* Freshness information
* Coverage calculations
* Operational information

### Human responder decides:

* Whether reports should be reconciled
* Whether evidence is sufficient
* Whether a need is verified
* Operational response decisions
* Resource allocation decisions

The system therefore acts as a **decision-support and reconciliation layer**, rather than fully automating disaster-response decisions.

---

# 16. Current Prototype Scope

The current validated prototype is designed for a controlled hackathon demonstration.

It currently uses:

```text
Python
FastAPI
SQLAlchemy
SQLite
React
TypeScript
Vite
Leaflet
Deterministic reconciliation logic
```

The current prototype does not implement:

* PostgreSQL
* pgvector
* Sentence Transformers
* External AI API dependency
* Direct photo/video upload storage
* Production authentication/authorization
* Production-scale distributed deployment

These can be considered future production extensions rather than current implemented functionality.

---

# 17. Database

The current prototype uses:

```text
SQLite
```

The database stores operational entities including:

* Reports
* Relationships
* Needs
* Resources
* Allocations
* Deliveries
* Audit events

The database file is:

```text
backend/crisisroute.db
```

For this hackathon, SQLite keeps the deployment lightweight and suitable for a controlled offline/local demonstration.

---

# 18. Security and Privacy Scope

The current prototype is designed for a controlled hackathon environment.

It does not currently implement full production-grade:

* Authentication
* Authorization
* Role management
* Rate limiting
* Citizen account ownership
* Distributed security controls

Therefore, the system should be presented as a **hackathon prototype**, not as a production disaster-management infrastructure deployment.

---

# 19. Repository Structure

```text
CrisisRoute/
│
├── backend/
│   ├── app/
│   │   ├── db.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── reconcile.py
│   │   └── schemas.py
│   │
│   ├── tests/
│   ├── requirements.txt
│   ├── seed.py
│   └── reset_demo.py
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── services/
│   │   └── types/
│   ├── package.json
│   └── test-citizen.mjs
│
├── admin-frontend/
│   ├── src/
│   │   ├── components/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

---

# 20. Quick Start

### Backend

```powershell
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

### Citizen

```powershell
npm --prefix frontend install
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173
```

### Admin

```powershell
npm --prefix admin-frontend install
npm --prefix admin-frontend run dev -- --host 0.0.0.0 --port 5174
```

---

# 21. Judge Explanation — One Minute

> CrisisRoute is an evidence-supported disaster response coordination platform. Citizens submit relief or emergency requests through a dedicated interface, while responders use an operational dashboard to review and reconcile incoming reports. Our backend uses Python and FastAPI with SQLite and SQLAlchemy. We use deterministic similarity and rule-based reconciliation to surface possible duplicate or conflicting reports. Human responders remain responsible for verification and operational decisions. Once a need is verified, resources can be allocated, deliveries recorded, and coverage calculated. The system is designed to work offline/local-network for the hackathon and uses a single centralized backend shared by the Citizen and Admin interfaces.

---

The current Git `main` branch is the integrated project source.

---

## CrisisRoute

**Citizen Reports → Reconciliation → Human Verification → Resource Delivery → Coverage**
