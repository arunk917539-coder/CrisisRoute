from datetime import datetime, timezone
from decimal import Decimal
import os

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
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
    ReportReview,
)
from .reconcile import suggest_relationship, normalized_category


ensure_schema()

app = FastAPI(title="CrisisRoute API")

CORS_ORIGINS = [origin.strip().rstrip("/") for origin in os.environ.get(
    "CRISISROUTE_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
).split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Invalid NaN/Infinity input must produce a serializable 422, not a 500
    # while FastAPI attempts to echo the non-finite input in its error body.
    return JSONResponse(status_code=422, content={"detail": [
        {"loc": list(error["loc"]), "msg": error["msg"], "type": error["type"]}
        for error in exc.errors()
    ]})


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
    if dt is None:
        return None
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).astimezone(timezone.utc).isoformat()


def evidence_was_reviewed(db: Session, report_id: int) -> bool:
    return db.query(AuditEvent).filter_by(
        event_type="evidence_reviewed", entity_type="report", entity_id=report_id,
    ).first() is not None


def touch_report(report: Report):
    report.updated_at = datetime.now(timezone.utc)


def quantity_sum(values):
    return float(sum((Decimal(str(value)) for value in values), Decimal(0)))


def quantity_remaining(required, covered):
    return max(float(Decimal(str(required)) - Decimal(str(covered))), 0.0)


def confirmed_duplicate_report_ids(db: Session, report_id: int):
    links = db.query(Relationship).filter_by(
        relationship_type="possible_duplicate", decision="accept",
    ).all()
    connected = {report_id}
    while True:
        previous = len(connected)
        for link in links:
            if link.report_a_id in connected or link.report_b_id in connected:
                connected.update((link.report_a_id, link.report_b_id))
        if len(connected) == previous:
            return connected


def need_coverage(db: Session, need: Need):
    deliveries = db.query(Delivery).filter_by(need_id=need.id).all()
    delivered = quantity_sum(item.delivered_quantity for item in deliveries)
    allocations = db.query(Allocation).filter_by(need_id=need.id).all()
    allocated = quantity_sum(item.allocated_quantity for item in allocations)
    # Completed allocation quantities are already included in deliveries. Only
    # their outstanding portions reserve any of the still-uncovered need.
    outstanding = quantity_sum(quantity_remaining(item.allocated_quantity, quantity_sum(
        delivery.delivered_quantity for delivery in deliveries if delivery.allocation_id == item.id
    )) for item in allocations)
    uncovered = quantity_remaining(need.verified_quantity, delivered)
    return {
        "need_id": need.id,
        "report_id": need.report_id,
        "verified_quantity": need.verified_quantity,
        "unit": need.unit,
        "allocated_quantity": allocated,
        "outstanding_allocated_quantity": outstanding,
        "remaining_to_allocate": quantity_remaining(uncovered, outstanding),
        "delivered_quantity": delivered,
        "uncovered_quantity": uncovered,
        "coverage_percent": round(delivered / need.verified_quantity * 100, 1) if need.verified_quantity else 0,
        "coverage_status": "covered" if uncovered == 0 else "partial" if delivered else "uncovered",
    }


def report_response(db: Session, report: Report):
    return {
        "id": report.id,
        "report_type": report.report_type,
        "category": report.category,
        "description": report.description,
        "location": report.location,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "people_affected": report.people_affected,
        "required_quantity": report.required_quantity,
        "priority": report.priority,
        "timestamp": iso(report.timestamp),
        "updated_at": iso(report.updated_at or report.timestamp),
        "evidence_status": report.evidence_status,
        "evidence_source": report.evidence_source,
        "evidence_note": report.evidence_note,
        "evidence_observed_at": iso(report.evidence_observed_at),
        "evidence_reviewed": evidence_was_reviewed(db, report.id),
        "verification_status": report.verification_status,
        "reviewed_at": iso(report.reviewed_at),
        "review_note": report.review_note,
        "is_synthetic": report.is_synthetic,
    }


def public_request_id(report_id: int) -> str:
    return f"CR-{report_id}"


