"""Exercise analysers: rep-counting state machines + configurable form scoring.

Every analyser consumes MediaPipe pose landmarks (normalised x, y, visibility) frame by frame and returns a
FrameResult. Rep counting is a real state machine (rest → going → peak → returning → rest), not a per-frame count,
with hysteresis so jitter around a threshold cannot create phantom reps.

IMPORTANT: form feedback is a 2-D geometric *estimate* from a single camera. It is not a medical assessment and
cannot diagnose injuries. Components that cannot be measured from the current camera angle are reported as
`None` and excluded from the score rather than guessed.
"""
from __future__ import annotations

from collections import Counter, deque
from dataclasses import dataclass, field
from statistics import mean, pstdev
from typing import Optional, Sequence

from .config import CONFIGS, ExerciseConfig
from .geometry import (L_ANKLE, L_ELBOW, L_HIP, L_KNEE, L_SHOULDER, L_WRIST, NOSE, R_ANKLE, R_ELBOW, R_HIP,
                       R_KNEE, R_SHOULDER, R_WRIST, Body, Ema, angle, dist, from_vertical, lerp_score)

LEFT_LEG = (L_SHOULDER, L_HIP, L_KNEE, L_ANKLE)
RIGHT_LEG = (R_SHOULDER, R_HIP, R_KNEE, R_ANKLE)
LEFT_ARM = (L_SHOULDER, L_ELBOW, L_WRIST, L_HIP)
RIGHT_ARM = (R_SHOULDER, R_ELBOW, R_WRIST, R_HIP)
LEFT_BODY = (L_SHOULDER, L_HIP, L_ANKLE)
RIGHT_BODY = (R_SHOULDER, R_HIP, R_ANKLE)

Comps = dict[str, Optional[float]]


@dataclass
class FrameResult:
    exercise: str
    reps: int
    phase: str
    form_score: Optional[float]
    breakdown: dict[str, float]
    feedback: list[str]
    calories: float
    angles: dict[str, float]
    visible: bool = True
    hold_seconds: float = 0.0
    rep_completed: bool = False
    last_rep_score: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "exercise": self.exercise, "reps": self.reps, "phase": self.phase,
            "form_score": None if self.form_score is None else round(self.form_score),
            "breakdown": {k: round(v) for k, v in self.breakdown.items()},
            "feedback": self.feedback, "calories": round(self.calories, 1),
            "angles": {k: round(v) for k, v in self.angles.items()}, "visible": self.visible,
            "hold_seconds": round(self.hold_seconds, 1), "rep_completed": self.rep_completed,
            "last_rep_score": None if self.last_rep_score is None else round(self.last_rep_score),
        }


def tempo_score(duration: float, ok: tuple[float, float]) -> float:
    lo, hi = ok
    if duration < lo:
        return lerp_score(duration, lo, lo * 0.4, floor=50)
    if duration > hi:
        return lerp_score(duration, hi, hi * 2.5, floor=70)
    return 100.0


class BaseAnalyzer:
    def __init__(self, cfg: ExerciseConfig, weight_kg: float = 70.0):
        self.cfg = cfg
        self.weight_kg = weight_kg
        self.reset()

    def reset(self) -> None:
        self.reps = 0
        self.rep_scores: list[float] = []
        self.rep_breakdowns: list[dict[str, float]] = []
        self.feedback_counts: Counter[str] = Counter()
        self.phase = "rest"
        self.start_t: Optional[float] = None
        self.last_t: Optional[float] = None
        self.recent: deque[tuple[float, str]] = deque(maxlen=4)
        self.last_rep_score: Optional[float] = None

    # ----- shared helpers -----
    def weighted(self, comps: Comps) -> Optional[float]:
        """Weighted mean over the components that were actually measured (weights are renormalised)."""
        num = den = 0.0
        for k, v in comps.items():
            w = self.cfg.weights.get(k, 0.0)
            if v is not None and w > 0:
                num += w * v
                den += w
        return num / den if den else None

    def calories(self, t: float) -> float:
        if self.start_t is None:
            return 0.0
        return self.cfg.met * self.weight_kg * max(0.0, t - self.start_t) / 3600.0

    def _log(self, msgs: Sequence[str]) -> None:
        for m in msgs:
            if m != "Good form":
                self.feedback_counts[m] += 1

    def _result(self, t: float, feedback: list[str], angles: dict[str, float], frame: Comps, visible=True,
                completed=False, hold=0.0) -> FrameResult:
        breakdown: dict[str, float] = {}
        if self.rep_breakdowns:
            for k in self.rep_breakdowns[0]:
                vals = [b[k] for b in self.rep_breakdowns if k in b]
                breakdown[k] = mean(vals)
            score: Optional[float] = mean(self.rep_scores)
        else:
            breakdown = {k: v for k, v in frame.items() if v is not None}
            score = self.weighted(frame) if breakdown else None
        return FrameResult(self.cfg.key, self.reps, self.phase, score, breakdown, feedback, self.calories(t), angles,
                           visible, hold, completed, self.last_rep_score)

    def not_visible(self, t: float) -> FrameResult:
        return self._result(t, ["Step back so your whole body is in the frame"], {}, {}, visible=False)

    def summary(self, duration_s: Optional[float] = None) -> dict:
        breakdown = {}
        if self.rep_breakdowns:
            for k in self.rep_breakdowns[0]:
                breakdown[k] = round(mean(b[k] for b in self.rep_breakdowns if k in b))
        common = [{"message": m, "count": c} for m, c in self.feedback_counts.most_common(5)]
        return {
            "exercise": self.cfg.label, "reps": self.reps,
            "avg_form_score": round(mean(self.rep_scores)) if self.rep_scores else 0,
            "breakdown": breakdown, "feedback_summary": common,
            "duration_s": round(duration_s if duration_s is not None else ((self.last_t or 0) - (self.start_t or 0))),
            "calories_estimate": round(self.calories(self.last_t or 0), 1),
            "disclaimer": "Algorithmic estimate from a single camera, not a medical assessment. Stop if you feel pain.",
        }

    def update(self, landmarks, t: float, aspect: float = 1.0) -> FrameResult:  # pragma: no cover - abstract
        raise NotImplementedError


