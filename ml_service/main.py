import os
import joblib
import numpy as np
import pandas as pd
import shap
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from schemas import CostPredictionRequest, CostPredictionResponse, ItemizedBreakdown
from data.generate_dataset import PROCEDURE_CATALOG, CITY_TIER_MULTIPLIERS, HOSPITAL_TIER_MULTIPLIERS, ROOM_CATEGORY_MULTIPLIERS

# Global state for loaded model artifacts
artifacts = {}

FEATURE_COLS = [
    "procedure_name",
    "patient_age",
    "city_tier",
    "hospital_tier",
    "room_category",
    "stay_duration_days",
]

CATEGORICAL_COLS = ["procedure_name", "room_category"]
NUMERICAL_COLS = ["patient_age", "city_tier", "hospital_tier", "stay_duration_days"]


def normalize_procedure_name(input_proc: str) -> str:
    """Matches user input procedure string against known catalog using substring/fuzzy matching."""
    input_clean = input_proc.strip().lower()
    
    # 1. Exact match
    for catalog_proc in PROCEDURE_CATALOG.keys():
        if catalog_proc.lower() == input_clean:
            return catalog_proc
            
    # 2. Substring match
    for catalog_proc in PROCEDURE_CATALOG.keys():
        cat_lower = catalog_proc.lower()
        if input_clean in cat_lower or cat_lower in input_clean:
            return catalog_proc
        # Check ICD code match if present in input string
        icd = PROCEDURE_CATALOG[catalog_proc]["icd_code"].lower()
        if icd in input_clean:
            return catalog_proc

    # Key shorthand matches
    if "cataract" in input_clean:
        return "Cataract Surgery"
    if "knee" in input_clean:
        return "Total Knee Replacement"
    if "hip" in input_clean:
        return "Total Hip Replacement"
    if "delivery" in input_clean or "normal" in input_clean:
        return "Normal Delivery"
    if "caesarean" in input_clean or "c-section" in input_clean or "csection" in input_clean:
        return "Caesarean Section"
    if "angioplasty" in input_clean or "stent" in input_clean:
        return "Coronary Angioplasty"
    if "cabg" in input_clean or "bypass" in input_clean:
        return "Coronary Artery Bypass Graft (CABG)"
    if "dengue" in input_clean:
        return "Dengue Inpatient Care"
    if "typhoid" in input_clean:
        return "Typhoid Inpatient Care"
    if "stone" in input_clean or "lithotripsy" in input_clean:
        return "Kidney Stone Lithotripsy"
    if "hernia" in input_clean:
        return "Hernia Repair"
    if "gallbladder" in input_clean or "cholecystectomy" in input_clean:
        return "Cholecystectomy"
    if "appendix" in input_clean or "appendectomy" in input_clean:
        return "Appendectomy"

    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Loads preprocessor, LGBM models, and SHAP explainer on startup."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_dir, "models")

    # If models do not exist, run auto-training
    if not os.path.exists(os.path.join(models_dir, "cost_p50.pkl")):
        print("Model artifacts missing in models/. Triggering headless training...")
        from train import train_models
        train_models()

    artifacts["preprocessor"] = joblib.load(os.path.join(models_dir, "preprocessor.pkl"))
    artifacts["cost_p10"] = joblib.load(os.path.join(models_dir, "cost_p10.pkl"))
    artifacts["cost_p50"] = joblib.load(os.path.join(models_dir, "cost_p50.pkl"))
    artifacts["cost_p90"] = joblib.load(os.path.join(models_dir, "cost_p90.pkl"))
    
    # Initialize TreeSHAP explainer for P50 median model
    artifacts["explainer"] = shap.TreeExplainer(artifacts["cost_p50"])
    
    # Extract transformed feature names
    cat_encoder = artifacts["preprocessor"].named_transformers_["cat"]
    cat_names = list(cat_encoder.get_feature_names_out(CATEGORICAL_COLS))
    artifacts["feature_names"] = cat_names + NUMERICAL_COLS

    print(f"ClaimLens ML Microservice initialized with {len(artifacts['feature_names'])} features.")
    yield
    artifacts.clear()


