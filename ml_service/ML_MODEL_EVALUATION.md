# PolicyLens ML Cost Model — Evaluation Report

Model version `2.0.0` · trained 2026-10-10T04:29:07Z · split 14,000 train / 3,000 calibration / 3,000 test (stratified by procedure, all numbers below are on the untouched **test** split).

> **Data caveat.** The training data is *synthetic* (`data/generate_dataset.py`, seeded, derived from the tariff multipliers in the catalog), not real hospital bills. These metrics show how well the model learns that tariff structure; they are **not** a claim of real-world accuracy. Retrain on real claims/tariff data before relying on the numbers commercially.

## 1. Headline: original pipeline vs tuned pipeline

| Metric | Original | Tuned (final) | Change |
|---|---:|---:|---:|
| MAE (P50) | ₹15,735 | ₹15,025 | -4.5% |
| RMSE (P50) | ₹27,013 | ₹25,916 | -4.1% |
| MAPE | 9.76% | 8.79% | -10.0% |
| WAPE | 8.96% | 8.56% | -4.5% |
| Median APE | 7.56% | 7.21% | -4.7% |
| R² (P50) | 0.9745 | 0.9766 | +0.2% |
| Pinball loss P10 | ₹3,731 | ₹3,312 | -11.2% |
| Pinball loss P50 | ₹7,867 | ₹7,513 | -4.5% |
| Pinball loss P90 | ₹3,623 | ₹3,366 | -7.1% |
| 80% interval coverage (target 80%) | 77.40% | 80.97% | — |
| Mean interval width | ₹53,005 | ₹51,794 | -2.3% |
| Interval (Winkler) score | ₹73,543 | ₹66,782 | -9.2% |
| Quantile crossing rate | 2.07% | 0.00% | — |

## 2. What each optimisation bought (ablation)

| Step | MAPE | MAE | Mean pinball | 80% coverage | Interval score |
|---|---:|---:|---:|---:|---:|
| Original pipeline (one-hot, raw target, fixed params) | 9.76% | ₹15,735 | ₹5,074 | 77.4% | ₹73,543 |
| + native categoricals & engineered features | 8.85% | ₹14,997 | ₹4,796 | 76.3% | ₹68,889 |
| + log-target | 8.73% | ₹14,980 | ₹4,739 | 75.9% | ₹67,273 |
| + Optuna-tuned hyper-parameters | 8.79% | ₹15,025 | ₹4,726 | 77.8% | ₹66,649 |
| + conformal (CQR) interval calibration  = FINAL | 8.79% | ₹15,025 | ₹4,730 | 81.0% | ₹66,782 |

## 3. Quantile calibration (final)

A perfectly calibrated quantile model has the fraction of actuals below each quantile equal to the quantile.

| Quantile | Target | Observed (final) | Observed (original) |
|---|---:|---:|---:|
| P10 | 10% | 9.7% | 11.3% |
| P50 | 50% | 48.4% | 48.9% |
| P90 | 90% | 90.7% | 88.7% |

Conformal (CQR) log-offset applied to the P10/P90 tails: `+0.0097` (≈ +1.0% on each tail).

## 4. Line-item (stay-adjusted) accuracy

Mean absolute error per bill component vs the previous hand-written itemisation (both rescaled to the same P50 total, so this isolates how well each *splits* the bill).

| Line item | Mean actual | Heuristic MAE | ML MAE | Change |
|---|---:|---:|---:|---:|
| room_and_nursing | ₹32,741 | ₹2,120 | ₹1,659 | -21.7% |
| surgery_and_ot | ₹66,024 | ₹4,832 | ₹3,858 | -20.2% |
| doctor_fees | ₹24,483 | ₹2,166 | ₹1,451 | -33.0% |
| medicines_and_implants | ₹38,011 | ₹6,425 | ₹2,226 | -65.4% |
| consumables | ₹13,938 | ₹1,313 | ₹881 | -32.9% |
| **All items** | | ₹3,371 | ₹2,015 | -40.2% |

## 5. Accuracy by segment (final model)

**Procedure**

| Segment | n | MAPE | 80% coverage |
|---|---:|---:|---:|
| Appendectomy | 176 | 9.41% | 83.5% |
| Caesarean Section | 172 | 8.54% | 80.2% |
| Cataract Surgery | 182 | 8.48% | 80.2% |
| Chemotherapy Infusion Cycle | 185 | 9.59% | 81.6% |
| Cholecystectomy | 176 | 8.51% | 80.7% |
| Coronary Angioplasty | 172 | 8.71% | 83.1% |
| Coronary Artery Bypass Graft (CABG) | 174 | 7.82% | 83.9% |
| Dengue Inpatient Care | 177 | 9.53% | 72.3% |
| Hemodialysis (Single Session) | 183 | 8.81% | 80.9% |
| Hernia Repair | 171 | 9.59% | 76.6% |
| Hysterectomy | 170 | 8.44% | 78.8% |
| Kidney Stone Lithotripsy | 174 | 8.72% | 81.0% |
| Normal Delivery | 183 | 8.25% | 86.9% |
| Tonsillectomy | 184 | 8.97% | 82.1% |
| Total Hip Replacement | 170 | 8.82% | 81.8% |
| Total Knee Replacement | 174 | 8.33% | 81.6% |
| Typhoid Inpatient Care | 177 | 8.85% | 80.8% |

