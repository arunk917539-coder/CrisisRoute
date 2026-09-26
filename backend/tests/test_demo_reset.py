import os
import subprocess
import sys
from pathlib import Path

os.chdir(os.path.dirname(os.path.dirname(__file__)))

from app.db import SessionLocal
from app.models import Report, Relationship, Need, Delivery, Resource, Allocation, AuditEvent

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_ROOT.parent


def snapshot():
    db = SessionLocal()
    try:
        return {
            "reports": db.query(Report).count(),
            "relationships": db.query(Relationship).count(),
            "needs": db.query(Need).count(),
            "deliveries": db.query(Delivery).count(),
        "allocations": db.query(Allocation).count(),
        "resources": db.query(Resource).count(),
            "audits": db.query(AuditEvent).count(),
            "seed_events": db.query(AuditEvent).filter_by(event_type="seed").count(),
        }
    finally:
        db.close()


def clear_db():
    db = SessionLocal()
    try:
        db.query(Delivery).delete()
        db.query(Allocation).delete()
        db.query(Need).delete()
        db.query(Resource).delete()
        db.query(AuditEvent).delete()
        db.query(Relationship).delete()
        db.query(Report).delete()
        db.commit()
    finally:
        db.close()


def create_stale_state():
    db = SessionLocal()
    try:
        report = Report(
            report_type="relief",
            category="food",
            description="Stale demo need",
            location="Old Area",
            required_quantity=100,
            verification_status="verified",
        )
        db.add(report)
        db.flush()
        need = Need(report_id=report.id, verified_quantity=100)
        db.add(need)
        db.flush()
        resource = Resource(name="Stale Resource", resource_type="food", unit="packets", location="Old Warehouse", available_quantity=50, status="active", source="stale demo", is_synthetic=True)
        db.add(resource)
        db.flush()
        db.add(Allocation(need_id=need.id, resource_id=resource.id, allocated_quantity=25))
        db.add(Delivery(need_id=need.id, delivered_quantity=25))
        db.add(AuditEvent(event_type="old_demo_event", entity_type="system", entity_id=0, summary="Stale demo state"))
        db.add(Relationship(
            report_a_id=report.id,
            report_b_id=report.id,
            relationship_type="possible_duplicate",
            similarity=0.5,
            reason="Stale demo relationship",
        ))
        db.commit()
    finally:
        db.close()


def expected_snapshot():
    return {
        "reports": 2,
        "relationships": 1,
        "needs": 0,
        "deliveries": 0,
        "audits": 1,
        "seed_events": 1,
        "resources": 1,
        "allocations": 0,
    }


def test_seed_reset_clears_stale_operational_data_and_is_idempotent():
    clear_db()
    subprocess.run([sys.executable, "seed.py"], check=True, cwd=BACKEND_ROOT)
    create_stale_state()
    assert snapshot()["needs"] == 1
    assert snapshot()["deliveries"] == 1
    assert snapshot()["allocations"] == 1
    assert snapshot()["resources"] == 2

    subprocess.run([sys.executable, "seed.py"], check=True, cwd=BACKEND_ROOT)
    first = snapshot()
    subprocess.run([sys.executable, "seed.py"], check=True, cwd=BACKEND_ROOT)
    second = snapshot()

    assert first == expected_snapshot()
    assert second == expected_snapshot()


def test_seed_and_reset_work_from_project_root():
    clear_db()
    subprocess.run([sys.executable, "backend/seed.py"], check=True, cwd=PROJECT_ROOT)
    assert snapshot() == expected_snapshot()

    clear_db()
    subprocess.run([sys.executable, "backend/reset_demo.py"], check=True, cwd=PROJECT_ROOT)
    assert snapshot() == expected_snapshot()


def teardown_module():
    clear_db()