class RepAnalyzer(BaseAnalyzer):
    """Angle-driven exercises. Subclasses provide the primary angle and per-frame form checks."""

    depth_key = "depth"
    depth_msg = "Go slightly deeper"

    def __init__(self, cfg: ExerciseConfig, weight_kg: float = 70.0):
        super().__init__(cfg, weight_kg)
        self.ema = Ema(0.55)

    def reset(self) -> None:
        super().reset()
        self.max_p = 0.0
        self.rep_t0 = 0.0
        self.buf: list[Comps] = []
        if hasattr(self, "ema"):
            self.ema.reset()

    # ----- to override -----
    def measure(self, b: Body) -> Optional[tuple[float, dict[str, float]]]:
        """Return (primary angle, dict of named angles) or None if landmarks are not usable."""
        raise NotImplementedError

    def frame_checks(self, b: Body, p: float, angles: dict[str, float]) -> tuple[Comps, list[str]]:
        return {}, []

    # ----- state machine -----
    def update(self, landmarks, t: float, aspect: float = 1.0) -> FrameResult:
        b = Body(landmarks, aspect)
        m = self.measure(b)
        if m is None:
            return self.not_visible(t)
        raw, angles = m
        a = self.ema(raw)
        angles["primary"] = a
        rest, peak = self.cfg.rest_angle, self.cfg.peak_angle
        p = max(0.0, min(1.0, (rest - a) / (rest - peak)))
        comps, issues = self.frame_checks(b, p, angles)
        completed = False

        if self.phase == "rest":
            if p > 0.15:
                self.phase, self.rep_t0, self.max_p, self.buf = "going", t, p, []
                if self.start_t is None:
                    self.start_t = t
        else:
            self.max_p = max(self.max_p, p)
            self.buf.append(comps)
            if self.phase == "going":
                if p >= 0.85:
                    self.phase = "peak"
                elif p < 0.10:
                    completed = self._finish(t)
            elif self.phase == "peak":
                if p < 0.80:
                    self.phase = "returning"
            elif self.phase == "returning":
                if p >= 0.85:
                    self.phase = "peak"
                elif p < 0.10:
                    completed = self._finish(t)

        self.last_t = t
        moving = self.phase != "rest"
        feedback = list(dict.fromkeys(issues if (moving or p > 0.3) else []))
        feedback += [m for ts, m in self.recent if t - ts < 2.0 and m not in feedback]
        if not feedback and moving:
            feedback = ["Good form"]
        self._log(issues if moving else [])
        return self._result(t, feedback, angles, comps, completed=completed)

    def _finish(self, t: float) -> bool:
        dur = t - self.rep_t0
        self.phase = "rest"
        if self.max_p < self.cfg.count_threshold:
            if self.max_p > 0.3:
                self.recent.append((t, self.depth_msg + " — that rep did not count"))
                self.feedback_counts[self.depth_msg] += 1
            return False
        comps: Comps = {}
        for k in {k for c in self.buf for k in c}:
            vals = [c[k] for c in self.buf if c.get(k) is not None]
            comps[k] = mean(vals) if vals else None
        comps[self.depth_key] = lerp_score(self.max_p, self.cfg.good_depth, self.cfg.count_threshold, floor=60)
        comps["tempo"] = tempo_score(dur, self.cfg.tempo_ok)
        score = self.weighted(comps)
        self.reps += 1
        self.rep_scores.append(score if score is not None else 100.0)
        self.rep_breakdowns.append({k: v for k, v in comps.items() if v is not None})
        self.last_rep_score = self.rep_scores[-1]
        if self.max_p < self.cfg.good_depth:
            self.recent.append((t, self.depth_msg))
            self.feedback_counts[self.depth_msg] += 1
        if dur < self.cfg.tempo_ok[0]:
            self.recent.append((t, "Slow down and control the movement"))
            self.feedback_counts["Slow down and control the movement"] += 1
        if self.last_rep_score >= 85 and not self.recent:
            self.recent.append((t, "Good rep"))
        return True


