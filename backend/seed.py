from datetime import datetime, timedelta, timezone
from app.db import SessionLocal, ensure_schema
from app.models import Report, Relationship, Need, Delivery, Resource, Allocation, AuditEvent


def reset_demo_data(db):
    # Delete child records before parent records so repeated resets are safe.
    db.query(Delivery).delete()
    db.query(Allocation).delete()
    db.query(Need).delete()
    db.query(Resource).delete()
    db.query(AuditEvent).delete()
    db.query(Relationship).delete()
    db.query(Report).delete()
    db.commit()


def seed_demo_data(db):
    # Relative offsets make freshness meaningful whenever this synthetic
    # scenario is reset. IDs, quantities, and locations remain predictable.
    base_time = datetime.now(timezone.utc)
    
    r1 = Report(
        report_type="relief",
        category="drinking water",
        description="Approximately 180 people are sheltering near the community school after flooding and require drinking water.",
        location="Kaveri Nagar — Community School",
        latitude=12.9716,
        longitude=77.5946,
        priority="high",
        people_affected=180,
        required_quantity=500,
        timestamp=base_time - timedelta(minutes=20),
        evidence_status="other",
        evidence_source="Community responder",
        evidence_note="Synthetic field observation: people sheltering at the school. No photo is attached.",
        evidence_observed_at=base_time - timedelta(minutes=25),
        verification_status="unverified",
        is_synthetic=True
    )
    
    r2 = Report(
        report_type="relief",
        category="drinking water",
        description="Displaced families are gathered near the school and require drinking water.",
        location="Kaveri Nagar — Community School",
        latitude=12.9717,
        longitude=77.5947,
        priority="high",
        people_affected=170,
        required_quantity=450,
        timestamp=base_time - timedelta(minutes=110),
        evidence_status="other",
        evidence_source="Local volunteer",
        evidence_note="Synthetic volunteer observation: families gathered at the school; quantity differs from the newer report.",
        evidence_observed_at=base_time - timedelta(minutes=120),
        verification_status="unverified",
        is_synthetic=True
    )
    
    db.add_all([r1, r2])
    db.flush()
    
    db.add(Relationship(
        report_a_id=r1.id,
        report_b_id=r2.id,
        relationship_type="possible_duplicate",
        similarity=0.66,
        reason="Synthetic scenario: same school and water category; reported quantities differ (500 versus 450). Human reconciliation required.",
        decision="unresolved"
    ))

    road_blocked = Report(
        report_type="emergency", category="road", description="Synthetic scenario: access road at the bridge is blocked by flood water.",
        location="Kaveri Nagar — Bridge", latitude=12.9770, longitude=77.5990,
        priority="critical", people_affected=0, required_quantity=0,
        timestamp=base_time - timedelta(hours=8), evidence_status="other",
        evidence_source="Synthetic field team", evidence_note="Historical demo observation; may now be stale.",
        evidence_observed_at=base_time - timedelta(hours=8), is_synthetic=True,
    )
    road_passable = Report(
        report_type="emergency", category="road", description="Synthetic scenario: access road at the bridge is passable after water receded.",
        location="Kaveri Nagar — Bridge", latitude=12.9770, longitude=77.5990,
        priority="high", people_affected=0, required_quantity=0,
        timestamp=base_time - timedelta(minutes=5), evidence_status="other",
        evidence_source="Synthetic responder", evidence_note="Newer demo observation. Human review must determine current access conditions.",
        evidence_observed_at=base_time - timedelta(minutes=5), is_synthetic=True,
    )
    db.add_all([road_blocked, road_passable])
    db.flush()
    db.add(Relationship(
        report_a_id=road_blocked.id, report_b_id=road_passable.id,
        relationship_type="possible_conflict", similarity=0.7,
        reason="Synthetic scenario: blocked versus passable at the same bridge; compare fresh and stale evidence.",
        decision="unresolved",
    ))
    
    db.add(Resource(
        name="Emergency Drinking Water Stock",
        resource_type="drinking water",
        unit="bottles",
        location="Regional Distribution Center",
        latitude=12.9680,
        longitude=77.5890,
        available_quantity=400,
        status="active",
        source="synthetic demo inventory",
        is_synthetic=True
    ))
    
    db.add(AuditEvent(
        event_type="seed",
        entity_type="system",
        entity_id=0,
        summary="Synthetic demo dataset initialized: water duplicates, conflicting bridge reports, and water inventory",
        created_at=base_time
    ))
    db.commit()


def main():
    ensure_schema()
    db = SessionLocal()
    try:
        reset_demo_data(db)
        seed_demo_data(db)
        print("Reset to Kaveri Nagar deterministic demo scenario.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
