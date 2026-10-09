from typing import Dict, List
from pydantic import BaseModel, Field, field_validator

class CostPredictionRequest(BaseModel):
    procedure_name: str = Field(..., description="Standard medical procedure name or description")
    patient_age: int = Field(..., ge=0, le=120, description="Patient age in years (0-120)")
    city_tier: int = Field(..., ge=1, le=3, description="City tier: 1 (Metro), 2 (Tier 2), 3 (Tier 3)")
    hospital_tier: int = Field(..., ge=1, le=3, description="Hospital tier: 1 (Corporate/NABH), 2 (Private Multi-specialty), 3 (Nursing Home)")
    room_category: str = Field(..., description="Room choice: 'general', 'twin', 'single', or 'suite'")
    stay_duration_days: int = Field(..., ge=1, le=120, description="Inpatient stay duration in days")

    @field_validator("room_category")
    @classmethod
    def validate_room_category(cls, v: str) -> str:
        allowed = {"general", "twin", "single", "suite"}
        v_clean = v.strip().lower()
        if v_clean not in allowed:
            raise ValueError(f"room_category must be one of {allowed}, got '{v}'")
        return v_clean


class ItemizedBreakdown(BaseModel):
    room_and_nursing: float = Field(..., description="Estimated cost for room rent and nursing care")
    surgery_and_ot: float = Field(..., description="Estimated cost for surgery and operation theater")
    doctor_fees: float = Field(..., description="Estimated cost for doctor and specialist consultation fees")
    medicines_and_implants: float = Field(..., description="Estimated cost for pharmacy, medicines, and surgical implants")
    consumables: float = Field(..., description="Estimated cost for medical consumables and disposable items")


class CostPredictionResponse(BaseModel):
    cost_p10: float = Field(..., description="10th percentile estimated cost (Lower bound)")
    cost_p50: float = Field(..., description="50th percentile estimated cost (Median prediction)")
    cost_p90: float = Field(..., description="90th percentile estimated cost (Upper bound)")
    estimated_bill: float = Field(..., description="Recommended point estimate (Median P50 bill)")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Model prediction confidence (0.0 to 1.0)")
    uncertainty_level: str = Field(..., description="Uncertainty classification: 'low', 'medium', or 'high'")
    itemized_breakdown: ItemizedBreakdown = Field(..., description="Itemized cost distribution")
    cost_drivers: List[str] = Field(..., description="Top feature cost drivers explaining the estimate")
