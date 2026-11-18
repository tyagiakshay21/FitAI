from __future__ import annotations

import asyncio
import base64
import json
import os
import tempfile
import time

os.environ.setdefault("MPLCONFIGDIR", os.path.join(tempfile.gettempdir(), "matplotlib"))
from typing import Optional

import cv2
import jwt
import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .analyzers import create_analyzer
from .config import CONFIGS

JWT_SECRET = os.getenv("JWT_ACCESS_SECRET", "")
REQUIRE_AUTH = os.getenv("CV_REQUIRE_AUTH", "true").lower() != "false"
MAX_FRAME_BYTES = 2_000_000

app = FastAPI(title="FitAI Computer-Vision Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CLIENT_URL", "http://localhost:5173").split(","),
                   allow_methods=["*"], allow_headers=["*"])

DISCLAIMER = ("Form feedback is an algorithmic estimate from a single camera, not a medical assessment. "
              "It cannot diagnose injuries. Stop immediately if you feel pain.")


def verify(token: str) -> None:
    if not REQUIRE_AUTH:
        return
    if not JWT_SECRET:
        raise HTTPException(status_code=503, detail="Camera authentication is not configured")
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc


def decode(data: bytes):
    if len(data) > MAX_FRAME_BYTES:
        raise ValueError("Frame too large")
    frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("Could not decode image")
    return frame


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/exercises")
def exercises():
    return {"disclaimer": DISCLAIMER, "exercises": [
        {"key": c.key, "label": c.label, "camera_tip": c.camera_tip, "unit": "seconds" if c.key == "plank" else "reps",
         "score_components": list(c.weights)} for c in CONFIGS.values()]}


@app.post("/analyze/image")
async def analyze_image(exercise: str = Query(...), image: UploadFile = File(...), authorization: Optional[str] = Header(None)):
    """Stateless single-frame posture check (no rep counting)."""
    verify((authorization or "").removeprefix("Bearer ").strip())
    if exercise not in CONFIGS:
        raise HTTPException(404, "Unsupported exercise")
    from .pose import PoseEstimator

    try:
        frame = decode(await image.read())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    pose = PoseEstimator()
    try:
        lm = await asyncio.to_thread(pose.process, frame)
    finally:
        pose.close()
    if lm is None:
        return {"detected": False, "feedback": ["No person detected — make sure your whole body is in the frame"], "disclaimer": DISCLAIMER}
    h, w = frame.shape[:2]
    res = create_analyzer(exercise).update(lm, 0.0, aspect=w / h).to_dict()
    return {"detected": True, **res, "disclaimer": DISCLAIMER}


@app.websocket("/ws/analyze")
async def ws_analyze(ws: WebSocket, exercise: str = Query(...), token: str = Query(""),
                     weight_kg: float = Query(70, ge=30, le=300), target_reps: Optional[int] = Query(None, ge=1, le=500)):
    """Client streams JPEG frames (binary, or JSON {type:'frame', data:<base64>}); server replies with a result per frame.
    Control messages: {type:'reset'} and {type:'end'} (returns a session summary)."""
    if exercise not in CONFIGS:
        await ws.close(code=4404)
        return
    try:
        verify(token)
    except HTTPException:
        await ws.close(code=4401)
        return
    from .pose import PoseEstimator

    await ws.accept()
    analyzer = create_analyzer(exercise, weight_kg)
    pose = PoseEstimator()
    t0 = time.monotonic()
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            data: Optional[bytes] = msg.get("bytes")
            if data is None and msg.get("text"):
                try:
                    obj = json.loads(msg["text"])
                except json.JSONDecodeError:
                    continue
                kind = obj.get("type")
                if kind == "reset":
                    analyzer.reset()
                    t0 = time.monotonic()
                    continue
                if kind == "end":
                    await ws.send_json({"type": "summary", **analyzer.summary(time.monotonic() - t0), "target_reps": target_reps})
                    continue
                if kind == "frame":
                    data = base64.b64decode(str(obj.get("data", "")).split(",")[-1])
            if not data:
                continue
            try:
                frame = decode(data)
            except ValueError as exc:
                await ws.send_json({"type": "error", "message": str(exc)})
                continue
            now = time.monotonic() - t0
            h, w = frame.shape[:2]
            lm = await asyncio.to_thread(pose.process, frame)
            if lm is None:
                payload = analyzer.not_visible(now).to_dict()
                payload["feedback"] = ["No person detected — step back so your whole body is in the frame"]
                payload["landmarks"] = []
            else:
                payload = analyzer.update(lm, now, aspect=w / h).to_dict()
                payload["landmarks"] = [[round(x, 3), round(y, 3), round(v, 2)] for x, y, v in lm]
            await ws.send_json({"type": "result", **payload, "target_reps": target_reps})
    except Exception:  # client dropped mid-frame
        pass
    finally:
        pose.close()
