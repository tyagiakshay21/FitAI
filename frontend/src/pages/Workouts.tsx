import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Clock, Dumbbell, Flame, RefreshCw, Search, Sparkles } from 'lucide-react';
import { workoutApi, errorMessage } from '../lib/api';
import type { Exercise, WorkoutPlan } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Loader, EmptyState } from '../components/Loader';
import { titleCase } from '../lib/utils';

const CATEGORIES = ['', 'CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'LEGS', 'GLUTES', 'CORE', 'CARDIO', 'FULL_BODY', 'MOBILITY', 'STRETCHING'];

export default function Workouts() {
  const [tab, setTab] = useState<'plan' | 'library'>('plan');
  const [plan, setPlan] = useState<WorkoutPlan | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const loadPlan = () => workoutApi.activePlan().then(setPlan).catch(() => setPlan(null));
  useEffect(() => { loadPlan(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const p = await workoutApi.generatePlan();
      setPlan(p);
      toast('New workout plan generated!', 'success');
    } catch (err) {
      toast(errorMessage(err, 'Could not generate a plan.'), 'error');
    } finally {
      setBusy(false);
    }
  };
  const adapt = async () => {
    setBusy(true);
    try {
      const r = await workoutApi.adaptPlan();
      toast(r.changes?.[0] ?? 'Plan updated.', 'success');
      loadPlan();
    } catch (err) {
      toast(errorMessage(err, 'Could not adapt your plan yet.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Workouts</h1>
        <div className="flex gap-2">
          <button className={`chip ${tab === 'plan' ? 'chip-on' : ''}`} onClick={() => setTab('plan')}>My plan</button>
          <button className={`chip ${tab === 'library' ? 'chip-on' : ''}`} onClick={() => setTab('library')}>Exercise library</button>
        </div>
      </div>

      {tab === 'plan' ? (
        plan === undefined ? <Loader /> : plan === null ? (
          <EmptyState title="No active plan yet" body="Generate a personalised plan based on your profile." action={<button onClick={generate} disabled={busy} className="btn-primary">Generate plan</button>} />
        ) : (
          <div className="space-y-5">
            <div className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg">{plan.name}</h2>
                {plan.notes && <p className="muted mt-1 max-w-xl whitespace-pre-line">{plan.notes}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={adapt} disabled={busy} className="btn-ghost gap-1"><RefreshCw className="h-4 w-4" /> Adapt to progress</button>
                <button onClick={generate} disabled={busy} className="btn-ghost gap-1"><Sparkles className="h-4 w-4" /> Regenerate</button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {plan.workouts.map((w) => (
                <div key={w.id} className="card">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-display text-lg">{w.dayName} · {w.focus}</h3>
                    <span className="muted flex items-center gap-1 text-xs"><Clock className="h-3.5 w-3.5" /> ~{w.estimatedMinutes} min</span>
                  </div>
                  <ul className="space-y-1.5">
                    {w.exercises.map((x) => (
                      <li key={x.id} className="flex items-center justify-between text-sm">
                        <span>{x.exercise.name}</span>
                        <span className="text-ink-faint">{x.durationMin ? `${x.durationMin} min` : `${x.sets} × ${x.repMin}-${x.repMax}`}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to={`/workouts/session/${w.id}`} className="btn-primary mt-4 w-full">Start this workout</Link>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <ExerciseLibrary />
      )}
    </div>
  );
}

function ExerciseLibrary() {
  const [items, setItems] = useState<Exercise[]>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      workoutApi.exercises({ q: q || undefined, category: category || undefined, page: 1, pageSize: 40 })
        .then((r) => setItems(r.items)).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, category]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input className="input pl-9" placeholder="Search exercises or muscles…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input sm:w-52" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c ? titleCase(c) : 'All categories'}</option>)}
        </select>
      </div>
      {loading ? <Loader /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((ex) => (
            <div key={ex.id} className="card">
              <div className="mb-1 flex items-center gap-2"><Dumbbell className="h-4 w-4 text-pine" /><h3 className="font-display">{ex.name}</h3></div>
              <p className="muted text-xs">{titleCase(ex.category)} · {titleCase(ex.difficulty)}</p>
              <p className="muted mt-2 text-sm">{ex.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">{ex.muscleGroups.map((m) => <span key={m} className="rounded-full bg-pine-light px-2 py-0.5 text-xs text-pine-dark">{m}</span>)}</div>
              <p className="muted mt-2 flex items-center gap-1 text-xs"><Flame className="h-3 w-3" /> ~{ex.caloriesPerMin} kcal/min</p>
              {ex.safetyNotes && <p className="mt-2 flex items-start gap-1 text-xs text-amber"><Activity className="mt-0.5 h-3 w-3 shrink-0" /> {ex.safetyNotes}</p>}
            </div>
          ))}
          {!items.length && <EmptyState title="No exercises found" body="Try a different search or category." />}
        </div>
      )}
    </div>
  );
}