def parse_public_request_id(request_id: str) -> int:
    if not request_id.startswith("CR-"):
        raise HTTPException(400, "Invalid request ID")

    raw_id = request_id[3:]

    if not raw_id.isascii() or not raw_id.isdigit() or len(raw_id) > 19 or not 0 < int(raw_id) <= 9223372036854775807:
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

    if report.verification_status in ("rejected", "unresolved"):
        return report.verification_status

    if not need:
        return "verified" if report.verification_status == "verified" else "under_review"

    delivered = quantity_sum(
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
    need = db.query(Need).filter_by(report_id=report.id).first()
    return {
        "request_id": public_request_id(report.id),
        "status": public_request_status(db, report),
        "report_type": report.report_type,
        "priority": report.priority,
        "category": report.category,
        "description": report.description,
        "location": report.location,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "people_affected": report.people_affected,
        "required_quantity": report.required_quantity,
        "submitted_at": iso(report.timestamp),
        "reviewed_at": iso(report.reviewed_at),
        "review_note": report.review_note,
        "updated_at": iso(report.updated_at or report.timestamp),
        "coverage": need_coverage(db, need) if need else None,
    }


@app.get("/health")
def health():
    return {"status": "ok", "reconciliation": "offline lexical advisory", "human_review_required": True}


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
        priority=payload.priority,
        evidence_status="other" if payload.evidence_note else "none",
        evidence_source="citizen submission",
        evidence_note=payload.evidence_note,
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
    return [report_response(db, r) for r in db.query(Report).order_by(Report.id.desc()).all()]


@app.get("/reports/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db)):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    return report_response(db, report)


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
        latitude=payload.latitude,
        longitude=payload.longitude,
        people_affected=payload.people_affected,
        required_quantity=payload.required_quantity,
        priority=payload.priority,
        evidence_status=payload.evidence_status,
        evidence_source=source,
        evidence_note=note,
        evidence_observed_at=payload.evidence_observed_at,
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

    return report_response(db, r)


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
        "reviewed": evidence_was_reviewed(db, r.id),
        "human_review_required": not evidence_was_reviewed(db, r.id),
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
    touch_report(r)

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
                "reviewed": evidence_was_reviewed(db, r.id),
                "human_review_required": not evidence_was_reviewed(db, r.id),
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
                    "priority": a.priority,
                    "latitude": a.latitude,
                    "longitude": a.longitude,
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
                    "priority": b.priority,
                    "latitude": b.latitude,
                    "longitude": b.longitude,
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

    if payload.decision == "accept" and x.relationship_type == "possible_duplicate":
        report_ids = confirmed_duplicate_report_ids(db, x.report_a_id) | confirmed_duplicate_report_ids(db, x.report_b_id)
        if db.query(Need).filter(Need.report_id.in_(report_ids)).count() > 1:
            raise HTTPException(409, "Both duplicate report groups already contain verified needs; accepting would double-count the same need")

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

def verify_relief_need(db: Session, report: Report, quantity: float, unit: str):
    if report.report_type != "relief":
        raise HTTPException(400, "Only relief reports can become needs")
    if not evidence_was_reviewed(db, report.id):
        raise HTTPException(409, "Evidence must be explicitly reviewed before verification")
    if quantity > report.required_quantity:
        raise HTTPException(400, "Verified quantity cannot exceed requested quantity")
    if db.query(Need).filter_by(report_id=report.id).first():
        raise HTTPException(409, "Verified need already exists")

    # An accepted duplicate is a human decision. Do not count a second
    # operational need when that same confirmed need is already represented.
    duplicate_need = db.query(Need).filter(
        Need.report_id.in_(confirmed_duplicate_report_ids(db, report.id)),
    ).first()
    if duplicate_need:
        raise HTTPException(409, f"Accepted duplicate report #{duplicate_need.report_id} already has a verified need; reconcile the relationship before creating another")

    need = Need(report_id=report.id, verified_quantity=quantity, unit=unit.strip())
    report.verification_status = "verified"
    report.reviewed_at = datetime.now(timezone.utc)
    touch_report(report)
    db.add(need)
    db.flush()
    audit(db, "need_verified", "need", need.id,
          f"Responder verified {need.verified_quantity:g} {need.unit} for report #{report.id}")
    return need


@app.post("/needs")
def create_need(payload: NeedCreate, db: Session = Depends(get_db)):
    report = db.get(Report, payload.report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    need = verify_relief_need(db, report, payload.verified_quantity, payload.unit)
    db.commit()
    db.refresh(need)
    return {
        "id": need.id, "report_id": need.report_id,
        "verified_quantity": need.verified_quantity, "unit": need.unit, "status": need.status,
    }


@app.post("/reports/{report_id}/review")
def review_report(report_id: int, payload: ReportReview, db: Session = Depends(get_db)):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    need = db.query(Need).filter_by(report_id=report.id).first()
    if payload.decision == "accept":
        if not evidence_was_reviewed(db, report.id):
            raise HTTPException(409, "Evidence must be explicitly reviewed before verification")
        if report.report_type == "relief":
            if payload.verified_quantity is None:
                raise HTTPException(422, "Accepting a relief report requires verified_quantity")
            if need is None:
                need = verify_relief_need(db, report, payload.verified_quantity, payload.unit)
            elif need.verified_quantity != payload.verified_quantity or need.unit.lower() != payload.unit.lower():
                raise HTTPException(409, "An existing verified need cannot be changed through report review")
        elif payload.verified_quantity is not None:
            raise HTTPException(422, "Emergency verification does not create a quantity-based need")
        report.verification_status = "verified"
    else:
        if need is not None:
            raise HTTPException(409, "A report with a verified need cannot be rejected or marked unresolved")
        if payload.verified_quantity is not None:
            raise HTTPException(422, "Only acceptance can specify a verified quantity")
        report.verification_status = "rejected" if payload.decision == "reject" else "unresolved"
    report.review_note = payload.note
    report.reviewed_at = datetime.now(timezone.utc)
    touch_report(report)
    audit(db, "report_reviewed", "report", report.id,
          f"Responder marked report #{report.id} as {report.verification_status}" + (f": {payload.note}" if payload.note else ""))
    db.commit()
    return {
        "report_id": report.id, "verification_status": report.verification_status,
        "reviewed_at": iso(report.reviewed_at), "review_note": report.review_note,
        "need_id": need.id if need else None,
    }


@app.get("/map/needs")
def map_needs(db: Session = Depends(get_db)):
    needs = db.query(Need).all()
    items = []
    active_count = 0
    active_people = 0

    for n in needs:
        r = db.get(Report, n.report_id)
        if not r:
            continue
        if r.latitude is None or r.longitude is None:
            continue

        quantities = need_coverage(db, n)
        delivered = quantities["delivered_quantity"]
        allocated = quantities["allocated_quantity"]
        uncovered = quantities["uncovered_quantity"]
        coverage_percent = quantities["coverage_percent"]

        if uncovered > 0:
            active_count += 1
            active_people += r.people_affected

        items.append(
            {
                "need_id": n.id,
                "report_id": r.id,
                "latitude": r.latitude,
                "longitude": r.longitude,
                "location": r.location,
                "category": r.category,
                "people_affected": r.people_affected,
                "verified_quantity": n.verified_quantity,
                "unit": n.unit,
                "allocated_quantity": allocated,
                "outstanding_allocated_quantity": quantities["outstanding_allocated_quantity"],
                "remaining_to_allocate": quantities["remaining_to_allocate"],
                "delivered_quantity": delivered,
                "uncovered_quantity": uncovered,
                "coverage_percent": coverage_percent,
            }
        )

    return {
        "active_verified_needs_count": active_count,
        "active_people_affected": active_people,
        "items": items,
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

    report = db.get(Report, need.report_id)
    if normalized_category(report.category) != normalized_category(resource.resource_type):
        raise HTTPException(400, f"Resource type mismatch: need is {report.category}, resource is {resource.resource_type}")

    gap = need_coverage(db, need)["remaining_to_allocate"]
    if payload.allocated_quantity > gap:
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

    resource.available_quantity = quantity_remaining(resource.available_quantity, payload.allocated_quantity)
    touch_report(report)

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
        delivered = quantity_sum(
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
                "remaining_quantity": quantity_remaining(a.allocated_quantity, delivered),
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

        allocation_delivered = quantity_sum(
            x.delivered_quantity
            for x in db.query(Delivery)
            .filter_by(allocation_id=allocation.id)
            .all()
        )

        if (
            quantity_sum((allocation_delivered, payload.delivered_quantity))
            > allocation.allocated_quantity
        ):
            raise HTTPException(
                400,
                "Delivery exceeds allocated quantity",
            )

    delivered = quantity_sum(
        x.delivered_quantity
        for x in db.query(Delivery)
        .filter_by(need_id=n.id)
        .all()
    )

    if quantity_sum((delivered, payload.delivered_quantity)) > n.verified_quantity:
        raise HTTPException(
            400,
            "Delivery exceeds verified requirement",
        )

    if payload.allocation_id is None and payload.delivered_quantity > need_coverage(db, n)["remaining_to_allocate"]:
        raise HTTPException(400, "This quantity is already reserved by an allocation; select its allocation when recording delivery")

    d = Delivery(
        need_id=n.id,
        allocation_id=payload.allocation_id,
        delivered_quantity=payload.delivered_quantity,
    )

    db.add(d)
    touch_report(db.get(Report, n.report_id))
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
    rows = [need_coverage(db, need) for need in db.query(Need).order_by(Need.id).all()]
    totals_by_unit = {}
    for row in rows:
        unit = row["unit"].strip().lower()
        totals = totals_by_unit.setdefault(unit, {"verified": 0, "delivered": 0, "uncovered": 0})
        totals["verified"] = quantity_sum((totals["verified"], row["verified_quantity"]))
        totals["delivered"] = quantity_sum((totals["delivered"], row["delivered_quantity"]))
        totals["uncovered"] = quantity_sum((totals["uncovered"], row["uncovered_quantity"]))
    return {
        "total_verified": quantity_sum(row["verified_quantity"] for row in rows),
        "total_delivered": quantity_sum(row["delivered_quantity"] for row in rows),
        "total_uncovered": quantity_sum(row["uncovered_quantity"] for row in rows),
        "totals_by_unit": totals_by_unit,
        "totals_comparable": len(totals_by_unit) <= 1,
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
        delivered = quantity_sum(
            x.delivered_quantity
            for x in db.query(Delivery)
            .filter_by(need_id=n.id)
            .all()
        )

        if quantity_remaining(n.verified_quantity, delivered) > 0:
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
