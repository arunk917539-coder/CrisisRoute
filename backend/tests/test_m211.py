
import os
os.chdir(os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Report, AuditEvent

client = TestClient(app)


def reset():
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


def test_create_synthetic_report_persists_and_is_audited():
    reset()
    response = client.post("/reports", json={
        "report_type": "relief",
        "category": "water",
        "description": "Twenty families need drinking water",
        "location": "Demo Area",
        "people_affected": 20,
        "required_quantity": 200,
        "evidence_status": "none",
        "evidence_source": "report text",
        "evidence_note": "Synthetic intake test",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["is_synthetic"] is True
    assert data["verification_status"] == "unverified"

    db = SessionLocal()
    try:
        r = db.get(Report, data["id"])
        assert r is not None
        assert r.is_synthetic is True
        event = db.query(AuditEvent).filter_by(
            event_type="report_created",
            entity_type="report",
            entity_id=r.id,
        ).one()
        assert "Synthetic report" in event.summary
    finally:
        db.close()


def test_report_intake_rejects_invalid_relief_quantity_and_bad_type():
    reset()
    bad_relief = client.post("/reports", json={
        "report_type": "relief",
        "category": "food",
        "description": "Families need food",
        "location": "Demo Area",
        "people_affected": 10,
        "required_quantity": 0,
    })
    assert bad_relief.status_code == 422

    bad_type = client.post("/reports", json={
        "report_type": "unknown",
        "category": "food",
        "description": "Families need food",
        "location": "Demo Area",
        "people_affected": 10,
        "required_quantity": 10,
    })
    assert bad_type.status_code == 422


def test_report_intake_rejects_negative_people_and_emergency_quantity():
    reset()
    negative_people = client.post("/reports", json={
        "report_type": "emergency",
        "category": "road",
        "description": "Road blocked",
        "location": "Bridge Road",
        "people_affected": -1,
        "required_quantity": 0,
    })
    assert negative_people.status_code == 422

    emergency_quantity = client.post("/reports", json={
        "report_type": "emergency",
        "category": "road",
        "description": "Road blocked",
        "location": "Bridge Road",
        "people_affected": 0,
        "required_quantity": 10,
    })
    assert emergency_quantity.status_code == 422


def test_created_report_appears_in_reports_and_starts_unverified():
    reset()
    response = client.post("/reports", json={
        "report_type": "emergency",
        "category": "road",
        "description": "Bridge Road is blocked",
        "location": "Bridge Road",
        "people_affected": 0,
        "required_quantity": 0,
        "evidence_source": "synthetic intake",
    })
    assert response.status_code == 200
    report_id = response.json()["id"]

    listed = client.get("/reports")
    assert listed.status_code == 200
    item = next(x for x in listed.json() if x["id"] == report_id)
    assert item["verification_status"] == "unverified"
    assert item["is_synthetic"] is True


def teardown_module():
    reset()
