"""Pose geometry helpers. Landmarks follow MediaPipe Pose's 33-point topology."""
from __future__ import annotations

import math
from typing import Sequence

# MediaPipe landmark indices
NOSE = 0
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28

Point = tuple[float, float]


def angle(a: Point, b: Point, c: Point) -> float:
    """Interior angle ABC in degrees (0–180), measured at B."""
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    n = math.hypot(*v1) * math.hypot(*v2)
    if n < 1e-9:
        return 0.0
    cos = (v1[0] * v2[0] + v1[1] * v2[1]) / n
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def from_vertical(a: Point, b: Point) -> float:
    """Angle (0–90°) between the segment a→b and the vertical axis."""
    return math.degrees(math.atan2(abs(b[0] - a[0]), abs(b[1] - a[1]) + 1e-9))


def dist(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def lerp_score(value: float, best: float, worst: float, floor: float = 0.0, ceil: float = 100.0) -> float:
    """100 at `best`, falling linearly to `floor` at `worst` (works in either direction)."""
    if best == worst:
        return ceil
    t = (value - best) / (worst - best)
    t = max(0.0, min(1.0, t))
    return ceil - t * (ceil - floor)


class Body:
    """Landmarks in an aspect-corrected space so angles are not distorted by non-square frames."""

    def __init__(self, landmarks: Sequence[Sequence[float]], aspect: float = 1.0):
        self.p = [(l[0] * aspect, l[1], l[2] if len(l) > 2 else 1.0) for l in landmarks]

    def xy(self, i: int) -> Point:
        return self.p[i][0], self.p[i][1]

    def vis(self, i: int) -> float:
        return self.p[i][2]

    def visible(self, *idx: int, thr: float = 0.5) -> bool:
        return all(self.vis(i) >= thr for i in idx)

    def angle(self, a: int, b: int, c: int) -> float:
        return angle(self.xy(a), self.xy(b), self.xy(c))

    def best_side(self, left: Sequence[int], right: Sequence[int]) -> Sequence[int]:
        lv = min(self.vis(i) for i in left)
        rv = min(self.vis(i) for i in right)
        return left if lv >= rv else right

    def mid(self, a: int, b: int) -> Point:
        (ax, ay), (bx, by) = self.xy(a), self.xy(b)
        return (ax + bx) / 2, (ay + by) / 2

    def is_frontal(self) -> bool:
        """Facing the camera: shoulders are wide relative to torso height."""
        sh = dist(self.xy(L_SHOULDER), self.xy(R_SHOULDER))
        torso = dist(self.mid(L_SHOULDER, R_SHOULDER), self.mid(L_HIP, R_HIP))
        return torso > 1e-6 and sh / torso > 0.55


class Ema:
    def __init__(self, alpha: float = 0.5):
        self.alpha, self.v = alpha, None

    def __call__(self, x: float) -> float:
        self.v = x if self.v is None else self.alpha * x + (1 - self.alpha) * self.v
        return self.v

    def reset(self):
        self.v = None
