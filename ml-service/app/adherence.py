"""Workout-adherence prediction.

A gradient-boosting classifier trained on *synthetic* behavioural sequences gives a cold-start prior; it is then
blended with the user's own smoothed completion rate once they have enough history. Features are computed only
from information available *before* the planned day, so there is no label leakage.
"""
from __future__ import annotations

import os
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier

MODEL_PATH = Path(os.getenv("MODEL_DIR", Path(__file__).resolve().parent.parent / "models")) / "adherence.joblib"
FEATURES = ["rate_last4", "rate_last8", "streak", "missed_streak", "prev_completed", "sleep_hours", "weekday"]


def _sleep(v) -> float:
    return 7.0 if v is None or (isinstance(v, float) and np.isnan(v)) else float(v)


def make_features(history: list[dict], idx: int, sleep: float | None, weekday: int) -> list[float]:
    """history[:idx] are the past planned sessions ({'completed': bool}); idx is the session being predicted."""
    past = [1.0 if h["completed"] else 0.0 for h in history[:idx]]
    last4 = past[-4:] or [0.7]
    last8 = past[-8:] or [0.7]
    streak = 0
    for v in reversed(past):
        if v == 1.0:
            streak += 1
        else:
            break
    missed = 0
    for v in reversed(past):
        if v == 0.0:
            missed += 1
        else:
            break
    return [float(np.mean(last4)), float(np.mean(last8)), min(streak, 12), min(missed, 6),
            past[-1] if past else 0.7, _sleep(sleep), weekday]


def synthetic_dataset(n_users: int = 500, n_sessions: int = 40, seed: int = 7):
    rng = np.random.default_rng(seed)
    X, y = [], []
    for _ in range(n_users):
        habit = rng.beta(2.5, 2.0)
        hist: list[dict] = []
        for i in range(n_sessions):
            sleep = float(np.clip(rng.normal(6.9, 1.0), 4, 9.5))
            weekday = int(rng.integers(0, 7))
            f = make_features(hist, i, sleep, weekday)
            logit = (-1.2 + 3.0 * habit + 0.6 * (f[4] - 0.5) + 0.05 * f[2] - 0.25 * f[3]
                     + 0.35 * (sleep - 7.0) - (0.4 if weekday in (5, 6) else 0.0))
            p = 1 / (1 + np.exp(-logit))
            done = bool(rng.random() < p)
            X.append(f)
            y.append(int(done))
            hist.append({"completed": done})
    return np.array(X), np.array(y)


def train_and_save() -> GradientBoostingClassifier:
    X, y = synthetic_dataset()
    model = GradientBoostingClassifier(n_estimators=120, max_depth=3, learning_rate=0.08, random_state=7).fit(X, y)
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    return model


_model: GradientBoostingClassifier | None = None


def get_model() -> GradientBoostingClassifier:
    global _model
    if _model is None:
        _model = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else train_and_save()
    return _model


def predict_adherence(history: list[dict], target: dict) -> dict:
    import pandas as pd

    hist = sorted(history, key=lambda h: h["date"])
    n = len(hist)
    weekday = int(pd.Timestamp(target["date"]).weekday()) if target.get("date") else 0
    x = np.array([make_features(hist, n, target.get("sleep_hours"), weekday)])
    p_model = float(get_model().predict_proba(x)[0, 1])
    done = [1.0 if h["completed"] else 0.0 for h in hist]
    if n >= 8:
        weights = np.linspace(0.5, 1.0, num=len(done[-12:]))
        p_user = float((np.dot(weights, done[-12:]) + 1) / (weights.sum() + 2))  # Laplace-smoothed, recent-weighted
        p, confidence = 0.6 * p_model + 0.4 * p_user, ("high" if n >= 20 else "medium")
    else:
        p, confidence = p_model, "low"
    f = dict(zip(FEATURES, x[0]))
    drivers = []
    if f["rate_last4"] >= 0.75: drivers.append("You completed most of your last few planned sessions.")
    if f["rate_last4"] < 0.5: drivers.append("Several recent planned sessions were missed.")
    if f["missed_streak"] >= 2: drivers.append(f"You have missed {int(f['missed_streak'])} planned sessions in a row.")
    if f["streak"] >= 3: drivers.append(f"You are on a {int(f['streak'])}-session run.")
    if f["sleep_hours"] < 6: drivers.append("Short sleep lowers the odds of completing a session.")
    tips = []
    if p < 0.55: tips += ["Plan a shorter version (e.g. 25–30 minutes) to keep the habit.", "Lay out your kit the night before."]
    return {"probability": round(p, 2), "confidence": confidence, "sessions_in_history": n,
            "drivers": drivers, "suggestions": tips,
            "method": "Gradient boosting prior (synthetic behavioural data) blended with your own recent completion rate",
            "limitations": ["Probability, not a promise: life events are not in the data.",
                            "The prior model is trained on simulated behaviour and is most useful for new users."]}
