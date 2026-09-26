from datetime import datetime, timezone

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .db import Base, engine, get_db, ensure_schema
from .models import (
    Report,
    Relationship,
    Need,
    Delivery,
    Resource,
    Allocation,
    AuditEvent,
)
from .schemas import (
    RelationshipDecision,
    NeedCreate,
    DeliveryCreate,
    ReportCreate,
    PublicReportCreate,
    ResourceCreate,
    AllocationCreate,
)
from .reconcile import suggest_relationship, lexical_semantic_similarity


ensure_schema()

app = FastAPI(title="CrisisRoute API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def audit(
    db: Session,
    event_type: str,
    entity_type: str,
    entity_id: int,
    summary: str,
):
    db.add(
        AuditEvent(
            event_type=event_type,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
        )
    )


def iso(dt):
    return dt.isoformat() if dt else None


def public_request_id(report_id: int) -> str:
    return f"CR-{report_id}"


def parse_public_request_id(request_id: str) -> int:
    if not request_id.startswith("CR-"):
        raise HTTPException(400, "Invalid request ID")

    raw_id = request_id[3:]

    if not raw_id.isdigit() or int(raw_id) <= 0:
        raise HTTPException(400, "Invalid request ID")

    return int(raw_id)


def public_request_status(
    db: Session,
    report: Report,
) -> str:
    """
    Convert internal workflow state into a limited citizen-safe status.

    Internal reconciliation, evidence, resource, and audit details are
    intentionally not exposed by the public request endpoint.
    """
    need = (
        db.query(Need)
        .filter(Need.report_id == report.id)
        .first()
    )

    if not need:
        return "under_review"

    delivered = sum(
        x.delivered_quantity
        for x in db.query(Delivery)
        .filter(Delivery.need_id == need.id)
        .all()
    )

    if delivered >= need.verified_quantity:
        return "resolved"

    allocated = sum(
        x.allocated_quantity
        for x in db.query(Allocation)
        .filter(Allocation.need_id == need.id)
        .all()
    )

    if delivered > 0:
        return "in_progress"

    if allocated > 0:
        return "assigned"

    return "verified"


def public_request_response(
    db: Session,
    report: Report,
):
    return {
        "request_id": public_request_id(report.id),
        "status": public_request_status(db, report),
        "category": report.category,
        "description": report.description,
        "location": report.location,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "people_affected": report.people_affected,
        "required_quantity": report.required_quantity,
        "submitted_at": iso(report.timestamp),
    }


@app.get("/health")
def health():
    return {"status": "ok", "demo_data": "synthetic"}


# ---------------------------------------------------------------------------
# PUBLIC / CITIZEN REQUEST API
# ---------------------------------------------------------------------------

@app.post("/public/reports")
def create_public_report(
    payload: PublicReportCreate,
    db: Session = Depends(get_db),
):
    description = payload.description.strip()
    category = payload.category.strip()
    location = payload.location.strip()

    if not description or not category or not location:
        raise HTTPException(422, "Report text fields cannot be blank")

    if payload.report_type == "emergency" and payload.required_quantity != 0:
        raise HTTPException(
            422,
            "Emergency reports must use required_quantity 0",
        )

    if payload.report_type == "relief" and payload.required_quantity <= 0:
        raise HTTPException(
            422,
            "Relief reports require a positive required_quantity",
        )

    report = Report(
        report_type=payload.report_type,
        category=category,
        description=description,
        location=location,
        latitude=payload.latitude,
        longitude=payload.longitude,
        people_affected=payload.people_affected,
        required_quantity=payload.required_quantity,
        evidence_status="none",
        evidence_source="citizen submission",
        evidence_note="",
        evidence_observed_at=None,
        verification_status="unverified",
        is_synthetic=False,
    )

    db.add(report)
    db.flush()

    # Advisory reconciliation only.
    # A public submission may be compared with existing reports, but
    # reconciliation never automatically verifies or resolves anything.
    existing_reports = (
        db.query(Report)
        .filter(Report.id != report.id)
        .all()
    )

    for other in existing_reports:
        suggestion = suggest_relationship(report, other)

        if not suggestion:
            continue

        relationship_type, similarity, reason = suggestion
        low, high = sorted([report.id, other.id])

        already_exists = (
            db.query(Relationship)
            .filter(
                Relationship.report_a_id == low,
                Relationship.report_b_id == high,
            )
            .first()
        )

        if not already_exists:
            db.add(
                Relationship(
                    report_a_id=low,
                    report_b_id=high,
                    relationship_type=relationship_type,
                    similarity=similarity,
                    reason=reason,
                    decision="unresolved",
                )
            )

    audit(
        db,
        "public_report_created",
        "report",
        report.id,
        f"Citizen request {public_request_id(report.id)} submitted",
    )

    db.commit()
    db.refresh(report)

    return public_request_response(db, report)