def _sag_or_pike(b: Body, s: int, h: int, a: int) -> str:
    (sx, sy), (hx, hy), (ax, ay) = b.xy(s), b.xy(h), b.xy(a)
    if abs(ax - sx) < 1e-3:
        return "Keep your body in one straight line"
    line_y = sy + (hx - sx) * (ay - sy) / (ax - sx)
    return "Keep your hips up — don't let them sag" if hy > line_y else "Lower your hips — keep a straight line"


class Squat(RepAnalyzer):
    def measure(self, b):
        side = b.best_side(LEFT_LEG, RIGHT_LEG)
        if not b.visible(*side):
            return None
        s, h, k, a = side
        knees = [b.angle(hh, kk, aa) for hh, kk, aa, ok in ((L_HIP, L_KNEE, L_ANKLE, b.visible(L_HIP, L_KNEE, L_ANKLE)),
                                                              (R_HIP, R_KNEE, R_ANKLE, b.visible(R_HIP, R_KNEE, R_ANKLE))) if ok]
        return mean(knees), {"knee": mean(knees), "hip": b.angle(s, h, k)}

    def frame_checks(self, b, p, angles):
        s, h, *_ = b.best_side(LEFT_LEG, RIGHT_LEG)
        lean = from_vertical(b.xy(h), b.xy(s))
        comps: Comps = {"back_position": lerp_score(lean, 45, 70, floor=40), "knee_alignment": None}
        issues: list[str] = []
        angles["torso_lean"] = lean
        if p > 0.3 and lean > 75:
            issues.append("Keep your back more neutral")
        elif p > 0.3 and lean > 60:
            issues.append("Keep your chest up")
        if b.is_frontal() and b.visible(L_KNEE, R_KNEE, L_ANKLE, R_ANKLE):
            aw = abs(b.xy(L_ANKLE)[0] - b.xy(R_ANKLE)[0])
            if aw > 0.05:
                ratio = abs(b.xy(L_KNEE)[0] - b.xy(R_KNEE)[0]) / aw
                comps["knee_alignment"] = lerp_score(ratio, 0.95, 0.65, floor=40)
                if p > 0.35 and ratio < 0.8:
                    issues.append("Your knees are moving inward — push them out over your toes")
        return comps, issues


class Pushup(RepAnalyzer):
    def measure(self, b):
        side = b.best_side(LEFT_ARM, RIGHT_ARM)
        if not b.visible(*side):
            return None
        s, e, w, h = side
        return b.angle(s, e, w), {"elbow": b.angle(s, e, w)}

    def frame_checks(self, b, p, angles):
        left = b.best_side(LEFT_ARM, RIGHT_ARM) is LEFT_ARM
        s, h = (L_SHOULDER, L_HIP) if left else (R_SHOULDER, R_HIP)
        a = next((i for i in ((L_ANKLE, L_KNEE) if left else (R_ANKLE, R_KNEE)) if b.visible(i)), None)
        if a is None:
            return {"body_line": None}, []
        line = b.angle(s, h, a)
        angles["body_line"] = line
        issues = [_sag_or_pike(b, s, h, a)] if line < 160 else []
        return {"body_line": lerp_score(line, 165, 140, floor=40)}, issues


