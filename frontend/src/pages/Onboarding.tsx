import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flame, Loader2, X } from 'lucide-react';
import { profileApi, errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import type { DietType, Experience, Gender, Goal, Location } from '../lib/types';

interface Form {
  age: number; gender: Gender; heightCm: number; weightKg: number;
  experience: Experience; location: Location; equipment: string[];
  workoutDaysPerWeek: number; workoutDurationMin: number; injuries: string;
  goal: Goal; targetWeightKg: string;
  dietType: DietType; allergies: string; dislikedFoods: string; foodPreferences: string;
  mealsPerDay: number; budgetPerDayInr: string;
  stepTarget: number; sleepHours: number;
}
const DEFAULTS: Form = {
  age: 28, gender: 'MALE', heightCm: 170, weightKg: 70, experience: 'BEGINNER', location: 'HOME', equipment: [],
  workoutDaysPerWeek: 3, workoutDurationMin: 45, injuries: '', goal: 'GENERAL_FITNESS', targetWeightKg: '',
  dietType: 'VEGETARIAN', allergies: '', dislikedFoods: '', foodPreferences: '', mealsPerDay: 4, budgetPerDayInr: '',
  stepTarget: 8000, sleepHours: 7,
};
const EQUIPMENT = ['dumbbell', 'barbell', 'bench', 'band', 'kettlebell', 'pull-up bar', 'bike', 'treadmill'];
const GOALS: { key: Goal; label: string }[] = [
  { key: 'WEIGHT_LOSS', label: 'Weight loss' }, { key: 'MUSCLE_GAIN', label: 'Muscle gain' },
  { key: 'STRENGTH', label: 'Strength' }, { key: 'ENDURANCE', label: 'Endurance' },
  { key: 'BODY_RECOMPOSITION', label: 'Recomposition' }, { key: 'GENERAL_FITNESS', label: 'General fitness' },
];
const STEPS = ['Personal', 'Fitness', 'Goal', 'Nutrition', 'Habits'];
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { refreshUser } = useAuth();
  const navigate = useNavigate();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const toggleEquip = (e: string) => set('equipment', f.equipment.includes(e) ? f.equipment.filter((x) => x !== e) : [...f.equipment, e]);

  const submit = async () => {
    setBusy(true);
    try {
      await profileApi.onboard({
        age: f.age, gender: f.gender, heightCm: f.heightCm, weightKg: f.weightKg, experience: f.experience,
        location: f.location, equipment: f.location === 'GYM' ? [] : f.equipment,
        workoutDaysPerWeek: f.workoutDaysPerWeek, workoutDurationMin: f.workoutDurationMin,
        injuries: csv(f.injuries), goal: f.goal, targetWeightKg: f.targetWeightKg ? +f.targetWeightKg : undefined,
        dietType: f.dietType, allergies: csv(f.allergies), dislikedFoods: csv(f.dislikedFoods),
        foodPreferences: csv(f.foodPreferences), mealsPerDay: f.mealsPerDay,
        budgetPerDayInr: f.budgetPerDayInr ? +f.budgetPerDayInr : undefined,
        stepTarget: f.stepTarget, sleepHours: f.sleepHours,
      });
      await refreshUser();
      toast('Your plan is ready!', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast(errorMessage(err, 'Could not save your profile.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-chalk px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="rounded-lg bg-pine p-1.5"><Flame className="h-5 w-5 text-white" /></div>
          <span className="font-display text-lg font-semibold">FitAI</span>
        </div>
        <div className="mb-6 flex gap-1.5">
          {STEPS.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-pine' : 'bg-line'}`} />)}
        </div>
        <div className="card">
          <h2 className="font-display text-xl">{STEPS[step]}</h2>

          {step === 0 && (
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div><label className="label">Age</label><input type="number" className="input" value={f.age} onChange={(e) => set('age', +e.target.value)} /></div>
              <div>
                <label className="label">Gender</label>
                <select className="input" value={f.gender} onChange={(e) => set('gender', e.target.value as Gender)}>
                  <option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option>
                </select>
              </div>
              <div><label className="label">Height (cm)</label><input type="number" className="input" value={f.heightCm} onChange={(e) => set('heightCm', +e.target.value)} /></div>
              <div><label className="label">Weight (kg)</label><input type="number" className="input" value={f.weightKg} onChange={(e) => set('weightKg', +e.target.value)} /></div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-5 space-y-4">
              <div>
                <label className="label">Experience</label>
                <div className="flex gap-2">
                  {(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as Experience[]).map((e) => (
                    <button key={e} type="button" onClick={() => set('experience', e)} className={`chip ${f.experience === e ? 'chip-on' : ''}`}>{e[0] + e.slice(1).toLowerCase()}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Where do you train?</label>
                <div className="flex gap-2">
                  {(['HOME', 'GYM', 'OUTDOOR'] as Location[]).map((l) => (
                    <button key={l} type="button" onClick={() => set('location', l)} className={`chip ${f.location === l ? 'chip-on' : ''}`}>{l[0] + l.slice(1).toLowerCase()}</button>
                  ))}
                </div>
              </div>
              {f.location !== 'GYM' && (
                <div>
                  <label className="label">Equipment you have (optional)</label>
                  <div className="flex flex-wrap gap-2">
                    {EQUIPMENT.map((e) => <button key={e} type="button" onClick={() => toggleEquip(e)} className={`chip ${f.equipment.includes(e) ? 'chip-on' : ''}`}>{e}</button>)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Days per week</label><input type="number" min={1} max={7} className="input" value={f.workoutDaysPerWeek} onChange={(e) => set('workoutDaysPerWeek', +e.target.value)} /></div>
                <div><label className="label">Minutes per session</label><input type="number" min={20} max={180} className="input" value={f.workoutDurationMin} onChange={(e) => set('workoutDurationMin', +e.target.value)} /></div>
              </div>
              <div>
                <label className="label">Injuries or limitations (comma-separated, optional)</label>
                <input className="input" placeholder="e.g. left knee, lower back" value={f.injuries} onChange={(e) => set('injuries', e.target.value)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {GOALS.map((g) => <button key={g.key} type="button" onClick={() => set('goal', g.key)} className={`chip justify-center ${f.goal === g.key ? 'chip-on' : ''}`}>{g.label}</button>)}
              </div>
              <div>
                <label className="label">Target weight (kg, optional)</label>
                <input type="number" min={30} max={300} className="input" value={f.targetWeightKg} onChange={(e) => set('targetWeightKg', e.target.value)} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-5 space-y-4">
              <div>
                <label className="label">Diet type</label>
                <div className="flex flex-wrap gap-2">
                  {(['VEGAN', 'VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'] as DietType[]).map((d) => (
                    <button key={d} type="button" onClick={() => set('dietType', d)} className={`chip ${f.dietType === d ? 'chip-on' : ''}`}>{d.replace('_', '-').toLowerCase()}</button>
                  ))}
                </div>
              </div>
              <div><label className="label">Allergies (comma-separated, optional)</label><input className="input" placeholder="e.g. peanuts, dairy" value={f.allergies} onChange={(e) => set('allergies', e.target.value)} /></div>
              <div><label className="label">Disliked foods (optional)</label><input className="input" value={f.dislikedFoods} onChange={(e) => set('dislikedFoods', e.target.value)} /></div>
              <div><label className="label">Favourite foods (optional)</label><input className="input" value={f.foodPreferences} onChange={(e) => set('foodPreferences', e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Meals per day</label><input type="number" min={3} max={6} className="input" value={f.mealsPerDay} onChange={(e) => set('mealsPerDay', +e.target.value)} /></div>
                <div><label className="label">Daily food budget ₹ (optional)</label><input type="number" min={50} max={5000} className="input" value={f.budgetPerDayInr} onChange={(e) => set('budgetPerDayInr', e.target.value)} /></div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div><label className="label">Daily step target</label><input type="number" min={500} max={40000} className="input" value={f.stepTarget} onChange={(e) => set('stepTarget', +e.target.value)} /></div>
              <div><label className="label">Usual sleep (hours)</label><input type="number" min={3} max={12} step={0.5} className="input" value={f.sleepHours} onChange={(e) => set('sleepHours', +e.target.value)} /></div>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="btn-ghost gap-1 disabled:opacity-0">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep((s) => s + 1)} className="btn-primary gap-1">Next <ChevronRight className="h-4 w-4" /></button>
            ) : (
              <button onClick={submit} disabled={busy} className="btn-primary gap-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Generate my plan</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
