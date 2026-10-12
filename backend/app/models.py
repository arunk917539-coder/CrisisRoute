from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .db import Base

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True)
    report_type = Column(String, nullable=False)
    category = Column(String, nullable=False)
    description = Column(String, nullable=False)
    location = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    people_affected = Column(Integer, nullable=False, default=0)
    required_quantity = Column(Float, nullable=False, default=0)
    priority = Column(String, nullable=False, default="medium")
    timestamp = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=True)
    evidence_status = Column(String, nullable=False, default="none")
    evidence_source = Column(String, nullable=False, default="unspecified")
    evidence_note = Column(String, nullable=False, default="")
    evidence_observed_at = Column(DateTime, nullable=True)
    verification_status = Column(String, nullable=False, default="unverified")
    reviewed_at = Column(DateTime, nullable=True)
    review_note = Column(String, nullable=False, default="")
    is_synthetic = Column(Boolean, nullable=False, default=True)
    tracking_token_hash = Column(String, nullable=True)
    evidence_updated_at = Column(DateTime, nullable=True)
    last_confirmed_at = Column(DateTime, nullable=True)

class Relationship(Base):
    __tablename__ = "relationships"
    id = Column(Integer, primary_key=True)
    report_a_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    report_b_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    relationship_type = Column(String, nullable=False)
    similarity = Column(Float, nullable=False, default=0)
    reason = Column(String, nullable=False)
    decision = Column(String, nullable=False, default="unresolved")
    report_a = relationship("Report", foreign_keys=[report_a_id])
    report_b = relationship("Report", foreign_keys=[report_b_id])

class Need(Base):
    __tablename__ = "needs"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"), unique=True, nullable=False)
    verified_quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False, default="units")
    status = Column(String, nullable=False, default="verified")
    report = relationship("Report")

class Resource(Base):
    __tablename__ = "resources"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    resource_type = Column(String, nullable=False)
    unit = Column(String, nullable=False)
    location = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    available_quantity = Column(Float, nullable=False)
    status = Column(String, nullable=False, default="active")
    source = Column(String, nullable=False, default="synthetic demo")
    is_synthetic = Column(Boolean, nullable=False, default=True)


class Allocation(Base):
    __tablename__ = "allocations"
    id = Column(Integer, primary_key=True)
    need_id = Column(Integer, ForeignKey("needs.id"), nullable=False)
    resource_id = Column(Integer, ForeignKey("resources.id"), nullable=False)
    allocated_quantity = Column(Float, nullable=False)
    need = relationship("Need")
    resource = relationship("Resource")


class Delivery(Base):
    __tablename__ = "deliveries"
    id = Column(Integer, primary_key=True)
    need_id = Column(Integer, ForeignKey("needs.id"), nullable=False)
    allocation_id = Column(Integer, ForeignKey("allocations.id"), nullable=True)
    delivered_quantity = Column(Float, nullable=False)
    need = relationship("Need")
    allocation = relationship("Allocation")


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True)
    event_type = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer, nullable=False)
    summary = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    actor_name = Column(String, nullable=True)


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False, unique=True)
    display_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String, nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)


class FollowupQuestion(Base):
    __tablename__ = "followup_questions"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    question = Column(String, nullable=False)
    answer = Column(String, nullable=True)
    asked_by = Column(String, nullable=False)
    asked_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    answered_at = Column(DateTime, nullable=True)


class Photo(Base):
    __tablename__ = "photos"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    filename = Column(String, nullable=False)
    storage_name = Column(String, nullable=False, unique=True)
    content_type = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
