from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

from . import adherence, correlations, weight, workout

@asynccontextmanager
async def lifespan(_: FastAPI):
    adherence.get_model()  # load (or train) once so the first request is fast
    yield


app = FastAPI(title="FitAI ML Service", version="1.0.0", lifespan=lifespan)


class WeightReq(BaseModel):
    rows: list[dict[str, Any]]
    horizon_days: int = Field(28, ge=7, le=90)
    tdee: Optional[float] = None
    target_weight_kg: Optional[float] = None


class AdherenceReq(BaseModel):
    history: list[dict[str, Any]]
    target: dict[str, Any]


class WorkoutReq(BaseModel):
    history: list[dict[str, Any]] = []
    catalog: list[dict[str, Any]] = []


class RowsReq(BaseModel):
    rows: list[dict[str, Any]]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict/weight-trend")
def predict_weight(req: WeightReq):
    return weight.forecast_weight(req.rows, req.horizon_days, req.tdee, req.target_weight_kg)


@app.post("/predict/adherence")
def predict_adherence(req: AdherenceReq):
    return adherence.predict_adherence(req.history, req.target)


@app.post("/recommend/workout")
def recommend_workout(req: WorkoutReq):
    return workout.recommend(req.history, req.catalog)


@app.post("/analyze/correlations")
def analyze(req: RowsReq):
    return correlations.analyze(req.rows)
