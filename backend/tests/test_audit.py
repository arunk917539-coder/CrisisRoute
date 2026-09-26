import os
os.chdir(os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Report, AuditEvent
from app.reconcile import contradiction_signal

client = TestClient(app)


def reset_db():
    db = SessionLocal()
    try:
        from app.models import Delivery, Allocation, Need, Resource, Relationship
        db.query(Delivery).delete()
        db.query(Allocation).delete()
        db.query(Need).delete()
        db.query(Relationship).delete()
        db.query(Resource).delete()
        db.query(AuditEvent).delete()
        db.query(Report).delete()
        db.commit()
    finally:
        db.close()


def test_audit_feature_does_not_change_contradiction_logic():
    assert contradiction_signal("Road blocked", "Road passable")


def test_audit_event_is_recorded_for_evidence_review():
    reset_db()
    db = SessionLocal()
    try:
        report = Report(
            report_type="relief",
            category="food",
            description="Need food packets",
            location="Area A",
            required_quantity=10,
            evidence_status="photo",
            evidence_source="field photo",
            evidence_note="Synthetic photo marker",
            verification_status="unverified",
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        report_id = report.id
    finally:
        db.close()

    response = client.post(f"/reports/{report_id}/evidence/review")
    assert response.status_code == 200
    assert response.json()["report_id"] == report_id
    assert response.json()["reviewed"] is True
    assert response.json()["already_recorded"] is False

    events = client.get("/audit").json()
    assert any(
        event["event_type"] == "evidence_reviewed"
        and event["entity_type"] == "report"
        and event["entity_id"] == report_id
        for event in events
    )


def teardown_module():
    reset_db()


def test_evidence_review_is_explicit_and_idempotent():
    reset_db()
    db = SessionLocal()
    try:
        r = Report(report_type="relief", category="food", description="Need food", location="Area A", required_quantity=10)
        db.add(r); db.commit(); report_id = r.id
    finally:
        db.close()

    before = client.get("/audit").json()
    first = client.post(f"/reports/{report_id}/evidence/review")
    assert first.status_code == 200
    assert first.json()["already_recorded"] is False
    middle = client.get("/audit").json()
    assert len(middle) == len(before) + 1
    assert middle[0]["event_type"] == "evidence_reviewed"

    second = client.post(f"/reports/{report_id}/evidence/review")
    assert second.status_code == 200
    assert second.json()["already_recorded"] is True
    after = client.get("/audit").json()
    assert len(after) == len(middle)


def test_verified_need_requires_explicit_evidence_review():
    reset_db()
    db = SessionLocal()
    try:
        r = Report(report_type="relief", category="food", description="Need food", location="Area A", required_quantity=10)
        db.add(r); db.commit(); report_id = r.id
    finally:
        db.close()

    blocked = client.post("/needs", json={"report_id": report_id, "verified_quantity": 5})
    assert blocked.status_code == 409

    reviewed = client.post(f"/reports/{report_id}/evidence/review")
    assert reviewed.status_code == 200
    allowed = client.post("/needs", json={"report_id": report_id, "verified_quantity": 5})
    assert allowed.status_code == 200
