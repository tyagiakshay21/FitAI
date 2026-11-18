"""Synthetic-skeleton tests: build landmarks from joint angles and drive the analysers like a camera would."""
import math

import pytest

from app.analyzers import create_analyzer
from app.geometry import angle


def _blank():
    return [[0.0, 0.0, 0.0] for _ in range(33)]


def _set(lm, idx, xy, vis=1.0):
    lm[idx] = [xy[0], xy[1], vis]


def _rot(v, deg):
    r = math.radians(deg)
    return (v[0] * math.cos(r) - v[1] * math.sin(r), v[0] * math.sin(r) + v[1] * math.cos(r))


def squat_pose(knee_deg, lean_deg=20, frontal=False, knee_gap=None):
    """Side-on skeleton whose knee angle equals knee_deg."""
    lm = _blank()
    ankle = (0.5, 0.9)
    s = math.radians(15)
    knee = (ankle[0] + 0.2 * math.sin(s), ankle[1] - 0.2 * math.cos(s))
    u = ((ankle[0] - knee[0]) / 0.2, (ankle[1] - knee[1]) / 0.2)
    cands = [(knee[0] + 0.2 * r[0], knee[1] + 0.2 * r[1]) for r in (_rot(u, knee_deg), _rot(u, -knee_deg))]
    hip = min(cands, key=lambda c: c[0])
    t = math.radians(lean_deg)
    sh = (hip[0] + 0.25 * math.sin(t), hip[1] - 0.25 * math.cos(t))
    for off, (S, H, K, A) in ((-0.02, (11, 23, 25, 27)), (0.02, (12, 24, 26, 28))):
        _set(lm, S, (sh[0] + off, sh[1])); _set(lm, H, (hip[0] + off, hip[1]))
        _set(lm, K, (knee[0] + off, knee[1])); _set(lm, A, (ankle[0] + off, ankle[1]))
    if frontal:
        _set(lm, 11, (0.35, sh[1])); _set(lm, 12, (0.65, sh[1]))
        _set(lm, 23, (0.42, hip[1])); _set(lm, 24, (0.58, hip[1]))
        gap = knee_gap if knee_gap is not None else 0.2
        _set(lm, 25, (0.5 - gap / 2, knee[1])); _set(lm, 26, (0.5 + gap / 2, knee[1]))
        _set(lm, 27, (0.4, ankle[1])); _set(lm, 28, (0.6, ankle[1]))
    return lm


def drive(analyzer, poses, fps=10, t0=0.0):
    out = []
    for i, p in enumerate(poses):
        out.append(analyzer.update(p, t0 + i / fps))
    return out