**Hospital tier (1=Corporate, 2=Multi-specialty, 3=Nursing home)**

| Segment | n | MAPE | 80% coverage |
|---|---:|---:|---:|
| 1 | 1,050 | 9.01% | 79.9% |
| 2 | 1,365 | 8.66% | 80.7% |
| 3 | 585 | 8.69% | 83.4% |

**City tier (1=Metro)**

| Segment | n | MAPE | 80% coverage |
|---|---:|---:|---:|
| 1 | 1,219 | 8.82% | 82.5% |
| 2 | 1,190 | 8.82% | 79.7% |
| 3 | 591 | 8.66% | 80.4% |

**Room category**

| Segment | n | MAPE | 80% coverage |
|---|---:|---:|---:|
| general | 923 | 8.88% | 81.8% |
| single | 771 | 9.06% | 79.9% |
| suite | 284 | 8.30% | 84.2% |
| twin | 1,022 | 8.63% | 80.1% |

## 6. Robustness & serving

- Monotonic stay check: raising stay by 1 day lowered the P50 estimate in **0.00%** of test cases (LightGBM cannot enforce monotone constraints with the quantile objective, so this is monitored rather than guaranteed).
- Single-prediction latency (P10+P50+P90, model only): **17.24 ms**.
- Uncertainty labels use data-driven thresholds on relative interval width (P90−P10)/P50: low < 0.25, medium < 0.30, high otherwise.

## 7. Tuned hyper-parameters (Optuna, TPE, 3-fold CV on the train split)

| Quantile | CV pinball | Trees | learning_rate | num_leaves | min_child_samples | subsample | colsample | λ (L2) | α (L1) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| P10 | ₹3,342 | 525 | 0.052 | 8 | 67 | 0.92 | 0.94 | 0.003 | 0.004 |
| P50 | ₹7,679 | 770 | 0.038 | 9 | 59 | 0.76 | 0.76 | 2.476 | 0.016 |
| P90 | ₹3,675 | 1495 | 0.026 | 10 | 80 | 0.73 | 0.80 | 8.007 | 0.008 |

## 8. How to read these numbers

- **The model is close to the data's noise floor.** The synthetic generator adds roughly 8-10% multiplicative noise plus independent per-line-item noise, so the achievable MAPE floor is probably around 7-8% (estimated, not measured); a 9.8% -> 8.8% gain is most of what is available. Most of it came from the feature work (native categoricals, `stay_delta`) and the log target, not from hyper-parameter search (see the ablation: Optuna moves MAPE by <0.1 pt but improves tail pinball loss and CV stability).
- **Intervals are the clearest win:** raw quantile models under-covered (77.4% vs the 80% target) and crossed (P10 > P50) on ~2% of cases; the final service covers ~81% with no crossings.
- **Weakest segment:** Dengue Inpatient Care reaches only 72.3% coverage (n=177); conformal calibration is global, not per-procedure, so individual procedures can still be mis-calibrated by a few points. Small per-segment samples (~170) also make these figures noisy (+/- ~3 pts).
- **Line-item gains** partly reflect that the old heuristic ignored the data's real stay/room/age dependencies; the comparison uses identical P50 totals so it isolates the split, not the total.
- **Original vs final** are both re-fitted on the same (regenerated, 20k-row, long-stay-tail) dataset and the same split, so the comparison is like-for-like; the previously shipped model was trained on 10k rows without the long-stay tail.

## 9. Method notes

- **Features:** procedure (LightGBM native categorical), age, city tier, hospital tier, room rank, stay days, `stay_delta` (stay − procedure's typical stay), `age_over_60`.
- **Target:** `log(total_bill)`. Quantiles are invariant under monotone transforms, and bills are multiplicative in tier/room factors, so the log scale fits the structure and avoids large-bill pinball domination.
- **Intervals:** P10/P90 quantile models, then conformalised on a held-out calibration split so the nominal 80% band is honest.
- **Line items:** one median model per component (log1p target), rescaled to sum to the P50 total.
- **Stays beyond the training range** are not silently flat-lined: the service extrapolates linearly from the last observed per-day slope and flags the response.
- **Reproduce:** `cd ml_service && pip install -r requirements.txt && python train.py` (use `--trials N` to change search effort).