class Lunge(RepAnalyzer):
    def measure(self, b):
        need = (L_HIP, L_KNEE, L_ANKLE, R_HIP, R_KNEE, R_ANKLE)
        if not b.visible(*need):
            return None
        l, r = b.angle(L_HIP, L_KNEE, L_ANKLE), b.angle(R_HIP, R_KNEE, R_ANKLE)
        return min(l, r), {"knee_left": l, "knee_right": r}

    def frame_checks(self, b, p, angles):
        lean = from_vertical(b.mid(L_HIP, R_HIP), b.mid(L_SHOULDER, R_SHOULDER))
        angles["torso_lean"] = lean
        comps: Comps = {"torso_upright": lerp_score(lean, 15, 40, floor=40), "front_knee": None}
        issues = ["Keep your torso upright"] if p > 0.3 and lean > 30 else []
        front = (L_HIP, L_KNEE, L_ANKLE) if angles["knee_left"] <= angles["knee_right"] else (R_HIP, R_KNEE, R_ANKLE)
        hx, kx, ax = b.xy(front[0])[0], b.xy(front[1])[0], b.xy(front[2])[0]
        shin = dist(b.xy(front[1]), b.xy(front[2]))
        if shin > 1e-3 and abs(kx - hx) > 0.02:
            direction = 1 if kx > hx else -1
            forward = (kx - ax) * direction / shin
            comps["front_knee"] = lerp_score(forward, 0.35, 0.8, floor=50)
            if p > 0.4 and forward > 0.7:
                issues.append("Shift your weight back — your front knee is well past your toes")
        return comps, issues


class BicepCurl(RepAnalyzer):
    depth_key = "range"
    depth_msg = "Curl a little higher"

    def measure(self, b):
        side = b.best_side(LEFT_ARM, RIGHT_ARM)
        if not b.visible(*side[:3]):
            return None
        s, e, w, _ = side
        return b.angle(s, e, w), {"elbow": b.angle(s, e, w)}

    def frame_checks(self, b, p, angles):
        s, e, w, h = b.best_side(LEFT_ARM, RIGHT_ARM)
        arm = from_vertical(b.xy(s), b.xy(e))
        comps: Comps = {"elbow_stability": lerp_score(arm, 20, 50, floor=40), "body_swing": None}
        issues = ["Keep your elbow pinned to your side"] if arm > 35 else []
        if b.visible(h):
            lean = from_vertical(b.xy(h), b.xy(s))
            comps["body_swing"] = lerp_score(lean, 8, 25, floor=40)
            if lean > 18:
                issues.append("Avoid swinging — keep your torso still")
        return comps, issues


class ShoulderPress(RepAnalyzer):
    depth_key = "lockout"
    depth_msg = "Press all the way overhead"

    def measure(self, b):
        need = (L_SHOULDER, L_ELBOW, L_WRIST, R_SHOULDER, R_ELBOW, R_WRIST)
        if not b.visible(*need):
            return None
        l, r = b.angle(L_SHOULDER, L_ELBOW, L_WRIST), b.angle(R_SHOULDER, R_ELBOW, R_WRIST)
        return (l + r) / 2, {"elbow_left": l, "elbow_right": r}

    def frame_checks(self, b, p, angles):
        diff = abs(angles["elbow_left"] - angles["elbow_right"])
        comps: Comps = {"symmetry": lerp_score(diff, 10, 35, floor=40), "trunk_lean": None}
        issues = ["Press both arms evenly"] if p > 0.3 and diff > 25 else []
        if b.visible(L_HIP, R_HIP):
            lean = from_vertical(b.mid(L_HIP, R_HIP), b.mid(L_SHOULDER, R_SHOULDER))
            comps["trunk_lean"] = lerp_score(lean, 8, 25, floor=40)
            if lean > 18:
                issues.append("Keep your torso upright — avoid leaning or arching")
        return comps, issues


