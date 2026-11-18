"""Relationships between daily habits and weight change. Correlation is not causation."""
from __future__ import annotations

import numpy as np
import pandas as pd

LABELS = {"calories": "Calories", "steps": "Steps", "workouts": "Workouts", "sleep_hours": "Sleep", "protein": "Protein"}


def _strength(r: float) -> str:
    a = abs(r)
    return "strong" if a >= 0.6 else "moderate" if a >= 0.35 else "weak" if a >= 0.15 else "negligible"


def analyze(rows: list[dict]) -> dict:
    df = pd.DataFrame(rows)
    if df.empty:
        return {"available": False, "reason": "No data yet."}
    df["date"] = pd.to_datetime(df["date"])
    for c in ("weight_kg", *LABELS):
        df[c] = pd.to_numeric(df.get(c), errors="coerce")
    df = df.set_index("date").sort_index()
    weekly = df.resample("W-SUN").agg({"weight_kg": "mean", "calories": "mean", "steps": "mean", "workouts": "sum", "sleep_hours": "mean", "protein": "mean"})
    weekly["weight_change"] = weekly["weight_kg"].diff()
    weekly = weekly.dropna(subset=["weight_change"])
    pairs = []
    if len(weekly) >= 5:
        for c in LABELS:
            sub = weekly[["weight_change", c]].dropna()
            if len(sub) >= 5 and sub[c].nunique() > 1:
                r = float(sub.corr(method="spearman").iloc[0, 1])
                if not np.isnan(r):
                    pairs.append({"factor": LABELS[c], "target": "Weekly weight change", "spearman_r": round(r, 2), "n_weeks": int(len(sub)), "strength": _strength(r)})
    d = df[["calories", "steps", "workouts", "sleep_hours"]].dropna(thresh=2)
    daily = []
    for a, b, label in [("sleep_hours", "workouts", "Sleep vs same-day workouts"), ("steps", "calories", "Steps vs calories eaten")]:
        sub = d[[a, b]].dropna()
        if len(sub) >= 10 and sub[a].nunique() > 1 and sub[b].nunique() > 1:
            r = float(sub.corr(method="spearman").iloc[0, 1])
            daily.append({"pair": label, "spearman_r": round(r, 2), "n_days": int(len(sub)), "strength": _strength(r)})
    if not pairs and not daily:
        return {"available": False, "reason": "Need about 5 weeks of weigh-ins plus food, steps or sleep logs to look for patterns."}
    return {"available": True, "weekly": pairs, "daily": daily,
            "caveat": "These are associations in your own data, not proof of cause and effect, and small samples are noisy."}
