from pydantic import BaseModel, Field

class RelationshipDecision(BaseModel):
    model_config = {"extra": "forbid"}
    decision: str = Field(pattern="^(accept|reject|unresolved)$")
class NeedCreate(BaseModel):
    model_config = {"extra": "forbid"}
    report_id: int = Field(gt=0)
    verified_quantity: float = Field(gt=0)
    unit: str = Field(default="units", min_length=1, max_length=40)
class DeliveryCreate(BaseModel):
    model_config = {"extra": "forbid"}
    need_id: int = Field(gt=0)
    delivered_quantity: float = Field(gt=0)
    allocation_id: int | None = Field(default=None, gt=0)

class ResourceCreate(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=2, max_length=120)
    resource_type: str = Field(min_length=2, max_length=80)
    unit: str = Field(min_length=1, max_length=40)
    location: str = Field(min_length=2, max_length=200)
    available_quantity: float = Field(gt=0, le=1_000_000_000)
    source: str = Field(min_length=2, max_length=200)
    status: str = Field(default="active", pattern="^(active|inactive)$")

class AllocationCreate(BaseModel):
    model_config = {"extra": "forbid"}
    need_id: int = Field(gt=0)
    resource_id: int = Field(gt=0)
    allocated_quantity: float = Field(gt=0)


class ReportCreate(BaseModel):
    model_config = {"extra": "forbid"}
    report_type: str = Field(pattern="^(relief|emergency)$")
    category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=5, max_length=500)
    location: str = Field(min_length=2, max_length=200)
    people_affected: int = Field(ge=0, le=10_000_000)
    required_quantity: float = Field(ge=0, le=1_000_000_000)
    evidence_status: str = Field(default="none", pattern="^(none|photo|document|other)$")
    evidence_source: str = Field(min_length=2, max_length=200)
    evidence_note: str = Field(default="", max_length=1000)

class PublicReportCreate(BaseModel):
    model_config = {"extra": "forbid"}

    report_type: str = Field(pattern="^(relief|emergency)$")
    category: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=5, max_length=500)
    location: str = Field(min_length=2, max_length=200)
    people_affected: int = Field(ge=0, le=10_000_000)
    required_quantity: float = Field(ge=0, le=1_000_000_000)