class Plank(BaseAnalyzer):
    """Isometric hold: accumulates hold time while the body line stays acceptable."""

    def reset(self) -> None:
        super().reset()
        self.hold = 0.0
        self.line_scores: list[float] = []
        self.stab_scores: list[float] = []
        self.hip_y: deque[tuple[float, float]] = deque()

    def update(self, landmarks, t, aspect=1.0):
        b = Body(landmarks, aspect)
        side = b.best_side(LEFT_BODY, RIGHT_BODY)
        if not b.visible(*side):
            return self.not_visible(t)
        s, h, a = side
        line = b.angle(s, h, a)
        horizontal = from_vertical(b.xy(s), b.xy(h)) > 60
        self.hip_y.append((t, b.xy(h)[1]))
        while self.hip_y and t - self.hip_y[0][0] > 1.5:
            self.hip_y.popleft()
        sway = pstdev([y for _, y in self.hip_y]) if len(self.hip_y) > 3 else 0.0
        comps: Comps = {"body_line": lerp_score(line, 170, 145, floor=30), "stability": lerp_score(sway, 0.005, 0.03, floor=40)}
        issues: list[str] = []
        holding = horizontal and comps["body_line"] >= 70
        dt = min(0.5, t - self.last_t) if self.last_t is not None else 0.0
        if not horizontal:
            self.phase = "rest"
            issues = ["Get into a plank position, side-on to the camera"]
        else:
            if line < 160:
                issues.append(_sag_or_pike(b, s, h, a))
            if holding:
                self.phase = "holding"
                if self.start_t is None:
                    self.start_t = t
                self.hold += dt
                self.line_scores.append(comps["body_line"])
                self.stab_scores.append(comps["stability"])
            else:
                self.phase = "rest"
        self.last_t = t
        self.reps = int(self.hold)  # seconds held
        self.rep_scores = [self.weighted({"body_line": mean(self.line_scores), "stability": mean(self.stab_scores)})] if self.line_scores else []
        self.rep_breakdowns = [{"body_line": mean(self.line_scores), "stability": mean(self.stab_scores)}] if self.line_scores else []
        self._log(issues)
        fb = issues or (["Good form — keep breathing"] if holding else [])
        return self._result(t, fb, {"body_line": line}, comps, hold=self.hold)

    def summary(self, duration_s=None):
        s = super().summary(duration_s)
        s["hold_seconds"] = round(self.hold, 1)
        s["reps"] = int(self.hold)
        return s


class JumpingJack(BaseAnalyzer):
    def reset(self) -> None:
        super().reset()
        self.state = "closed"
        self.t0 = 0.0
        self.max_arm = -9.0
        self.max_leg = 0.0
        self.tempo_ok = self.cfg.tempo_ok

    def update(self, landmarks, t, aspect=1.0):
        b = Body(landmarks, aspect)
        need = (L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST, L_ANKLE, R_ANKLE)
        if not b.visible(*need):
            return self.not_visible(t)
        sw = dist(b.xy(L_SHOULDER), b.xy(R_SHOULDER))
        if sw < 0.03:
            self.last_t = t
            return self._result(t, ["Face the camera so both shoulders are visible"], {}, {})
        sy = (b.xy(L_SHOULDER)[1] + b.xy(R_SHOULDER)[1]) / 2
        wy = (b.xy(L_WRIST)[1] + b.xy(R_WRIST)[1]) / 2
        arm = (sy - wy) / sw  # >0: wrists above shoulders
        leg = abs(b.xy(L_ANKLE)[0] - b.xy(R_ANKLE)[0]) / sw
        completed = False
        if self.state == "closed":
            self.phase = "closed"
            if arm >= 0.6 and leg >= 1.4:
                self.state, self.phase, self.t0, self.max_arm, self.max_leg = "open", "open", t, arm, leg
                if self.start_t is None:
                    self.start_t = t
        else:
            self.max_arm, self.max_leg = max(self.max_arm, arm), max(self.max_leg, leg)
            if arm <= -0.3 and leg <= 1.0:
                completed = True
                self.state, self.phase = "closed", "closed"
                comps: Comps = {
                    "arm_range": lerp_score(self.max_arm, 1.2, 0.6, floor=50),
                    "leg_range": lerp_score(self.max_leg, 1.8, 1.4, floor=50),
                    "tempo": tempo_score(t - self.t0, self.tempo_ok),
                }
                score = self.weighted(comps) or 100.0
                self.reps += 1
                self.rep_scores.append(score)
                self.rep_breakdowns.append(comps)  # type: ignore[arg-type]
                self.last_rep_score = score
                if self.max_arm < 1.2:
                    self.recent.append((t, "Raise your arms fully overhead"))
                    self.feedback_counts["Raise your arms fully overhead"] += 1
                if self.max_leg < 1.8:
                    self.recent.append((t, "Jump your feet a little wider"))
                    self.feedback_counts["Jump your feet a little wider"] += 1
        self.last_t = t
        fb = [m for ts, m in self.recent if t - ts < 2.0]
        if not fb and self.state == "open":
            fb = ["Good form"]
        return self._result(t, fb, {"arm_raise": arm, "leg_spread": leg}, {}, completed=completed)


ANALYZERS = {"squat": Squat, "pushup": Pushup, "lunge": Lunge, "bicep_curl": BicepCurl,
             "shoulder_press": ShoulderPress, "plank": Plank, "jumping_jack": JumpingJack}


def create_analyzer(exercise: str, weight_kg: float = 70.0) -> BaseAnalyzer:
    if exercise not in ANALYZERS:
        raise KeyError(exercise)
    return ANALYZERS[exercise](CONFIGS[exercise], weight_kg)
