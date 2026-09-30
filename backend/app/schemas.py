from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, str_strip_whitespace=True)


class Coordinates(InputModel):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinate_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be supplied together")
        return self


class RelationshipDecision(InputModel):
    decision: Literal["accept", "reject", "unresolved"]


class ReportReview(InputModel):
    decision: Literal["accept", "reject", "unresolved"]
    note: str = Field(default="", max_length=1000)
    verified_quantity: float | None = Field(default=None, gt=0, le=1_000_000_000)
    unit: str = Field(default="units", min_length=1, max_length=40)


class NeedCreate(InputModel):
    report_id: int = Field(gt=0)
    verified_quantity: float = Field(gt=0, le=1_000_000_000)
    unit: str = Field(default="units", min_length=1, max_length=40)


class DeliveryCreate(InputModel):
    need_id: int = Field(gt=0)
    delivered_quantity: float = Field(gt=0, le=1_000_000_000)
    allocation_id: int | None = Field(default=None, gt=0)


class ResourceCreate(Coordinates):
    name: str = Field(min_length=2, max_length=120)
    resource_type: str = Field(min_length=2, max_length=80)
    unit: str = Field(min_length=1, max_length=40)
    location: str = Field(min_length=2, max_length=200)
    available_quantity: float = Field(gt=0, le=1_000_000_000)
    source: str = Field(min_length=2, max_length=200)
    status: Literal["active", "inactive"] = "active"


class AllocationCreate(InputModel):
    need_id: int = Field(gt=0)
    resource_id: int = Field(gt=0)
    allocated_quantity: float = Field(gt=0, le=1_000_000_000)


class PublicReportCreate(Coordinates):
    report_type: Literal["relief", "emergency"]
    category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=5, max_length=500)
    location: str = Field(min_length=2, max_length=200)
    people_affected: int = Field(ge=0, le=10_000_000)
    required_quantity: float = Field(ge=0, le=1_000_000_000)
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    evidence_note: str = Field(default="", max_length=1000)


class ReportCreate(PublicReportCreate):
    evidence_status: Literal["none", "photo", "document", "other"] = "none"
    evidence_source: str = Field(min_length=2, max_length=200)
    evidence_observed_at: datetime | None = None

    @field_validator("evidence_observed_at")
    @classmethod
    def observation_in_utc(cls, value):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
