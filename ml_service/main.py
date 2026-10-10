import json
import os
import re
from contextlib import asynccontextmanager

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from data.generate_dataset import PROCEDURE_CATALOG
from features import LINE_ITEMS, build_features
from schemas import CostPredictionRequest, CostPredictionResponse, ItemizedBreakdown

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
BUNDLE_PATH = os.path.join(MODELS_DIR, "bundle.pkl")

artifacts: dict = {}

# Ordered most-specific first. Each rule: (regex on lower-cased input, catalog procedure).
PROCEDURE_RULES = [
    (r"c-?section|caesarean|cesarean|lscs", "Caesarean Section"),
    (r"normal delivery|vaginal delivery|childbirth|maternity|^delivery$", "Normal Delivery"),
    (r"cabg|bypass|open heart", "Coronary Artery Bypass Graft (CABG)"),
    (r"angioplasty|ptca|stent", "Coronary Angioplasty"),
    (r"knee|tkr", "Total Knee Replacement"),
    (r"\bhip\b|\bthr\b", "Total Hip Replacement"),
    (r"cataract|phaco", "Cataract Surgery"),
    (r"dengue", "Dengue Inpatient Care"),
    (r"typhoid", "Typhoid Inpatient Care"),
    (r"stone|lithotripsy|pcnl|ursl", "Kidney Stone Lithotripsy"),
    (r"hernia", "Hernia Repair"),
    (r"gallbladder|gall bladder|cholecystectomy", "Cholecystectomy"),
    (r"appendi|appendectomy", "Appendectomy"),
    (r"hysterectomy|uterus removal", "Hysterectomy"),
    (r"tonsil", "Tonsillectomy"),
    (r"dialysis", "Hemodialysis (Single Session)"),
    (r"chemo", "Chemotherapy Infusion Cycle"),
]


def normalize_procedure_name(text: str):
    """Resolve free text to a catalog procedure: exact name, ICD code, then keyword rules."""
    clean = text.strip().lower()
    for name, info in PROCEDURE_CATALOG.items():
        if clean == name.lower() or clean == info["icd_code"].lower():
            return name
    for name in PROCEDURE_CATALOG:
        if len(clean) >= 4 and (clean in name.lower() or name.lower() in clean):
            return name
    for pattern, name in PROCEDURE_RULES:
        if re.search(pattern, clean):
            return name
    return None


def load_bundle():
    if not os.path.exists(BUNDLE_PATH):
        print("Model bundle missing. Training with default settings (run train.py for a full tuning pass)...")
        from train import train_models
        train_models(trials=15)
    return joblib.load(BUNDLE_PATH)


@asynccontextmanager
async def lifespan(app: FastAPI):
    bundle = load_bundle()
    artifacts["bundle"] = bundle
    artifacts["explainer"] = shap.TreeExplainer(bundle["models"]["p50"].booster_)
    print(f"PolicyLens ML service ready: model v{bundle['version']}, {len(PROCEDURE_CATALOG)} procedures.")
    yield
    artifacts.clear()


