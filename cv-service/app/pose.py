"""MediaPipe Pose wrapper. Imported lazily so the analysers can be unit-tested without MediaPipe installed."""
from __future__ import annotations

from typing import Optional


class PoseEstimator:
    def __init__(self, model_complexity: int = 1):
        import mediapipe as mp  # noqa: WPS433 (deliberate lazy import)

        self._pose = mp.solutions.pose.Pose(
            static_image_mode=False, model_complexity=model_complexity, smooth_landmarks=True,
            min_detection_confidence=0.5, min_tracking_confidence=0.5,
        )

    def process(self, bgr_frame) -> Optional[list[tuple[float, float, float]]]:
        import cv2

        result = self._pose.process(cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB))
        if not result.pose_landmarks:
            return None
        return [(l.x, l.y, l.visibility) for l in result.pose_landmarks.landmark]

    def close(self) -> None:
        self._pose.close()