def squat_cycle(bottom=85, n=30):
    down = [170 - (170 - bottom) * i / (n // 2) for i in range(n // 2)]
    up = [bottom + (170 - bottom) * i / (n // 2) for i in range(n // 2 + 1)]
    return [squat_pose(a) for a in down + up]


def test_geometry_matches_construction():
    lm = squat_pose(100)
    assert angle(tuple(lm[23][:2]), tuple(lm[25][:2]), tuple(lm[27][:2])) == pytest.approx(100, abs=0.5)


def test_squat_counts_full_reps_only_once_each():
    a = create_analyzer("squat")
    poses = squat_cycle() * 3
    res = drive(a, poses)
    assert res[-1].reps == 3
    assert res[-1].form_score and res[-1].form_score > 70
    assert sum(r.rep_completed for r in res) == 3


def test_shallow_squats_do_not_count_and_prompt_for_depth():
    a = create_analyzer("squat")
    res = drive(a, squat_cycle(bottom=135) * 2)
    assert res[-1].reps == 0
    assert any("deeper" in m.lower() for r in res for m in r.feedback)


def test_jitter_at_the_top_does_not_create_reps():
    a = create_analyzer("squat")
    res = drive(a, [squat_pose(170 + (3 if i % 2 else -3)) for i in range(60)])
    assert res[-1].reps == 0


def test_forward_lean_is_flagged():
    a = create_analyzer("squat")
    res = drive(a, [squat_pose(a_, lean_deg=68) for a_ in [170, 150, 130, 110, 95, 90]])
    assert any("chest up" in m.lower() or "neutral" in m.lower() for r in res for m in r.feedback)
    assert res[-1].breakdown["back_position"] < 80


def test_knee_valgus_detected_only_when_measurable():
    a = create_analyzer("squat")
    bad = drive(a, [squat_pose(k, frontal=True, knee_gap=0.09) for k in [170, 140, 110, 95, 90]])
    assert any("knees are moving inward" in m for r in bad for m in r.feedback)
    b = create_analyzer("squat")
    side = drive(b, [squat_pose(k) for k in [170, 140, 110, 95, 90]])
    assert side[-1].breakdown.get("knee_alignment") is None  # not measurable from a side view → not scored


def test_fast_reps_are_called_out():
    a = create_analyzer("squat")
    res = drive(a, squat_cycle(n=8) * 2, fps=10)
    assert any("slow down" in m.lower() for r in res for m in r.feedback)


def test_invisible_body_gives_guidance_and_no_reps():
    a = create_analyzer("squat")
    r = a.update([[0, 0, 0.0]] * 33, 0.0)
    assert not r.visible and "frame" in r.feedback[0].lower() and r.reps == 0


def arm_pose(elbow_deg, upper_arm_tilt=5):
    lm = _blank()
    sh = (0.5, 0.3)
    t = math.radians(upper_arm_tilt)
    el = (sh[0] + 0.2 * math.sin(t), sh[1] + 0.2 * math.cos(t))
    u = ((sh[0] - el[0]) / 0.2, (sh[1] - el[1]) / 0.2)
    wr = min([(el[0] + 0.2 * r[0], el[1] + 0.2 * r[1]) for r in (_rot(u, elbow_deg), _rot(u, -elbow_deg))], key=lambda c: -c[0])
    hip = (0.5, 0.7)
    for i, xy in {11: sh, 13: el, 15: wr, 23: hip}.items():
        _set(lm, i, xy)
    for i, xy in {12: (sh[0] + .02, sh[1]), 14: (el[0] + .02, el[1]), 16: (wr[0] + .02, wr[1]), 24: (hip[0] + .02, hip[1])}.items():
        _set(lm, i, xy, 0.4)  # far side less visible
    return lm


def test_bicep_curl_counts_and_flags_elbow_drift():
    a = create_analyzer("bicep_curl")
    seq = [arm_pose(x) for x in list(range(160, 40, -8)) + list(range(40, 165, 8))]
    res = drive(a, seq * 2)
    assert res[-1].reps == 2
    b = create_analyzer("bicep_curl")
    res2 = drive(b, [arm_pose(x, upper_arm_tilt=45) for x in list(range(160, 40, -8))])
    assert any("elbow" in m.lower() for r in res2 for m in r.feedback)


def plank_pose(sag=0.0):
    lm = _blank()
    sh, hip, an = (0.2, 0.55), (0.5, 0.58 + sag), (0.8, 0.61)
    for i, xy in {11: sh, 23: hip, 27: an}.items():
        _set(lm, i, xy)
    for i, xy in {12: (0.21, 0.55), 24: (0.51, 0.58 + sag), 28: (0.81, 0.61)}.items():
        _set(lm, i, xy, 0.5)
    return lm


def test_plank_accumulates_hold_time_and_flags_sag():
    a = create_analyzer("plank")
    res = drive(a, [plank_pose() for _ in range(50)])  # 5 s @10 fps
    assert res[-1].hold_seconds == pytest.approx(4.9, abs=0.3)
    b = create_analyzer("plank")
    res2 = drive(b, [plank_pose(sag=0.12) for _ in range(20)])
    assert any("sag" in m.lower() for r in res2 for m in r.feedback)
    assert res2[-1].hold_seconds < 1.0


def jack_pose(open_):
    lm = _blank()
    sw = 0.2
    sy = 0.3
    wy, spread = (0.05, 0.55) if open_ else (0.6, 0.15)
    for i, xy in {11: (0.4, sy), 12: (0.6, sy), 15: (0.3 if open_ else 0.38, wy), 16: (0.7 if open_ else 0.62, wy),
                  27: (0.5 - spread / 2, 0.9), 28: (0.5 + spread / 2, 0.9)}.items():
        _set(lm, i, xy)
    return lm


def test_jumping_jacks_count_on_open_to_closed():
    a = create_analyzer("jumping_jack")
    seq = ([jack_pose(False)] * 3 + [jack_pose(True)] * 3) * 4 + [jack_pose(False)] * 3
    res = drive(a, seq, fps=6)
    assert res[-1].reps == 4


def test_summary_contains_disclaimer_and_breakdown():
    a = create_analyzer("squat", weight_kg=80)
    drive(a, squat_cycle() * 2)
    s = a.summary()
    assert s["reps"] == 2 and "depth" in s["breakdown"] and "not a medical" in s["disclaimer"]
    assert s["calories_estimate"] > 0


def test_unknown_exercise():
    with pytest.raises(KeyError):
        create_analyzer("deadlift")