app = FastAPI(
    title="PolicyLens ML Cost Estimation Microservice",
    description="LightGBM quantile-regression service for inpatient procedure cost distributions",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    ready = "bundle" in artifacts
    return {
        "status": "healthy" if ready else "unhealthy",
        "service": "PolicyLens ML Microservice",
        "models_loaded": ready,
        "model_version": artifacts["bundle"]["version"] if ready else None,
        "available_procedures": list(PROCEDURE_CATALOG.keys()),
    }


@app.get("/model-info")
def model_info():
    path = os.path.join(MODELS_DIR, "metrics.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="metrics.json not found; run train.py")
    with open(path, encoding="utf-8") as f:
        m = json.load(f)
    return {k: m[k] for k in ("version", "trained_at", "rows", "final", "baseline", "line_items")}


def quantiles_at(bundle, row: pd.DataFrame):
    X = build_features(row)
    off = bundle["cqr_log_offset"]
    m = bundle["models"]
    mid = float(np.exp(m["p50"].predict(X)[0]))
    lo = min(float(np.exp(m["p10"].predict(X)[0] - off)), mid)
    hi = max(float(np.exp(m["p90"].predict(X)[0] + off)), mid)
    return X, lo, mid, hi


def predict_with_extrapolation(bundle, proc: str, req: CostPredictionRequest):
    """Quantiles for the request; stays beyond the training range extend linearly, not flat."""
    cap = bundle["stay_cap"].get(proc, 15)
    stay = req.stay_duration_days
    base = dict(procedure_name=proc, patient_age=req.patient_age, city_tier=req.city_tier,
                hospital_tier=req.hospital_tier, room_category=req.room_category)
    row = lambda d: pd.DataFrame([{**base, "stay_duration_days": d}])

    if stay <= cap:
        X, lo, mid, hi = quantiles_at(bundle, row(stay))
        return X, lo, mid, hi, False

    X, lo, mid, hi = quantiles_at(bundle, row(cap))
    lag = max(1, cap - 2)
    _, lo2, mid2, hi2 = quantiles_at(bundle, row(lag))
    span = max(1, cap - lag)
    extra = stay - cap
    lo += max(0.0, (lo - lo2) / span) * extra
    mid += max(0.0, (mid - mid2) / span) * extra
    hi += max(0.0, (hi - hi2) / span) * extra
    return X, lo, mid, hi, True


def itemize(bundle, X: pd.DataFrame, total: float) -> ItemizedBreakdown:
    """Line items from per-component models, rescaled to sum exactly to the P50 total."""
    raw = []
    for li in LINE_ITEMS:
        v = float(np.expm1(bundle["item_models"][li].predict(X)[0]))
        raw.append(0.0 if v < 1.0 else v)
    s = sum(raw) or 1.0
    vals = [round(v * total / s, 2) for v in raw]
    vals[-1] = round(total - sum(vals[:-1]), 2)  # absorb rounding so items sum to the total
    return ItemizedBreakdown(**dict(zip(LINE_ITEMS, [max(0.0, v) for v in vals])))


ROOM_LABEL = {"general": "General ward", "twin": "Twin-sharing room", "single": "Single private room", "suite": "Deluxe suite"}
CITY_LABEL = {1: "Metro (Tier 1) city", 2: "Tier 2 city", 3: "Tier 3 city"}
HOSP_LABEL = {1: "Corporate / NABH hospital", 2: "Private multi-specialty hospital", 3: "Nursing home / smaller facility"}


def cost_drivers(req: CostPredictionRequest, X: pd.DataFrame, bundle) -> list[str]:
    """Top drivers from TreeSHAP on the log-cost model; SHAP in log space => multiplicative effects."""
    try:
        sv = np.asarray(artifacts["explainer"].shap_values(X))[0]
    except Exception:
        return ["Estimate based on procedure, hospital tier, city tier, room class and length of stay"]
    contrib = dict(zip(X.columns, sv))
    groups = {
        "city": (contrib["city_tier"], CITY_LABEL[req.city_tier]),
        "hospital": (contrib["hospital_tier"], HOSP_LABEL[req.hospital_tier]),
        "room": (contrib["room_rank"], ROOM_LABEL[req.room_category]),
        "stay": (contrib["stay_duration_days"] + contrib["stay_delta"], f"{req.stay_duration_days}-day stay"),
        "age": (contrib["patient_age"] + contrib["age_over_60"], f"Patient age {req.patient_age}"),
    }
    ranked = sorted(groups.values(), key=lambda g: abs(g[0]), reverse=True)
    out = []
    for val, label in ranked:
        pct = (np.exp(val) - 1) * 100
        if abs(pct) < 1.0:
            continue
        out.append(f"{label} {'raises' if pct > 0 else 'lowers'} the estimate by ~{abs(pct):.0f}% vs the average case")
        if len(out) == 3:
            break
    return out or ["No single factor moves the estimate more than 1% from the average case"]


@app.post("/predict", response_model=CostPredictionResponse)
def predict_cost(req: CostPredictionRequest):
    bundle = artifacts["bundle"]
    proc = normalize_procedure_name(req.procedure_name)
    if not proc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown procedure '{req.procedure_name}'. Available procedures: {list(PROCEDURE_CATALOG.keys())}",
        )

    X, p10, p50, p90, extrapolated = predict_with_extrapolation(bundle, proc, req)
    p10, p50, p90 = round(max(1000.0, p10), 2), round(p50, 2), round(p90, 2)

    spread = (p90 - p10) / p50 if p50 > 0 else 0.5
    confidence = round(float(np.clip(1.0 - spread * 0.75, 0.15, 0.98)), 2)
    th = bundle["spread_thresholds"]
    level = "low" if spread < th["low"] else "medium" if spread < th["high"] else "high"

    warnings = []
    if extrapolated:
        warnings.append(
            f"Stay of {req.stay_duration_days} days is longer than typical for {proc} "
            f"(training range up to {bundle['stay_cap'].get(proc)} days); the estimate extends the per-day trend and is less certain."
        )
        confidence = round(min(confidence, 0.5), 2)
        level = "high"
    if req.patient_age < 18:
        warnings.append("Model was trained on adult patients (18+); paediatric estimates may be less accurate.")

    return CostPredictionResponse(
        cost_p10=p10, cost_p50=p50, cost_p90=p90, estimated_bill=p50,
        confidence_score=confidence, uncertainty_level=level,
        itemized_breakdown=itemize(bundle, X, p50),
        cost_drivers=cost_drivers(req, X, bundle),
        matched_procedure=proc, model_version=bundle["version"],
        extrapolated=extrapolated, warnings=warnings,
    )