@app.get("/public/requests/{request_id}")
def get_public_request(
    request_id: str,
    db: Session = Depends(get_db),
):
    report_id = parse_public_request_id(request_id)

    report = db.get(Report, report_id)

    if not report:
        raise HTTPException(404, "Request not found")

    return public_request_response(db, report)


@app.get("/public/requests")
def get_public_requests(
    request_ids: str = Query(
        ...,
        description="Comma-separated citizen request IDs such as CR-1,CR-3",
    ),
    db: Session = Depends(get_db),
):
    """
    Return citizen-safe projections only for request IDs supplied by the
    citizen frontend.

    This intentionally does not expose the complete internal report dataset.
    """
    raw_ids = [
        value.strip()
        for value in request_ids.split(",")
        if value.strip()
    ]

    if not raw_ids:
        raise HTTPException(400, "At least one request ID is required")

    if len(raw_ids) > 50:
        raise HTTPException(
            400,
            "A maximum of 50 request IDs can be requested at once",
        )

    report_ids = []

    for request_id in raw_ids:
        report_id = parse_public_request_id(request_id)

        if report_id not in report_ids:
            report_ids.append(report_id)

    reports_by_id = {}

    for report in (
        db.query(Report)
        .filter(Report.id.in_(report_ids))
        .all()
    ):
        reports_by_id[report.id] = report

    missing_ids = [
        request_id
        for request_id, report_id in zip(raw_ids, [
            parse_public_request_id(value)
            for value in raw_ids
        ])
        if report_id not in reports_by_id
    ]

    if missing_ids:
        raise HTTPException(
            404,
            f"Request not found: {missing_ids[0]}",
        )

    return {
        "count": len(report_ids),
        "items": [
            public_request_response(
                db,
                reports_by_id[report_id],
            )
            for report_id in report_ids
        ],
    }


# ---------------------------------------------------------------------------
# INTERNAL / RESPONDER REPORT API
# ---------------------------------------------------------------------------

@app.get("/reports")
def reports(db: Session = Depends(get_db)):
    return [
        {
            "id": r.id,
            "report_type": r.report_type,
            "category": r.category,
            "description": r.description,
            "location": r.location,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "people_affected": r.people_affected,
            "required_quantity": r.required_quantity,
            "timestamp": iso(r.timestamp),
            "evidence_status": r.evidence_status,
            "evidence_source": r.evidence_source,
            "evidence_note": r.evidence_note,
            "evidence_observed_at": iso(r.evidence_observed_at),
            "verification_status": r.verification_status,
            "is_synthetic": r.is_synthetic,
        }
        for r in db.query(Report).all()
    ]


