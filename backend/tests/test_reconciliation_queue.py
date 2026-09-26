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


def seed_queue_state():
    reset_db()
    db = SessionLocal()
    try:
        r1 = Report(report_type="relief", category="food", description="Need food packets", location="Area A", people_affected=42, required_quantity=100, evidence_status="photo", evidence_source="field photo", evidence_note="Synthetic photo marker", verification_status="unverified")
        r2 = Report(report_type="relief", category="food", description="Need food packets too", location="Area A", people_affected=40, required_quantity=80, evidence_status="none", evidence_source="report text", evidence_note="No supporting media", verification_status="unverified")
        r3 = Report(report_type="emergency", category="road", description="Road blocked", location="Bridge Road", verification_status="unverified")
        db.add_all([r1, r2, r3])
        db.flush()
        db.add(Relationship(report_a_id=r1.id, report_b_id=r2.id, relationship_type="possible_duplicate", similarity=.8, reason="Same location and relief category"))
        db.add(Relationship(report_a_id=r2.id, report_b_id=r3.id, relationship_type="possible_conflict", similarity=.45, reason="Contradictory status signals in reports", decision="accept"))
        db.commit()
    finally:
        db.close()


def test_queue_returns_only_unresolved_relationships():
    seed_queue_state()
    response = client.get('/reconciliation/queue')
    assert response.status_code == 200
    body = response.json()
    assert body['count'] == 1
    assert body['count'] == len(body['items'])
    assert body['items'][0]['relationship_id'] == 1


def test_queue_contains_actionable_comparison_context_and_evidence():
    seed_queue_state()
    item = client.get('/reconciliation/queue').json()['items'][0]
    for side in ('report_a', 'report_b'):
        report = item[side]
        assert {'id','report_type','category','description','location','people_affected','required_quantity','timestamp','verification_status','evidence'} <= report.keys()
        assert {'status','source','freshness'} <= report['evidence'].keys()
    assert item['relationship_type'] == 'possible_duplicate'
    assert item['reason']
    assert 0 <= item['similarity'] <= 1


def test_decision_removes_relationship_from_queue_and_is_audited():
    seed_queue_state()
    rid = client.get('/reconciliation/queue').json()['items'][0]['relationship_id']
    response = client.post(f'/relationships/{rid}/decision', json={'decision':'reject'})
    assert response.status_code == 200
    after = client.get('/reconciliation/queue').json()
    assert after['count'] == 0
    audit = client.get('/audit').json()
    assert any(x['event_type'] == 'relationship_decision' and x['entity_id'] == rid for x in audit)


def teardown_module():
    reset_db()


def test_queue_exposes_evidence_comparison_guardrails():
    seed_queue_state()
    data = client.get("/reconciliation/queue").json()
    item = data["items"][0]
    assert item["decision_guidance"]
    for key in ("report_a", "report_b"):
        evidence = item[key]["evidence"]
        assert "source" in evidence
        assert "note" in evidence
        assert "observed_at" in evidence
        assert "freshness" in evidence
        assert evidence["human_review_required"] is True


def test_queue_similarity_is_bounded():
    seed_queue_state()
    data = client.get("/reconciliation/queue").json()
    assert all(0 <= item["similarity"] <= 1 for item in data["items"])
