import os
import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.model_selection import train_test_split

from data.generate_dataset import generate_dataset

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

TARGET_COL = "total_bill"


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL_COLS),
            ("num", StandardScaler(), NUMERICAL_COLS),
        ],
        remainder="drop",
    )


def train_models():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    csv_path = os.path.join(data_dir, "hospital_tariffs.csv")
    models_dir = os.path.join(base_dir, "models")

    os.makedirs(models_dir, exist_ok=True)

    # 1. Load or Generate Dataset
    if not os.path.exists(csv_path):
        print(f"Dataset not found at {csv_path}. Generating dataset...")
        df = generate_dataset(num_records=10000, seed=42, output_path=csv_path)
    else:
        print(f"Loading existing dataset from {csv_path}...")
        df = pd.read_csv(csv_path)

    X = df[FEATURE_COLS]
    y = df[TARGET_COL]

    # Stratified Train-Test Split by procedure_name
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=df["procedure_name"]
    )

    # 2. Fit Preprocessor
    preprocessor = build_preprocessor()
    X_train_trans = preprocessor.fit_transform(X_train)
    X_test_trans = preprocessor.transform(X_test)

    # Save preprocessor
    preprocessor_path = os.path.join(models_dir, "preprocessor.pkl")
    joblib.dump(preprocessor, preprocessor_path)
    print(f"Saved preprocessor to {preprocessor_path}")

    # 3. Train Quantile Regressors (p10, p50, p90)
    alphas = [0.10, 0.50, 0.90]
    models = {}

    for alpha in alphas:
        print(f"Training LightGBM Quantile Regressor (alpha={alpha:.2f})...")
        model = LGBMRegressor(
            objective="quantile",
            alpha=alpha,
            n_estimators=250,
            learning_rate=0.05,
            num_leaves=31,
            random_state=42,
            verbosity=-1,
        )
        model.fit(X_train_trans, y_train)
        
        quant_key = f"p{int(alpha * 100)}"
        model_path = os.path.join(models_dir, f"cost_{quant_key}.pkl")
        joblib.dump(model, model_path)
        print(f"Saved {quant_key} model to {model_path}")
        models[quant_key] = model

    # 4. Evaluate Models on Test Set
    p10_preds = models["p10"].predict(X_test_trans)
    p50_preds = models["p50"].predict(X_test_trans)
    p90_preds = models["p90"].predict(X_test_trans)

    # Coverage probability: fraction of y_test between p10 and p90
    covered = np.logical_and(y_test.values >= p10_preds, y_test.values <= p90_preds)
    coverage_prob = np.mean(covered)

    # Pinball loss helper
    def pinball_loss(y_true, y_pred, alpha):
        err = y_true - y_pred
        return np.mean(np.maximum(alpha * err, (alpha - 1) * err))

    pb10 = pinball_loss(y_test.values, p10_preds, 0.10)
    pb50 = pinball_loss(y_test.values, p50_preds, 0.50)
    pb90 = pinball_loss(y_test.values, p90_preds, 0.90)

    print("\n--- Model Evaluation Summary ---")
    print(f"Coverage Probability (P10 <= y <= P90): {coverage_prob * 100:.2f}% (Target ~80%)")
    print(f"Pinball Loss P10: {pb10:.2f}")
    print(f"Pinball Loss P50 (MAE equivalent): {pb50:.2f}")
    print(f"Pinball Loss P90: {pb90:.2f}")
    print("Training complete successfully!")

if __name__ == "__main__":
    train_models()