@app.post("/reports")
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
):
    description = payload.description.strip()
    category = payload.category.strip()
    location = payload.location.strip()
    source = payload.evidence_source.strip()
    note = payload.evidence_note.strip()

    if not description or not category or not location or not source:
        raise HTTPException(422, "Report text fields cannot be blank")

    if payload.report_type == "emergency" and payload.required_quantity != 0:
        raise HTTPException(
            422,
            "Emergency reports must use required_quantity 0",
        )

    if payload.report_type == "relief" and payload.required_quantity <= 0:
        raise HTTPException(
            422,
            "Relief reports require a positive required_quantity",
        )

    if payload.evidence_status == "none" and note:
        # A note is allowed, but it must not imply unavailable evidence is verified.
        pass

    r = Report(
        report_type=payload.report_type,
        category=category,
        description=description,
        location=location,
        people_affected=payload.people_affected,
        required_quantity=payload.required_quantity,
        evidence_status=payload.evidence_status,
        evidence_source=source,
        evidence_note=note,
        evidence_observed_at=None,
        verification_status="unverified",
        is_synthetic=True,
    )

    db.add(r)
    db.flush()

    # Advisory reconciliation only: compare the new report with existing reports.
    # Never auto-verifies truth or auto-resolves a relationship.
    existing_reports = (
        db.query(Report)
        .filter(Report.id != r.id)
        .all()
    )

    for other in existing_reports:
        suggestion = suggest_relationship(r, other)

        if not suggestion:
            continue

        relationship_type, similarity, reason = suggestion
        low, high = sorted([r.id, other.id])

        already_exists = (
            db.query(Relationship)
            .filter(
                Relationship.report_a_id == low,
                Relationship.report_b_id == high,
            )
            .first()
        )

        if not already_exists:
            db.add(
                Relationship(
                    report_a_id=low,
                    report_b_id=high,
                    relationship_type=relationship_type,
                    similarity=similarity,
                    reason=reason,
                    decision="unresolved",
                )
            )

    audit(
        db,
        "report_created",
        "report",
        r.id,
        f"Synthetic report #{r.id} created through report intake",
    )

    db.commit()
    db.refresh(r)

    return {
        "id": r.id,
        "report_type": r.report_type,
        "category": r.category,
        "description": r.description,
        "location": r.location,
        "people_affected": r.people_affected,
        "required_quantity": r.required_quantity,
        "timestamp": iso(r.timestamp),
        "evidence_status": r.evidence_status,
        "evidence_source": r.evidence_source,
        "evidence_note": r.evidence_note,
        "evidence_observed_at": iso(r.evidence_observed_at),
        "verification_status": r.verification_status,
        "is_synthetic": r.is_synthetic,
    }


@app.get("/reports/{report_id}/evidence")
def report_evidence(
    report_id: int,
    db: Session = Depends(get_db),
):
    r = db.get(Report, report_id)

    if not r:
        raise HTTPException(404, "Report not found")

    age_minutes = None

    if r.evidence_observed_at:
        observed = (
            r.evidence_observed_at.replace(tzinfo=timezone.utc)
            if r.evidence_observed_at.tzinfo is None
            else r.evidence_observed_at
        )

        age_minutes = max(
            (datetime.now(timezone.utc) - observed).total_seconds() / 60,
            0,
        )

    freshness = (
        "unknown"
        if age_minutes is None
        else (
            "fresh"
            if age_minutes <= 60
            else "aging"
            if age_minutes <= 360
            else "stale"
        )
    )

    return {
        "report_id": r.id,
        "evidence_status": r.evidence_status,
        "evidence_source": r.evidence_source,
        "evidence_note": r.evidence_note,
        "observed_at": iso(r.evidence_observed_at),
        "age_minutes": (
            round(age_minutes, 1)
            if age_minutes is not None
            else None
        ),
        "freshness": freshness,
        "human_review_required": True,
    }


