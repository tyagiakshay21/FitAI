import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Plus, Trophy } from 'lucide-react';
import { workoutApi, errorMessage } from '../lib/api';
import type { WorkoutPlan } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Loader } from '../components/Loader';

interface LoggedSet { reps: string; weightKg: string; rpe: string; done: boolean }

export default function WorkoutSession() {
  const { workoutId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sets, setSets] = useState<Record<string, LoggedSet[]>>({});
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState<{ calories: number; achievements: string[] } | null>(null);

  const workout = useMemo(() => plan?.workouts.find((w) => w.id === workoutId) ?? null, [plan, workoutId]);

  useEffect(() => {
    workoutApi.activePlan().then(async (p) => {
      setPlan(p);
      const w = p?.workouts.find((x) => x.id === workoutId);
      if (w) {
        setSets(Object.fromEntries(w.exercises.map((x) => [x.id, Array.from({ length: x.sets }, () => ({ reps: String(x.repMin), weightKg: '', rpe: '', done: false }))])));
        const s = await workoutApi.startSession(w.id);
        setSessionId(s.id);
      }
    });
  }, [workoutId]);

  if (!plan) return <Loader full />;
  if (!workout) return <p className="muted">Workout not found. <Link to="/workouts" className="text-pine">Back to workouts</Link></p>;

  const updateSet = (exId: string, idx: number, field: keyof LoggedSet, value: string) =>
    setSets((s) => ({ ...s, [exId]: s[exId].map((row, i) => (i === idx ? { ...row, [field]: value } : row)) }));

  const logSet = async (exId: string, idx: number) => {
    if (!sessionId) return;
    const row = sets[exId][idx];
    try {
      await workoutApi.logSet(sessionId, {
        exerciseId: exId, setNumber: idx + 1, reps: Number(row.reps) || 0,
        weightKg: row.weightKg ? Number(row.weightKg) : undefined, rpe: row.rpe ? Number(row.rpe) : undefined,
      });
      updateSet(exId, idx, 'done', 'true' as never);
      setSets((s) => ({ ...s, [exId]: s[exId].map((r, i) => (i === idx ? { ...r, done: true } : r)) }));
    } catch (err) {
      toast(errorMessage(err, 'Could not log that set.'), 'error');
    }
  };
  const addSet = (exId: string) => setSets((s) => ({ ...s, [exId]: [...s[exId], { reps: '', weightKg: '', rpe: '', done: false }] }));

  const finish = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const r = await workoutApi.finishSession(sessionId, {});
      setFinished({ calories: r.session.caloriesBurned ?? 0, achievements: r.newAchievements });
    } catch (err) {
      toast(errorMessage(err, 'Could not finish the session.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (finished) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="card">
          <CheckCircle2 className="mx-auto h-12 w-12 text-pine" />
          <h1 className="font-display mt-3 text-2xl">Workout complete!</h1>
          <p className="muted mt-1">~{finished.calories} kcal burned. Nice work.</p>
          {finished.achievements.length > 0 && (
            <div className="mt-4 space-y-1">
              {finished.achievements.map((a) => (
                <p key={a} className="flex items-center justify-center gap-2 text-sm text-amber"><Trophy className="h-4 w-4" /> Unlocked: {a}</p>
              ))}
            </div>
          )}
          <button onClick={() => navigate('/dashboard')} className="btn-primary mt-6 w-full">Back to dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/workouts" className="muted inline-flex items-center gap-1 text-sm hover:text-ink"><ChevronLeft className="h-4 w-4" /> Back</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">{workout.dayName} · {workout.focus}</h1>
        <button onClick={finish} disabled={busy} className="btn-primary">Finish workout</button>
      </div>

      {!!workout.warmup.length && (
        <div className="card border-amber/30 bg-amber/5">
          <h3 className="font-display text-sm">Warm-up</h3>
          <ul className="muted mt-1 list-disc pl-5 text-sm">{workout.warmup.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      <div className="space-y-4">
        {workout.exercises.map((x) => (
          <div key={x.id} className="card">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-lg">{x.exercise.name}</h3>
              <span className="muted text-xs">Target {x.durationMin ? `${x.durationMin} min` : `${x.repMin}-${x.repMax} reps`} · rest {x.restSec}s</span>
            </div>
            {x.exercise.safetyNotes && <p className="mb-2 text-xs text-amber">{x.exercise.safetyNotes}</p>}
            <div className="space-y-2">
              {sets[x.id]?.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-6 text-xs text-ink-faint">#{idx + 1}</span>
                  <input className="input" placeholder="Reps" value={row.reps} onChange={(e) => updateSet(x.id, idx, 'reps', e.target.value)} disabled={row.done} />
                  <input className="input" placeholder="Weight (kg)" value={row.weightKg} onChange={(e) => updateSet(x.id, idx, 'weightKg', e.target.value)} disabled={row.done} />
                  <input className="input w-24" placeholder="RPE" value={row.rpe} onChange={(e) => updateSet(x.id, idx, 'rpe', e.target.value)} disabled={row.done} />
                  <button onClick={() => logSet(x.id, idx)} disabled={row.done} className={row.done ? 'btn-ghost' : 'btn-primary'}>
                    {row.done ? <CheckCircle2 className="h-4 w-4" /> : 'Log'}
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => addSet(x.id)} className="muted mt-2 flex items-center gap-1 text-xs hover:text-pine"><Plus className="h-3.5 w-3.5" /> Add set</button>
          </div>
        ))}
      </div>

      {!!workout.cooldown.length && (
        <div className="card border-line bg-pine-light/30">
          <h3 className="font-display text-sm">Cooldown</h3>
          <ul className="muted mt-1 list-disc pl-5 text-sm">{workout.cooldown.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
