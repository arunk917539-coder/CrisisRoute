import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import Report, Relationship
from app.reconcile import lexical_semantic_similarity, contradiction_signal

client = TestClient(app)

def clear_and_seed_test_data():
    db = SessionLocal()
    try:
        from app.models import Delivery, Need, Resource, Allocation, AuditEvent
        db.query(Delivery).delete()
        db.query(Allocation).delete()
        db.query(Need).delete()
        db.query(Resource).delete()
        db.query(AuditEvent).delete()
        db.query(Relationship).delete()
        db.query(Report).delete()
        
        r1 = Report(report_type="relief", category="food", description="42 people need food packets", location="Area A", required_quantity=500, verification_status="unverified")
        r2 = Report(report_type="relief", category="food", description="40 people need food packets at the same location", location="Area A", required_quantity=450, verification_status="unverified")
        db.add_all([r1, r2])
        db.flush()
        db.add(Relationship(report_a_id=r1.id, report_b_id=r2.id, relationship_type="possible_duplicate", similarity=.82, reason="Same location and relief category", decision="unresolved"))
        db.commit()
    finally:
        db.close()

def setup_module():
    clear_and_seed_test_data()

def teardown_module():
    clear_and_seed_test_data()

def test_semantic_similarity_is_bounded_and_deterministic():
    a = "42 people need food packets at Area A"
    b = "40 people require food packets in Area A"
    x = lexical_semantic_similarity(a, b)
    assert 0 <= x <= 1
    assert x == lexical_semantic_similarity(a, b)
    assert x > lexical_semantic_similarity(a, "road is clear at Bridge Road")

def test_contradiction_remains_advisory_signal():
    assert contradiction_signal("Road blocked by flood", "Road passable after water receded")

def test_new_report_creates_advisory_relationship_when_similar():
    payload = {
        "report_type":"relief","category":"food",
        "description":"Families need food packets at Area A",
        "location":"Area A","people_affected":10,"required_quantity":50,
        "evidence_status":"none","evidence_source":"synthetic intake",
        "evidence_note":"Synthetic M2.12 test report"
    }
    response = client.post("/reports", json=payload)
    assert response.status_code == 200
    new_id = response.json()["id"]
    db = SessionLocal()
    try:
        rels = db.query(Relationship).filter(
            (Relationship.report_a_id == new_id) | (Relationship.report_b_id == new_id)
        ).all()
        assert rels
        assert all(r.decision == "unresolved" for r in rels)
        assert all(0 <= r.similarity <= 1 for r in rels)
    finally:
        db.close()

def test_semantic_assistance_never_verifies_report():
    payload = {
        "report_type":"relief","category":"food",
        "description":"Food packets needed at Area A",
        "location":"Area A","people_affected":5,"required_quantity":20,
        "evidence_status":"none","evidence_source":"synthetic intake",
        "evidence_note":"Synthetic M2.12 test report"
    }
    response = client.post("/reports", json=payload)
    assert response.status_code == 200
    assert response.json()["verification_status"] == "unverified"

def test_reconciliation_queue_exposes_advisory_similarity():
    response = client.get("/reconciliation/queue")
    assert response.status_code == 200
    for item in response.json()["items"]:
        assert 0 <= item["similarity"] <= 1
        assert "advisory" in item["decision_guidance"].lower()


def test_negated_status_does_not_create_false_contradiction():
    assert contradiction_signal("Road is not blocked", "Road passable") is False
    assert contradiction_signal("Road is no longer flooded", "Road clear") is False


def test_distinct_reports_do_not_get_relationship_only_from_shared_location():
    payload = {
        "report_type":"relief","category":"water",
        "description":"Drinking water needed for families",
        "location":"Area A","people_affected":8,"required_quantity":30,
        "evidence_status":"none","evidence_source":"synthetic intake",
        "evidence_note":"Synthetic M2.12 negative test"
    }
    response = client.post("/reports", json=payload)
    assert response.status_code == 200
    new_id = response.json()["id"]
    db = SessionLocal()
    try:
        rels = db.query(Relationship).filter(
            (Relationship.report_a_id == new_id) | (Relationship.report_b_id == new_id)
        ).all()
        # The seeded Area A reports are food-related; shared location alone
        # must not create a water/food duplicate.
        assert all(r.report_a_id != new_id or r.report_b_id != 1 for r in rels)
        assert all(r.report_a_id != 2 or r.report_b_id != new_id for r in rels)
    finally:
        db.close()


def test_duplicate_relationship_pair_is_not_created_twice():
    payload = {
        "report_type":"relief","category":"food",
        "description":"Families need food packets at Area A",
        "location":"Area A","people_affected":10,"required_quantity":50,
        "evidence_status":"none","evidence_source":"synthetic intake",
        "evidence_note":"Synthetic duplicate-pair test"
    }
    response = client.post("/reports", json=payload)
    assert response.status_code == 200
    new_id = response.json()["id"]
    db = SessionLocal()
    try:
        rels = db.query(Relationship).filter(
            ((Relationship.report_a_id == new_id) | (Relationship.report_b_id == new_id))
        ).all()
        pairs=[tuple(sorted((r.report_a_id,r.report_b_id))) for r in rels]
        assert len(pairs) == len(set(pairs))
    finally:
        db.close()
