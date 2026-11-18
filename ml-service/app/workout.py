"""Progressive-overload suggestions and accessory-exercise recommendations from a user's history."""
from __future__ import annotations

from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

PUSH = {"CHEST", "SHOULDERS", "TRICEPS"}
PULL = {"BACK", "BICEPS"}
LOWER = {"LEGS", "GLUTES"}


def _round_half(x: float) -> float:
    return round(x * 2) / 2


def exercise_suggestions(history: list[dict]) -> list[dict]:
    by_ex: dict[str, list[dict]] = defaultdict(list)
    for h in history:
        by_ex[h["exercise"]].append(h)
    out = []
    for name, sessions in by_ex.items():
        sessions.sort(key=lambda s: s["date"])
        last = sessions[-1]
        weighted = [s for s in last["sets"] if s.get("weight_kg")]
        if not weighted:
            continue
        top_w = max(s["weight_kg"] for s in weighted)
        rpes = [s["rpe"] for s in last["sets"] if s.get("rpe")]
        avg_rpe = float(np.mean(rpes)) if rpes else None
        hit_top = all(s["reps"] >= last["target_rep_max"] for s in weighted)
        e1rms = [max((s["e1rm"] or 0) for s in x["sets"]) for x in sessions]
        rec = {"exercise": name, "sessions": len(sessions), "last_top_weight_kg": top_w,
               "est_1rm_kg": round(float(e1rms[-1]), 1), "action": "HOLD", "suggested_weight_kg": top_w,
               "reason": "Keep the load and aim to add reps within the target range."}
        recent = e1rms[-4:]
        slope = None
        if len(sessions) >= 3:
            days = np.array([(pd.Timestamp(s["date"]) - pd.Timestamp(sessions[0]["date"])).days for s in sessions[-6:]], dtype=float)
            vals = np.array(e1rms[-6:], dtype=float)
            if np.ptp(days) > 0:
                slope = float(np.polyfit(days, vals, 1)[0]) * 7  # kg of e1RM per week
        rec["e1rm_trend_kg_per_week"] = None if slope is None else round(slope, 2)
        if len(sessions) >= 3 and slope is not None and slope < 0 and (max(recent) - recent[-1]) / max(max(recent), 1) > 0.03:
            rec.update(action="DELOAD", suggested_weight_kg=_round_half(top_w * 0.9),
                       reason="Estimated strength has dropped over recent sessions; a lighter week may help recovery.")
        elif hit_top and (avg_rpe is None or avg_rpe <= 8.5):
            rec.update(action="INCREASE_LOAD", suggested_weight_kg=_round_half(top_w + max(1.0, 0.025 * top_w)),
                       reason="You hit the top of the rep range on every set at a manageable effort.")
        elif len(sessions) >= 4 and (max(recent) - min(recent)) / max(max(recent), 1) < 0.02:
            rec.update(action="PLATEAU", reason="Estimated strength has been flat for 4 sessions; try an extra set, a different rep range, or more recovery.")
        out.append(rec)
    return sorted(out, key=lambda r: r["exercise"])


def balance_report(history: list[dict], days: int = 28) -> dict:
    if not history:
        return {"available": False}
    df = pd.DataFrame([{"date": h["date"], "category": h["category"], "sets": len(h["sets"])} for h in history])
    df["date"] = pd.to_datetime(df["date"])
    df = df[df["date"] >= df["date"].max() - pd.Timedelta(days=days)]
    tot = df.groupby("category")["sets"].sum().to_dict()
    flags = []
    push, pull, lower = (sum(tot.get(c, 0) for c in g) for g in (PUSH, PULL, LOWER))
    if push and pull and push / pull > 1.6: flags.append("Pushing volume is well above pulling volume; add more rows or pulldowns.")
    if pull and push and pull / push > 1.6: flags.append("Pulling volume is well above pushing volume.")
    upper = push + pull
    if upper and lower / upper < 0.4: flags.append("Lower-body volume is low relative to upper body.")
    return {"available": True, "sets_by_category": {k: int(v) for k, v in tot.items()}, "flags": flags,
            "underworked": [c for c in ("CHEST", "BACK", "SHOULDERS", "LEGS", "GLUTES", "CORE") if tot.get(c, 0) < 0.5 * (np.mean(list(tot.values())) if tot else 0)]}


def recommend_accessories(history: list[dict], catalog: list[dict], underworked: list[str], k: int = 5) -> list[dict]:
    """Content-based: cosine similarity between the user's exercise profile and catalog items, boosted for underworked areas."""
    done = {h["exercise"] for h in history}
    pool = [c for c in catalog if c["name"] not in done]
    if not pool:
        return []
    tokens = lambda c: [f"cat:{c['category']}"] + [f"m:{m}" for m in c.get("muscles", [])] + [f"eq:{e}" for e in c.get("equipment", [])]  # noqa: E731
    vocab = sorted({t for c in catalog for t in tokens(c)})
    index = {t: i for i, t in enumerate(vocab)}

    def vec(items):
        v = np.zeros(len(vocab))
        for c in items:
            for t in tokens(c):
                v[index[t]] += 1
        return v

    hist_items = [c for c in catalog if c["name"] in done]
    user_vec = vec(hist_items) if hist_items else np.ones(len(vocab))
    sims = cosine_similarity([user_vec], np.array([vec([c]) for c in pool]))[0]
    scored = []
    for c, s in zip(pool, sims):
        boost = 0.3 if c["category"] in underworked else 0.0
        scored.append((float(s) + boost, c, boost > 0))
    scored.sort(key=lambda x: -x[0])
    return [{"exercise": c["name"], "category": c["category"], "equipment": c["equipment"],
             "why": "Targets an area you have trained less recently" if under else "Similar to exercises you already do and can equip"}
            for _, c, under in scored[:k]]


def recommend(history: list[dict], catalog: list[dict]) -> dict:
    bal = balance_report(history)
    return {"progression": exercise_suggestions(history), "balance": bal,
            "accessories": recommend_accessories(history, catalog, bal.get("underworked", [])),
            "method": "Estimated 1RM trend (Epley) with rule-based progression; content-based similarity for accessories",
            "limitations": ["Suggestions are general. Choose loads you can lift with good form and stop if something hurts."]}
