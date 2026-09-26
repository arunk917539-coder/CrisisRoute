import os
os.chdir(os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Report, Relationship, Need, Delivery, Allocation, AuditEvent, Resource

client = TestClient(app)


def reset_db():
    db = SessionLocal()
    try:
        db.query(Delivery).delete()
        db.query(Allocation).delete()
        db.query(Need).delete()
        db.query(Resource).delete()
        db.query(Relationship).delete()
        db.query(Report).delete()
        db.query(AuditEvent).delete()
        db.commit()
    finally:
        db.close()


def teardown_module():
    reset_db()


def test_map_needs_raw_report_exclusion_and_null_coordinates():
    reset_db()
    db = SessionLocal()
    try:
        # REPORT A: Has coordinates, but NO Verified Need exists
        r_a = Report(
            report_type="relief",
            category="food",
            description="Raw unverified report with coords",
            location="Location A",
            latitude=12.9716,
            longitude=77.5946,
            people_affected=10,
            required_quantity=50,
            verification_status="unverified"
        )

        # REPORT B: Has coordinates, AND Verified Need exists
        r_b = Report(
            report_type="relief",
            category="water",
            description="Verified report with coords",
            location="Location B",
            latitude=13.0827,
            longitude=80.2707,
            people_affected=25,
            required_quantity=100,
            verification_status="verified"
        )

        # REPORT C: Has NO coordinates (null), but Verified Need exists
        r_c = Report(
            report_type="relief",
            category="medical",
            description="Verified report without coords",
            location="Location C",
            latitude=None,
            longitude=None,
            people_affected=40,
            required_quantity=20,
            verification_status="verified"
        )

        db.add_all([r_a, r_b, r_c])
        db.flush()

        need_b = Need(report_id=r_b.id, verified_quantity=100, unit="liters")
        need_c = Need(report_id=r_c.id, verified_quantity=20, unit="kits")
        db.add_all([need_b, need_c])
        db.commit()

        need_b_id = need_b.id
        report_a_id = r_a.id
        report_b_id = r_b.id
        report_c_id = r_c.id
    finally:
        db.close()

    response = client.get("/map/needs")
    assert response.status_code == 200
    data = response.json()

    items = data["items"]
    report_ids_on_map = [item["report_id"] for item in items]

    # Critical assertions:
    # REPORT A (coords, no need) -> MUST BE ABSENT
    assert report_a_id not in report_ids_on_map, "Report A without Verified Need must not appear on map"

    # REPORT B (coords, has need) -> MUST BE PRESENT
    assert report_b_id in report_ids_on_map, "Report B with Verified Need and coords must appear on map"

    # REPORT C (no coords, has need) -> MUST BE ABSENT
    assert report_c_id not in report_ids_on_map, "Report C with null coords must not appear on map"

    # Single item on map: Report B
    assert len(items) == 1
    item_b = items[0]
    assert item_b["need_id"] == need_b_id
    assert item_b["report_id"] == report_b_id
    assert item_b["latitude"] == 13.0827
    assert item_b["longitude"] == 80.2707
    assert item_b["category"] == "water"
    assert item_b["people_affected"] == 25
    assert item_b["verified_quantity"] == 100.0
    assert item_b["allocated_quantity"] == 0.0
    assert item_b["delivered_quantity"] == 0.0
    assert item_b["uncovered_quantity"] == 100.0
    assert item_b["coverage_percent"] == 0.0

    # Active metrics check
    assert data["active_verified_needs_count"] == 1
    assert data["active_people_affected"] == 25
