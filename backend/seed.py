from datetime import datetime, timedelta, timezone
from app.db import Base, engine, SessionLocal
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
    base_time = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    
    r1 = Report(
        report_type="relief",
        category="drinking water",
        description="Approximately 180 people are sheltering near the community school after flooding and require drinking water.",
        location="Kaveri Nagar — Community School",
        people_affected=180,
        required_quantity=500,
        timestamp=base_time - timedelta(minutes=60),
        evidence_status="photo",
        evidence_source="Community responder",
        evidence_note="Responder observed people sheltering at the school.",
        evidence_observed_at=base_time - timedelta(minutes=65),
        verification_status="unverified",
        is_synthetic=True
    )
    
    r2 = Report(
        report_type="relief",
        category="drinking water",
        description="Displaced families are gathered near the school and require drinking water.",
        location="Kaveri Nagar — Community School",
        people_affected=170,
        required_quantity=450,
        timestamp=base_time - timedelta(minutes=40),
        evidence_status="other",
        evidence_source="Local volunteer",
        evidence_note="Volunteer reports families gathered at the school.",
        evidence_observed_at=base_time - timedelta(minutes=45),
        verification_status="unverified",
        is_synthetic=True
    )
    
    db.add_all([r1, r2])
    db.flush()
    
    db.add(Relationship(
        report_a_id=r1.id,
        report_b_id=r2.id,
        relationship_type="possible_duplicate",
        similarity=0.92,
        reason="Same location and relief category",
        decision="unresolved"
    ))
    
    db.add(Resource(
        name="Emergency Drinking Water Stock",
        resource_type="drinking water",
        unit="bottles",
        location="Regional Distribution Center",
        available_quantity=400,
        status="active",
        source="synthetic demo inventory",
        is_synthetic=True
    ))
    
    db.add(AuditEvent(
        event_type="seed",
        entity_type="system",
        entity_id=0,
        summary="Deterministic demo dataset initialized for Kaveri Nagar scenario",
        created_at=base_time
    ))
    db.commit()


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        reset_demo_data(db)
        seed_demo_data(db)
        print("Reset to Kaveri Nagar deterministic demo scenario.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