app = FastAPI(
    title="ClaimLens ML Cost Estimation Microservice",
    description="Production-grade LightGBM Quantile Regression microservice for inpatient procedure cost estimation",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Health check endpoint validating artifact loading status."""
    is_ready = all(k in artifacts for k in ["preprocessor", "cost_p10", "cost_p50", "cost_p90", "explainer"])
    return {
        "status": "healthy" if is_ready else "unhealthy",
        "service": "ClaimLens ML Microservice",
        "models_loaded": is_ready,
        "available_procedures": list(PROCEDURE_CATALOG.keys()),
    }


def compute_itemized_breakdown(proc_name: str, room_category: str, stay_days: int, total_p50: float) -> ItemizedBreakdown:
    """Computes realistic itemized bill breakdown proportional to P50 median estimate."""
    proc_info = PROCEDURE_CATALOG.get(proc_name, PROCEDURE_CATALOG["Appendectomy"])
    
    room_mult = ROOM_CATEGORY_MULTIPLIERS.get(room_category, 1.0)
    base_daily_room = proc_info["base_daily_room"] * room_mult
    base_daily_doctor = proc_info["base_daily_doctor"]
    
    raw_room = base_daily_room * stay_days
    raw_surgery = proc_info["base_surgery_ot"] * (1.0 + (room_mult - 1.0) * 0.4)
    raw_doctor = base_daily_doctor * stay_days
    raw_meds = proc_info["base_medicines_implants"]
    raw_cons = proc_info["base_consumables"] * (1.0 + stay_days * 0.08)

    raw_sum = raw_room + raw_surgery + raw_doctor + raw_meds + raw_cons
    if raw_sum <= 0:
        raw_sum = total_p50

    # Scale proportionally to exact P50 total estimate
    scale = total_p50 / raw_sum

    room_val = round(raw_room * scale, 2)
    surg_val = round(raw_surgery * scale, 2)
    doc_val = round(raw_doctor * scale, 2)
    med_val = round(raw_meds * scale, 2)
    cons_val = round(total_p50 - (room_val + surg_val + doc_val + med_val), 2)  # Adjust balance

    return ItemizedBreakdown(
        room_and_nursing=max(0.0, room_val),
        surgery_and_ot=max(0.0, surg_val),
        doctor_fees=max(0.0, doc_val),
        medicines_and_implants=max(0.0, med_val),
        consumables=max(0.0, cons_val),
    )


def compute_cost_drivers(req: CostPredictionRequest, normalized_proc: str, shap_values_single: np.ndarray, feature_names: list) -> list[str]:
    """Generates top 3 human-readable cost driver explanations using SHAP & domain feature deltas."""
    drivers = []
    
    # Map feature names to SHAP values
    feat_shap_map = dict(zip(feature_names, shap_values_single))
    
    # 1. City Tier impact
    if req.city_tier == 1:
        drivers.append(f"City Tier 1 Metro location increases tariff by ~40%")
    elif req.city_tier == 3:
        drivers.append(f"City Tier 3 location reduces tariff by ~20%")

    # 2. Hospital Tier impact
    if req.hospital_tier == 1:
        drivers.append("Corporate / NABH accredited hospital premium (+35%)")
    elif req.hospital_tier == 3:
        drivers.append("Nursing Home facility discount (-15%)")

    # 3. Room Category impact
    if req.room_category == "suite":
        drivers.append("Deluxe Suite room choice introduces highest tariff scaling (+65%)")
    elif req.room_category == "single":
        drivers.append("Single Private Room choice adds room & OT tariff multiplier (+35%)")
    elif req.room_category == "general":
        drivers.append("General Ward selection minimizes base room and OT charges")

    # 4. Stay duration impact
    proc_info = PROCEDURE_CATALOG.get(normalized_proc, {})
    avg_stay = proc_info.get("base_stay_mean", 3.0)
    if req.stay_duration_days > avg_stay + 1:
        drivers.append(f"Extended inpatient stay ({req.stay_duration_days} days vs avg {avg_stay:.1f} days) increases room & nursing fees")
    elif req.stay_duration_days < avg_stay - 1:
        drivers.append(f"Short inpatient stay ({req.stay_duration_days} days) reduces variable nursing and doctor costs")

    # 5. Age complication
    if req.patient_age > 60:
        drivers.append(f"Geriatric patient age ({req.patient_age} yrs) increases clinical complication buffer & observation stay")

    # Sort/Fallback top SHAP feature drivers
    if len(drivers) < 3:
        top_shap_idx = np.argsort(np.abs(shap_values_single))[::-1]
        for idx in top_shap_idx:
            fname = feature_names[idx]
            fval = shap_values_single[idx]
            impact_direction = "increases" if fval > 0 else "decreases"
            explanation = f"Feature '{fname}' {impact_direction} estimated cost"
            if explanation not in drivers and len(drivers) < 3:
                drivers.append(explanation)

    return drivers[:3]


@app.post("/predict", response_model=CostPredictionResponse)
def predict_cost(req: CostPredictionRequest):
    """
    POST /predict
    Calculates P10, P50, and P90 cost estimates, itemized line items, and SHAP cost drivers.
    """
    # 1. Normalize procedure name
    normalized_proc = normalize_procedure_name(req.procedure_name)
    if not normalized_proc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown procedure '{req.procedure_name}'. Available procedures: {list(PROCEDURE_CATALOG.keys())}"
        )

    # 2. Build input DataFrame
    input_data = pd.DataFrame([{
        "procedure_name": normalized_proc,
        "patient_age": req.patient_age,
        "city_tier": req.city_tier,
        "hospital_tier": req.hospital_tier,
        "room_category": req.room_category,
        "stay_duration_days": req.stay_duration_days,
    }])

    # 3. Preprocess input
    try:
        X_trans = artifacts["preprocessor"].transform(input_data)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Preprocessing error: {str(e)}"
        )

    # 4. Predict Quantiles
    p10 = float(artifacts["cost_p10"].predict(X_trans)[0])
    p50 = float(artifacts["cost_p50"].predict(X_trans)[0])
    p90 = float(artifacts["cost_p90"].predict(X_trans)[0])

    # Ensure quantile monotonicity (P10 <= P50 <= P90) and positive lower bound
    p10 = max(1000.0, min(p10, p50))
    p90 = max(p50, p90)

    estimated_bill = round(p50, 2)
    p10 = round(p10, 2)
    p90 = round(p90, 2)

    # 5. Calculate Confidence Score and Uncertainty Level
    # Spread ratio = (P90 - P10) / P50
    spread = (p90 - p10) / p50 if p50 > 0 else 0.5
    confidence_score = round(float(np.clip(1.0 - (spread * 0.75), 0.15, 0.98)), 2)

    if spread < 0.35:
        uncertainty_level = "low"
    elif spread < 0.65:
        uncertainty_level = "medium"
    else:
        uncertainty_level = "high"

    # 6. Compute Itemized Breakdown
    itemized = compute_itemized_breakdown(normalized_proc, req.room_category, req.stay_duration_days, estimated_bill)

    # 7. Compute SHAP Values & Cost Drivers
    try:
        raw_shap = artifacts["explainer"].shap_values(X_trans)
        shap_vals_single = raw_shap[0] if isinstance(raw_shap, list) or len(raw_shap.shape) > 1 else raw_shap
    except Exception:
        shap_vals_single = np.zeros(len(artifacts["feature_names"]))

    cost_drivers = compute_cost_drivers(req, normalized_proc, shap_vals_single, artifacts["feature_names"])

    return CostPredictionResponse(
        cost_p10=p10,
        cost_p50=p50,
        cost_p90=p90,
        estimated_bill=estimated_bill,
        confidence_score=confidence_score,
        uncertainty_level=uncertainty_level,
        itemized_breakdown=itemized,
        cost_drivers=cost_drivers,
    )