@app.post("/reports/{report_id}/evidence/review")
def review_evidence(
    report_id: int,
    db: Session = Depends(get_db),
):
    r = db.get(Report, report_id)

    if not r:
        raise HTTPException(404, "Report not found")

    existing = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.event_type == "evidence_reviewed",
            AuditEvent.entity_type == "report",
            AuditEvent.entity_id == r.id,
        )
        .first()
    )

    if existing:
        return {
            "report_id": r.id,
            "reviewed": True,
            "already_recorded": True,
        }

    audit(
        db,
        "evidence_reviewed",
        "report",
        r.id,
        f"Responder reviewed evidence context for report #{r.id}",
    )

    db.commit()

    return {
        "report_id": r.id,
        "reviewed": True,
        "already_recorded": False,
    }


# ---------------------------------------------------------------------------
# RECONCILIATION
# ---------------------------------------------------------------------------

@app.get("/relationships")
def relationships(db: Session = Depends(get_db)):
    return [
        {
            "id": x.id,
            "report_a_id": x.report_a_id,
            "report_b_id": x.report_b_id,
            "relationship_type": x.relationship_type,
            "similarity": x.similarity,
            "reason": x.reason,
            "decision": x.decision,
        }
        for x in db.query(Relationship).all()
    ]


@app.get("/reconciliation/queue")
def reconciliation_queue(db: Session = Depends(get_db)):
    rows = (
        db.query(Relationship)
        .filter(Relationship.decision == "unresolved")
        .order_by(Relationship.id.asc())
        .all()
    )

    result = []

    for x in rows:
        a = db.get(Report, x.report_a_id)
        b = db.get(Report, x.report_b_id)

        if not a or not b:
            continue

        def evidence(r):
            age_minutes = None

            if r.evidence_observed_at:
                observed = (
                    r.evidence_observed_at.replace(tzinfo=timezone.utc)
                    if r.evidence_observed_at.tzinfo is None
                    else r.evidence_observed_at
                )

                age_minutes = max(
                    (
                        datetime.now(timezone.utc) - observed
                    ).total_seconds()
                    / 60,
                    0,
                )

            freshness = (
                "unknown"
                if age_minutes is None
                else (
                    "fresh"
                    if age_minutes <= 60
                    else "aging"
                    if age_minutes <= 360
                    else "stale"
                )
            )

            return {
                "status": r.evidence_status,
                "source": r.evidence_source,
                "note": r.evidence_note,
                "observed_at": iso(r.evidence_observed_at),
                "freshness": freshness,
                "human_review_required": True,
            }

        result.append(
            {
                "relationship_id": x.id,
                "relationship_type": x.relationship_type,
                "similarity": x.similarity,
                "reason": x.reason,
                "decision_guidance": (
                    "Compare both reports and evidence before making "
                    "a human decision. Similarity or contradiction "
                    "signals are advisory only."
                ),
                "report_a": {
                    "id": a.id,
                    "report_type": a.report_type,
                    "category": a.category,
                    "description": a.description,
                    "location": a.location,
                    "people_affected": a.people_affected,
                    "required_quantity": a.required_quantity,
                    "timestamp": iso(a.timestamp),
                    "verification_status": a.verification_status,
                    "evidence": evidence(a),
                },
                "report_b": {
                    "id": b.id,
                    "report_type": b.report_type,
                    "category": b.category,
                    "description": b.description,
                    "location": b.location,
                    "people_affected": b.people_affected,
                    "required_quantity": b.required_quantity,
                    "timestamp": iso(b.timestamp),
                    "verification_status": b.verification_status,
                    "evidence": evidence(b),
                },
            }
        )

    return {
        "count": len(result),
        "items": result,
    }


@app.post("/relationships/{rid}/decision")
def relationship_decision(
    rid: int,
    payload: RelationshipDecision,
    db: Session = Depends(get_db),
):
    x = db.get(Relationship, rid)

    if not x:
        raise HTTPException(404, "Relationship not found")

    x.decision = payload.decision

    audit(
        db,
        "relationship_decision",
        "relationship",
        x.id,
        f"Responder marked relationship as {x.decision}",
    )

    db.commit()

    return {
        "id": x.id,
        "decision": x.decision,
    }


# ---------------------------------------------------------------------------
# VERIFICATION / NEEDS
# ---------------------------------------------------------------------------

