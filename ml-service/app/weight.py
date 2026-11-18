"""Weight-trend forecasting.

Two candidate models are fitted and the one with the lower time-series cross-validated MAE is used:
  * time_only:          weight ~ day index                      (robust baseline)
  * time_plus_behavior: weight ~ day index + 7-day mean calories + 7-day mean steps
The forecast for the behaviour model assumes the user's *recent* habits continue.
Prediction bands use the residual standard deviation, so they widen with noisy data.
Predictions are statistical estimates, not guarantees.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

KCAL_PER_KG = 7700  # widely used approximation for energy content of body-weight change


def _prepare(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty or "date" not in df:
        return pd.DataFrame()
    df["date"] = pd.to_datetime(df["date"])
    for col in ("weight_kg", "calories", "steps"):
        df[col] = pd.to_numeric(df.get(col), errors="coerce")
    df = df.sort_values("date").drop_duplicates("date").set_index("date")
    full = df.reindex(pd.date_range(df.index.min(), df.index.max(), freq="D"))
    full["cal7"] = full["calories"].rolling(7, min_periods=3).mean()
    full["steps7"] = full["steps"].rolling(7, min_periods=3).mean()
    return full


def _cv_mae(make, X: np.ndarray, y: np.ndarray) -> float | None:
    n = len(y)
    if n < 8:
        return None
    errs = []
    for tr, te in TimeSeriesSplit(n_splits=min(3, n // 3)).split(X):
        m = make().fit(X[tr], y[tr])
        errs.append(np.mean(np.abs(m.predict(X[te]) - y[te])))
    return float(np.mean(errs))


def forecast_weight(rows: list[dict], horizon_days: int = 28, tdee: float | None = None,
                    target_weight_kg: float | None = None) -> dict:
    df = _prepare(rows)
    w = df.dropna(subset=["weight_kg"]) if not df.empty else df
    if len(w) < 5 or (w.index.max() - w.index.min()).days < 10:
        return {"available": False, "reason": "Need at least 5 weigh-ins spread over 10+ days to estimate a trend."}

    t0 = w.index.min()
    t = (w.index - t0).days.to_numpy(dtype=float)
    y = w["weight_kg"].to_numpy(dtype=float)
    last_day = float(t.max())
    make = lambda: make_pipeline(StandardScaler(), Ridge(alpha=1.0))  # noqa: E731

    candidates: dict[str, dict] = {}
    X_time = t.reshape(-1, 1)
    candidates["time_only"] = {"X": X_time, "mae": _cv_mae(make, X_time, y)}

    beh = w.dropna(subset=["cal7", "steps7"])
    habits = df.tail(14)
    if len(beh) >= 14 and habits["cal7"].notna().any() and habits["steps7"].notna().any():
        tb = (beh.index - t0).days.to_numpy(dtype=float)
        Xb = np.column_stack([tb, beh["cal7"], beh["steps7"]])
        candidates["time_plus_behavior"] = {"X": Xb, "y": beh["weight_kg"].to_numpy(dtype=float), "mae": _cv_mae(make, Xb, beh["weight_kg"].to_numpy(dtype=float))}

    def score(k: str) -> float:
        m = candidates[k]["mae"]
        return m if m is not None else 9e9

    chosen = min(candidates, key=lambda k: (score(k), k != "time_only"))
    X = candidates[chosen]["X"]
    yy = candidates[chosen].get("y", y)
    model = make().fit(X, yy)
    resid = yy - model.predict(X)
    sigma = float(np.std(resid, ddof=min(2, len(yy) - 1))) if len(yy) > 3 else 0.5
    sigma = max(sigma, 0.2)

    cal_recent = float(habits["cal7"].dropna().iloc[-1]) if habits["cal7"].notna().any() else 0.0
    steps_recent = float(habits["steps7"].dropna().iloc[-1]) if habits["steps7"].notna().any() else 0.0
    n = len(yy)
    tbar = float(np.mean(X[:, 0]))
    sxx = float(np.sum((X[:, 0] - tbar) ** 2)) or 1.0

    horizon_days = int(max(7, min(horizon_days, 90)))
    days = sorted(set(list(range(7, horizon_days + 1, 7)) + [horizon_days]))
    points = []
    for h in days:
        d = last_day + h
        x = np.array([[d]]) if chosen == "time_only" else np.array([[d, cal_recent, steps_recent]])
        mean = float(model.predict(x)[0])
        widen = np.sqrt(1 + 1 / n + (d - tbar) ** 2 / sxx)
        band = 1.96 * sigma * float(widen)
        points.append({"date": (w.index.max() + pd.Timedelta(days=h)).strftime("%Y-%m-%d"),
                       "weight_kg": round(mean, 1), "low": round(mean - band, 1), "high": round(mean + band, 1)})

    slope_week = (points[-1]["weight_kg"] - float(model.predict(np.array([[last_day]]) if chosen == "time_only" else np.array([[last_day, cal_recent, steps_recent]]))[0])) / (horizon_days / 7)
    current = float(np.mean(y[-3:]))
    out: dict = {
        "available": True, "model": chosen, "n_weigh_ins": int(len(w)),
        "current_weight_kg": round(current, 1), "weekly_rate_kg": round(slope_week, 2),
        "cv_mae_kg": None if candidates[chosen]["mae"] is None else round(candidates[chosen]["mae"], 2),
        "horizon_days": horizon_days, "forecast": points,
        "assumption": "Recent calorie and step habits continue" if chosen == "time_plus_behavior" else "The recent linear trend continues",
        "limitations": [
            "Daily weight fluctuates by 0.5–2 kg from water, food volume and sleep; bands reflect that noise.",
            "Linear extrapolation gets less reliable the further ahead it looks.",
            "The model cannot know about future changes to diet, training, illness or medication.",
        ],
    }
    if tdee and cal_recent:
        out["energy_balance_check"] = {
            "avg_calories_7d": round(cal_recent),
            "tdee_estimate": round(tdee),
            "expected_weekly_rate_kg": round((cal_recent - tdee) * 7 / KCAL_PER_KG, 2),
            "note": "Calorie logs are usually under-reported; compare with the observed rate.",
        }
    if target_weight_kg:
        gap = target_weight_kg - current
        if abs(gap) < 0.3:
            out["target"] = {"weight_kg": target_weight_kg, "status": "reached"}
        elif slope_week != 0 and np.sign(gap) == np.sign(slope_week):
            weeks = abs(gap / slope_week)
            out["target"] = {"weight_kg": target_weight_kg, "status": "on_track", "estimated_weeks": round(min(weeks, 104), 1)}
        else:
            out["target"] = {"weight_kg": target_weight_kg, "status": "not_moving_toward_target"}
    return out
