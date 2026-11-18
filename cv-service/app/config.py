"""Configurable thresholds, score weights and MET values per exercise.

All numbers are heuristics chosen for a general adult audience; tune them (or load from JSON) per product need.
MET values are ballpark figures from the Compendium of Physical Activities; calories are an *estimate*:
kcal = MET × body weight (kg) × hours.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExerciseConfig:
    key: str
    label: str
    met: float
    camera_tip: str
    rest_angle: float = 0.0        # primary joint angle at the start/end of a rep
    peak_angle: float = 0.0        # primary joint angle at the hardest point
    count_threshold: float = 0.75  # min fraction of range of motion for a rep to count
    good_depth: float = 0.9        # fraction of ROM considered "full depth"
    tempo_ok: tuple[float, float] = (1.2, 6.0)  # seconds per rep considered controlled
    weights: dict[str, float] = field(default_factory=dict)  # score-component weights


CONFIGS: dict[str, ExerciseConfig] = {
    "squat": ExerciseConfig("squat", "Squat", 5.0, "Stand side-on to the camera (or 45°), full body in frame.",
                            170, 90, 0.75, 0.9, (1.5, 6.0),
                            {"depth": 0.3, "knee_alignment": 0.25, "back_position": 0.25, "tempo": 0.2}),
    "pushup": ExerciseConfig("pushup", "Push-up", 4.0, "Place the camera to your side at floor height, full body in frame.",
                             165, 90, 0.75, 0.9, (1.0, 5.0),
                             {"depth": 0.3, "body_line": 0.4, "tempo": 0.3}),
    "lunge": ExerciseConfig("lunge", "Lunge", 4.5, "Stand side-on to the camera, full body in frame.",
                            165, 95, 0.75, 0.9, (1.5, 6.0),
                            {"depth": 0.3, "torso_upright": 0.3, "front_knee": 0.2, "tempo": 0.2}),
    "bicep_curl": ExerciseConfig("bicep_curl", "Bicep curl", 3.5, "Stand side-on so the working arm faces the camera; show hip to wrist.",
                                 160, 45, 0.75, 0.9, (1.2, 6.0),
                                 {"range": 0.3, "elbow_stability": 0.35, "body_swing": 0.15, "tempo": 0.2}),
    "shoulder_press": ExerciseConfig("shoulder_press", "Shoulder press", 4.0, "Face the camera, upper body and arms in frame.",
                                     80, 165, 0.75, 0.9, (1.2, 6.0),
                                     {"lockout": 0.3, "trunk_lean": 0.3, "symmetry": 0.2, "tempo": 0.2}),
    "plank": ExerciseConfig("plank", "Plank", 3.8, "Place the camera to your side, full body in frame.",
                            weights={"body_line": 0.7, "stability": 0.3}),
    "jumping_jack": ExerciseConfig("jumping_jack", "Jumping jack", 8.0, "Face the camera with your whole body in frame.",
                                   tempo_ok=(0.5, 2.5), weights={"arm_range": 0.4, "leg_range": 0.4, "tempo": 0.2}),
}