@app.post("/needs")
def create_need(
    payload: NeedCreate,
    db: Session = Depends(get_db),
):
    r = db.get(Report, payload.report_id)

    if not r:
        raise HTTPException(404, "Report not found")

    if r.report_type != "relief":
        raise HTTPException(
            400,
            "Only relief reports can become needs",
        )

    evidence_reviewed = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.event_type == "evidence_reviewed",
            AuditEvent.entity_type == "report",
            AuditEvent.entity_id == r.id,
        )
        .first()
        is not None
    )

    if not evidence_reviewed:
        raise HTTPException(
            409,
            "Evidence must be explicitly reviewed before verification",
        )

    if payload.verified_quantity > r.required_quantity:
        raise HTTPException(
            400,
            "Verified quantity cannot exceed requested quantity",
        )

    if db.query(Need).filter_by(report_id=r.id).first():
        raise HTTPException(
            409,
            "Verified need already exists",
        )

    n = Need(
        report_id=r.id,
        verified_quantity=payload.verified_quantity,
        unit=payload.unit.strip(),
    )

    r.verification_status = "verified"

    db.add(n)
    db.flush()

    audit(
        db,
        "need_verified",
        "need",
        n.id,
        f"Responder verified {n.verified_quantity:g} units for report #{r.id}",
    )

    db.commit()
    db.refresh(n)

    return {
        "id": n.id,
        "report_id": n.report_id,
        "verified_quantity": n.verified_quantity,
        "unit": n.unit,
        "status": n.status,
    }


# ---------------------------------------------------------------------------
# RESOURCES
# ---------------------------------------------------------------------------

