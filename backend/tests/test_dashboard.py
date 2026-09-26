import os
os.chdir(os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Report, Relationship, Need, Delivery, AuditEvent

client = TestClient(app)


def reset_db():
    db = SessionLocal()
    try:
        db.query(Delivery).delete()
        db.query(Need).delete()
        db.query(Relationship).delete()
        db.query(Report).delete()
        db.query(AuditEvent).delete()
        db.commit()
    finally:
        db.close()


def seed_dashboard_state():
    reset_db()
    db = SessionLocal()
    try:
        r1 = Report(report_type="relief", category="food", description="Need food", location="Area A", required_quantity=100, verification_status="unverified")
        r2 = Report(report_type="relief", category="food", description="Need food too", location="Area A", required_quantity=50, verification_status="verified")
        r3 = Report(report_type="emergency", category="road", description="Road blocked", location="Bridge Road", verification_status="unverified")
        db.add_all([r1, r2, r3])
        db.flush()
        db.add(Relationship(report_a_id=r1.id, report_b_id=r2.id, relationship_type="possible_duplicate", similarity=.8, reason="Same location"))
        db.add(Relationship(report_a_id=r2.id, report_b_id=r3.id, relationship_type="possible_conflict", similarity=.4, reason="Different status", decision="accept"))
        need = Need(report_id=r2.id, verified_quantity=50)
        db.add(need)
        db.flush()
        db.add(Delivery(need_id=need.id, delivered_quantity=20))
        db.add(AuditEvent(event_type="test", entity_type="system", entity_id=0, summary="Dashboard test event"))
        db.commit()
    finally:
        db.close()


def teardown_module():
    reset_db()


def test_dashboard_counts_and_recent_audit():
    seed_dashboard_state()
    response = client.get("/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert data["report_count"] == 3
    assert data["unverified_report_count"] == 2
    assert data["pending_relationship_count"] == 1
    assert data["verified_need_count"] == 1
    assert data["uncovered_need_count"] == 1
    assert data["recent_audit"][0]["event_type"] == "test"


def test_dashboard_updates_after_need_becomes_fully_covered():
    seed_dashboard_state()
    db = SessionLocal()
    try:
        need = db.query(Need).first()
        db.add(Delivery(need_id=need.id, delivered_quantity=30))
        db.commit()
    finally:
        db.close()

    response = client.get("/dashboard")
    assert response.status_code == 200
    assert response.json()["uncovered_need_count"] == 0
