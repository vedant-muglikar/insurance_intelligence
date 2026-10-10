"""Feature engineering shared by training (train.py) and serving (main.py)."""
import pandas as pd

from data.generate_dataset import PROCEDURE_CATALOG

ROOM_ORDER = ["general", "twin", "single", "suite"]
ROOM_RANK = {r: i for i, r in enumerate(ROOM_ORDER)}

CATEGORICAL_COLS = ["procedure_name"]
FEATURE_COLS = [
    "procedure_name",
    "patient_age",
    "city_tier",
    "hospital_tier",
    "room_rank",
    "stay_duration_days",
    "stay_delta",
    "age_over_60",
]

PROCEDURE_NAMES = sorted(PROCEDURE_CATALOG.keys())

LINE_ITEMS = [
    "room_and_nursing",
    "surgery_and_ot",
    "doctor_fees",
    "medicines_and_implants",
    "consumables",
]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Raw request-shaped frame -> model matrix (LightGBM native categoricals)."""
    out = pd.DataFrame(index=df.index)
    out["procedure_name"] = pd.Categorical(df["procedure_name"], categories=PROCEDURE_NAMES)
    out["patient_age"] = df["patient_age"].astype(int)
    out["city_tier"] = df["city_tier"].astype(int)
    out["hospital_tier"] = df["hospital_tier"].astype(int)
    out["room_rank"] = df["room_category"].map(ROOM_RANK).astype(int)
    out["stay_duration_days"] = df["stay_duration_days"].astype(int)
    typical_stay = df["procedure_name"].map(lambda p: PROCEDURE_CATALOG[p]["base_stay_mean"])
    out["stay_delta"] = out["stay_duration_days"] - typical_stay.astype(float)
    out["age_over_60"] = (out["patient_age"] - 60).clip(lower=0)
    return out[FEATURE_COLS]