@app.post("/resources")
def create_resource(
    payload: ResourceCreate,
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    rtype = payload.resource_type.strip()
    unit = payload.unit.strip()
    location = payload.location.strip()
    source = payload.source.strip()

    if not all([name, rtype, unit, location, source]):
        raise HTTPException(
            422,
            "Resource text fields cannot be blank",
        )

    resource = Resource(
        name=name,
        resource_type=rtype,
        unit=unit,
        location=location,
        latitude=payload.latitude,
        longitude=payload.longitude,
        available_quantity=payload.available_quantity,
        status=payload.status,
        source=source,
        is_synthetic=True,
    )

    db.add(resource)
    db.flush()

    audit(
        db,
        "resource_created",
        "resource",
        resource.id,
        (
            f"Synthetic resource #{resource.id} created with "
            f"{resource.available_quantity:g} {resource.unit} available"
        ),
    )

    db.commit()
    db.refresh(resource)

    return {
        "id": resource.id,
        "name": resource.name,
        "resource_type": resource.resource_type,
        "unit": resource.unit,
        "location": resource.location,
        "available_quantity": resource.available_quantity,
        "status": resource.status,
        "source": resource.source,
        "is_synthetic": resource.is_synthetic,
    }


@app.get("/resources")
def resources(db: Session = Depends(get_db)):
    rows = (
        db.query(Resource)
        .order_by(Resource.id.asc())
        .all()
    )

    allocated = {}

    for a in db.query(Allocation).all():
        allocated[a.resource_id] = (
            allocated.get(a.resource_id, 0)
            + a.allocated_quantity
        )

    return [
        {
            "id": r.id,
            "name": r.name,
            "resource_type": r.resource_type,
            "unit": r.unit,
            "location": r.location,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "available_quantity": r.available_quantity,
            "allocated_quantity": allocated.get(r.id, 0),
            "status": r.status,
            "source": r.source,
            "is_synthetic": r.is_synthetic,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# ALLOCATION
# ---------------------------------------------------------------------------

@app.post("/allocations")
def create_allocation(
    payload: AllocationCreate,
    db: Session = Depends(get_db),
):
    need = db.get(Need, payload.need_id)

    if not need:
        raise HTTPException(404, "Need not found")

    resource = db.get(Resource, payload.resource_id)

    if not resource:
        raise HTTPException(404, "Resource not found")

    if need.status != "verified":
        raise HTTPException(
            409,
            "Only verified needs can receive allocations",
        )

    if resource.status != "active":
        raise HTTPException(
            409,
            "Only active resources can be allocated",
        )

    if need.unit.strip().lower() != resource.unit.strip().lower():
        raise HTTPException(
            400,
            (
                f"Unit mismatch: need uses {need.unit}, "
                f"resource uses {resource.unit}"
            ),
        )

    delivered = sum(
        x.delivered_quantity
        for x in db.query(Delivery)
        .filter_by(need_id=need.id)
        .all()
    )

    allocated = sum(
        x.allocated_quantity
        for x in db.query(Allocation)
        .filter_by(need_id=need.id)
        .all()
    )

    uncovered = max(
        need.verified_quantity - delivered,
        0,
    )

    if allocated + payload.allocated_quantity > uncovered:
        raise HTTPException(
            400,
            "Allocation exceeds the need's remaining uncovered quantity",
        )

    if payload.allocated_quantity > resource.available_quantity:
        raise HTTPException(
            400,
            "Allocation exceeds remaining resource availability",
        )

    allocation = Allocation(
        need_id=need.id,
        resource_id=resource.id,
        allocated_quantity=payload.allocated_quantity,
    )

    resource.available_quantity -= payload.allocated_quantity

    db.add(allocation)
    db.flush()

    audit(
        db,
        "resource_allocated",
        "allocation",
        allocation.id,
        (
            f"Responder allocated "
            f"{allocation.allocated_quantity:g} {resource.unit} "
            f"from resource #{resource.id} to need #{need.id}"
        ),
    )

    db.commit()
    db.refresh(allocation)

    return {
        "id": allocation.id,
        "need_id": allocation.need_id,
        "resource_id": allocation.resource_id,
        "allocated_quantity": allocation.allocated_quantity,
        "resource_remaining": resource.available_quantity,
    }


@app.get("/allocations")
def allocations(db: Session = Depends(get_db)):
    rows = (
        db.query(Allocation)
        .order_by(Allocation.id.asc())
        .all()
    )

    result = []

    for a in rows:
        delivered = sum(
            x.delivered_quantity
            for x in db.query(Delivery)
            .filter_by(allocation_id=a.id)
            .all()
        )

        result.append(
            {
                "id": a.id,
                "need_id": a.need_id,
                "resource_id": a.resource_id,
                "allocated_quantity": a.allocated_quantity,
                "delivered_quantity": delivered,
                "remaining_quantity": max(
                    a.allocated_quantity - delivered,
                    0,
                ),
            }
        )

    return result


# ---------------------------------------------------------------------------
# DELIVERY / COVERAGE
# ---------------------------------------------------------------------------

@app.post("/deliveries")
def create_delivery(
    payload: DeliveryCreate,
    db: Session = Depends(get_db),
):
    n = db.get(Need, payload.need_id)

    if not n:
        raise HTTPException(404, "Need not found")

    allocation = None

    if payload.allocation_id is not None:
        allocation = db.get(
            Allocation,
            payload.allocation_id,
        )

        if not allocation:
            raise HTTPException(404, "Allocation not found")

        if allocation.need_id != n.id:
            raise HTTPException(
                400,
                "Allocation does not belong to this need",
            )

        allocation_delivered = sum(
            x.delivered_quantity
            for x in db.query(Delivery)
            .filter_by(allocation_id=allocation.id)
            .all()
        )

        if (
            allocation_delivered + payload.delivered_quantity
            > allocation.allocated_quantity
        ):
            raise HTTPException(
                400,
                "Delivery exceeds allocated quantity",
            )

    delivered = sum(
        x.delivered_quantity
        for x in db.query(Delivery)
        .filter_by(need_id=n.id)
        .all()
    )

    if delivered + payload.delivered_quantity > n.verified_quantity:
        raise HTTPException(
            400,
            "Delivery exceeds verified requirement",
        )

    d = Delivery(
        need_id=n.id,
        allocation_id=payload.allocation_id,
        delivered_quantity=payload.delivered_quantity,
    )

    db.add(d)
    db.flush()

    audit(
        db,
        "delivery_recorded",
        "delivery",
        d.id,
        (
            f"Responder recorded "
            f"{d.delivered_quantity:g} units for need #{n.id}"
            + (
                f" from allocation #{allocation.id}"
                if allocation
                else ""
            )
        ),
    )

    db.commit()
    db.refresh(d)

    return {
        "id": d.id,
        "need_id": d.need_id,
        "allocation_id": d.allocation_id,
        "delivered_quantity": d.delivered_quantity,
    }


@app.get("/coverage")
def coverage(db: Session = Depends(get_db)):
    rows = []
    total_req = 0.0
    total_del = 0.0

    for n in db.query(Need).all():
        delivered = sum(
            x.delivered_quantity
            for x in db.query(Delivery)
            .filter_by(need_id=n.id)
            .all()
        )

        allocated = sum(
            x.allocated_quantity
            for x in db.query(Allocation)
            .filter_by(need_id=n.id)
            .all()
        )

        uncovered = max(
            n.verified_quantity - delivered,
            0,
        )

        remaining_to_allocate = max(
            uncovered - allocated,
            0,
        )

        total_req += n.verified_quantity
        total_del += delivered

        rows.append(
            {
                "need_id": n.id,
                "report_id": n.report_id,
                "verified_quantity": n.verified_quantity,
                "unit": n.unit,
                "allocated_quantity": allocated,
                "remaining_to_allocate": remaining_to_allocate,
                "delivered_quantity": delivered,
                "uncovered_quantity": uncovered,
                "coverage_percent": round(
                    (
                        delivered / n.verified_quantity * 100
                    )
                    if n.verified_quantity
                    else 0,
                    1,
                ),
            }
        )

    return {
        "total_verified": total_req,
        "total_delivered": total_del,
        "total_uncovered": max(
            total_req - total_del,
            0,
        ),
        "needs": rows,
    }


# ---------------------------------------------------------------------------
# DASHBOARD / AUDIT
# ---------------------------------------------------------------------------

@app.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    reports = db.query(Report).all()
    relationships = db.query(Relationship).all()
    needs = db.query(Need).all()

    pending_relationships = sum(
        1
        for x in relationships
        if x.decision == "unresolved"
    )

    unverified_reports = sum(
        1
        for x in reports
        if x.verification_status == "unverified"
    )

    uncovered_needs = 0

    for n in needs:
        delivered = sum(
            x.delivered_quantity
            for x in db.query(Delivery)
            .filter_by(need_id=n.id)
            .all()
        )

        if n.verified_quantity - delivered > 0:
            uncovered_needs += 1

    return {
        "report_count": len(reports),
        "unverified_report_count": unverified_reports,
        "pending_relationship_count": pending_relationships,
        "verified_need_count": len(needs),
        "uncovered_need_count": uncovered_needs,
        "recent_audit": [
            {
                "id": x.id,
                "event_type": x.event_type,
                "summary": x.summary,
                "created_at": iso(x.created_at),
            }
            for x in db.query(AuditEvent)
            .order_by(AuditEvent.id.desc())
            .limit(8)
            .all()
        ],
    }


@app.get("/audit")
def audit_log(
    limit: int = 20,
    db: Session = Depends(get_db),
):
    limit = min(max(limit, 1), 100)

    rows = (
        db.query(AuditEvent)
        .order_by(AuditEvent.id.desc())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": x.id,
            "event_type": x.event_type,
            "entity_type": x.entity_type,
            "entity_id": x.entity_id,
            "summary": x.summary,
            "created_at": iso(x.created_at),
        }
        for x in rows
    ]
