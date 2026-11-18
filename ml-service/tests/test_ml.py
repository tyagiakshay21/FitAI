import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app import adherence, correlations, weight, workout

client = TestClient(app)


def weight_rows(n=60, slope=-0.05, noise=0.3, seed=1, with_habits=True):
    rng = np.random.default_rng(seed)
    start = pd.Timestamp("2025-01-01")
    rows = []
    for i in range(n):
        rows.append({"date": (start + pd.Timedelta(days=i)).strftime("%Y-%m-%d"), "weight_kg": 80 + slope * i + rng.normal(0, noise),
                     "calories": 2000 + rng.normal(0, 100) if with_habits else None, "steps": 8000 + rng.normal(0, 800) if with_habits else None})
    return rows


def test_forecast_recovers_downward_trend():
    r = weight.forecast_weight(weight_rows(), 28, tdee=2500, target_weight_kg=75)
    assert r["available"] and r["weekly_rate_kg"] < 0
    assert abs(r["weekly_rate_kg"] - (-0.35)) < 0.15
    last = r["forecast"][-1]
    assert last["low"] < last["weight_kg"] < last["high"]
    assert r["target"]["status"] == "on_track"
    assert "limitations" in r


def test_forecast_refuses_tiny_history():
    assert weight.forecast_weight(weight_rows(3), 28)["available"] is False


def test_time_only_when_no_behavior_data():
    assert weight.forecast_weight(weight_rows(with_habits=False), 14)["model"] == "time_only"


def test_adherence_model_learns_signal():
    good = [{"date": f"2025-01-{i+1:02d}", "completed": True, "sleep_hours": 7.5} for i in range(20)]
    bad = [{"date": f"2025-01-{i+1:02d}", "completed": False, "sleep_hours": 5.0} for i in range(20)]
    t = {"date": "2025-02-03", "sleep_hours": 7}
    p_good = adherence.predict_adherence(good, t)["probability"]
    p_bad = adherence.predict_adherence(bad, t)["probability"]
    assert p_good > 0.7 > 0.4 > p_bad or (p_good - p_bad > 0.3)


def test_adherence_low_confidence_for_new_users():
    assert adherence.predict_adherence([], {"date": "2025-02-03"})["confidence"] == "low"


def _hist(weights, reps=10, rpe=7.5):
    return [{"date": f"2025-01-{(i*3)+1:02d}", "exercise": "Bench", "category": "CHEST", "muscles": ["chest"], "target_rep_max": 10,
             "sets": [{"reps": reps, "weight_kg": w, "rpe": rpe, "e1rm": round(w * (1 + reps / 30), 1)}] * 3} for i, w in enumerate(weights)]


def test_progression_increases_load_at_top_of_range():
    s = workout.exercise_suggestions(_hist([40, 40]))
    assert s[0]["action"] == "INCREASE_LOAD" and s[0]["suggested_weight_kg"] > 40


def test_progression_deloads_when_strength_drops():
    s = workout.exercise_suggestions(_hist([50, 48, 45, 42], reps=6))
    assert s[0]["action"] == "DELOAD" and s[0]["suggested_weight_kg"] < 42


def test_accessories_only_from_supplied_catalog():
    cat = [{"name": "Bench", "category": "CHEST", "muscles": ["chest"], "equipment": ["barbell"]},
           {"name": "Row", "category": "BACK", "muscles": ["lats"], "equipment": ["cable"]}]
    rec = workout.recommend(_hist([40, 40]), cat)
    assert [a["exercise"] for a in rec["accessories"]] == ["Row"]


def test_correlations_shape():
    rng = np.random.default_rng(3)
    rows = [{"date": (pd.Timestamp("2025-01-01") + pd.Timedelta(days=i)).strftime("%Y-%m-%d"), "weight_kg": 80 - i * 0.03 + rng.normal(0, .2),
             "calories": 2000 + rng.normal(0, 200), "steps": 8000 + rng.normal(0, 1500), "workouts": int(rng.integers(0, 2)), "sleep_hours": 7 + rng.normal(0, 1)} for i in range(70)]
    r = correlations.analyze(rows)
    assert r["available"] and r["weekly"] and "caveat" in r


def test_http_endpoints():
    assert client.get("/health").json() == {"status": "ok"}
    r = client.post("/predict/weight-trend", json={"rows": weight_rows(40), "horizon_days": 21})
    assert r.status_code == 200 and r.json()["available"]
