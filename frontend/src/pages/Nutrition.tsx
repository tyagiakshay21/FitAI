import { useEffect, useState } from 'react';
import { Camera, Droplets, Loader2, Plus, Salad, Search, Sparkles, Trash2 } from 'lucide-react';
import { nutritionApi, errorMessage } from '../lib/api';
import type { Food, MealPlan, MealType } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Loader, EmptyState } from '../components/Loader';
import { ProgressBar } from '../components/ProgressBar';
import { titleCase } from '../lib/utils';

const MEALS: MealType[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];

export default function Nutrition() {
  const [tab, setTab] = useState<'log' | 'plan' | 'photo'>('log');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Nutrition</h1>
        <div className="flex gap-2">
          <button className={`chip ${tab === 'log' ? 'chip-on' : ''}`} onClick={() => setTab('log')}>Today's log</button>
          <button className={`chip ${tab === 'plan' ? 'chip-on' : ''}`} onClick={() => setTab('plan')}>Meal plan</button>
          <button className={`chip ${tab === 'photo' ? 'chip-on' : ''}`} onClick={() => setTab('photo')}>Photo recognition</button>
        </div>
      </div>
      {tab === 'log' && <DayLog />}
      {tab === 'plan' && <MealPlanView />}
      {tab === 'photo' && <FoodPhoto />}
    </div>
  );
}

function DayLog() {
  const [day, setDay] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [mealType, setMealType] = useState<MealType>('BREAKFAST');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [water, setWater] = useState(250);
  const { toast } = useToast();

  const load = () => nutritionApi.day().then(setDay);
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!search) return setResults([]);
    const t = setTimeout(() => nutritionApi.foods({ q: search, limit: 12 }).then(setResults), 250);
    return () => clearTimeout(t);
  }, [search]);

  const addFood = async (f: Food) => {
    const grams = qty[f.id] || f.servingG;
    const scale = grams / 100;
    try {
      await nutritionApi.addLog({
        mealType, foodId: f.id, foodName: f.name, quantityG: grams,
        calories: Math.round(f.calories * scale), protein: f.protein * scale, carbs: f.carbs * scale, fat: f.fat * scale, fiber: f.fiber * scale,
      });
      toast(`Logged ${f.name}`, 'success');
      load();
    } catch (err) { toast(errorMessage(err), 'error'); }
  };
  const removeLog = async (id: string) => { await nutritionApi.deleteLog(id); load(); };
  const addWater = async (ml: number) => { await nutritionApi.water(ml); load(); };

  if (!day) return <Loader />;
  const t = day.totals;

  return (
    <div className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
      <div className="space-y-4">
        <div className="card">
          <h3 className="font-display text-lg">Today's totals</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-pine-light p-3"><p className="font-display text-xl">{t.calories}</p><p className="muted text-xs">kcal</p></div>
            <div className="rounded-xl bg-amber/15 p-3"><p className="font-display text-xl">{Math.round(t.protein)}g</p><p className="muted text-xs">protein</p></div>
            <div className="rounded-xl bg-lane/10 p-3"><p className="font-display text-xl">{Math.round(t.carbs)}g</p><p className="muted text-xs">carbs</p></div>
            <div className="rounded-xl bg-coral/10 p-3"><p className="font-display text-xl">{Math.round(t.fat)}g</p><p className="muted text-xs">fat</p></div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Droplets className="h-4 w-4 text-lane" />
            <input type="range" min={0} max={1000} step={50} value={water} onChange={(e) => setWater(+e.target.value)} className="flex-1" />
            <button onClick={() => addWater(water)} className="btn-ghost text-xs">+{water}ml</button>
          </div>
        </div>
        {MEALS.map((m) => {
          const rows = day.byMeal?.[m] ?? day.logs?.filter((l: any) => l.mealType === m) ?? [];
          return (
            <div key={m} className="card">
              <h4 className="font-display text-sm">{titleCase(m)}</h4>
              {!rows.length ? <p className="muted mt-1 text-xs">Nothing logged yet</p> : (
                <ul className="mt-2 space-y-1.5">
                  {rows.map((l: any) => (
                    <li key={l.id} className="flex items-center justify-between text-sm">
                      <span>{l.foodName} <span className="text-ink-faint">({l.quantityG}g)</span></span>
                      <span className="flex items-center gap-2 text-ink-faint">{l.calories} kcal <button onClick={() => removeLog(l.id)}><Trash2 className="h-3.5 w-3.5 hover:text-coral" /></button></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="card h-fit">
        <h3 className="font-display text-lg">Add food</h3>
        <div className="mt-2 flex gap-2">
          {MEALS.map((m) => <button key={m} onClick={() => setMealType(m)} className={`chip text-xs ${mealType === m ? 'chip-on' : ''}`}>{titleCase(m)}</button>)}
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input className="input pl-9" placeholder="Search foods…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
          {results.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-xl border border-line p-2.5">
              <div>
                <p className="text-sm font-medium">{f.name}</p>
                <p className="muted text-xs">{f.calories} kcal / 100g · {f.servingLabel ?? `${f.servingG}g`}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input type="number" className="input w-20 py-1.5" placeholder={String(f.servingG)} onChange={(e) => setQty((q) => ({ ...q, [f.id]: +e.target.value }))} />
                <button onClick={() => addFood(f)} className="btn-primary p-2"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {search && !results.length && <p className="muted text-sm">No matches.</p>}
        </div>
      </div>
    </div>
  );
}

function MealPlanView() {
  const [plan, setPlan] = useState<MealPlan | null | undefined>(undefined);
  const [day, setDay] = useState(0);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => { nutritionApi.activeMealPlan().then(setPlan).catch(() => setPlan(null)); }, []);
  const generate = async () => {
    setBusy(true);
    try { setPlan(await nutritionApi.generateMealPlan()); toast('Meal plan generated!', 'success'); }
    catch (err) { toast(errorMessage(err, 'Could not generate a meal plan.'), 'error'); }
    finally { setBusy(false); }
  };
  const logMeal = async (mealId: string) => { await nutritionApi.logMeal(mealId); toast('Meal logged', 'success'); };

  if (plan === undefined) return <Loader />;
  if (plan === null) return <EmptyState title="No meal plan yet" body="Generate a 7-day Indian-friendly meal plan." action={<button onClick={generate} disabled={busy} className="btn-primary">Generate meal plan</button>} />;

  const meals = plan.meals.filter((m) => m.dayIndex === day);
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-display text-lg">{plan.name}</h2>{plan.notes && <p className="muted mt-1 max-w-xl">{plan.notes}</p>}</div>
        <button onClick={generate} disabled={busy} className="btn-ghost gap-1"><Sparkles className="h-4 w-4" /> Regenerate</button>
      </div>
      <div className="flex flex-wrap gap-2">{Array.from({ length: 7 }, (_, i) => <button key={i} onClick={() => setDay(i)} className={`chip ${day === i ? 'chip-on' : ''}`}>Day {i + 1}</button>)}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        {meals.map((m) => (
          <div key={m.id} className="card">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="font-display text-sm">{titleCase(m.type)}</h4>
              <span className="muted text-xs">{m.calories} kcal</span>
            </div>
            <ul className="muted list-disc space-y-0.5 pl-5 text-sm">{m.items.map((i) => <li key={i.id}>{i.foodName} ({i.quantityG}g)</li>)}</ul>
            <button onClick={() => logMeal(m.id)} className="btn-ghost mt-3 w-full text-xs">Log this meal</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FoodPhoto() {
  const [items, setItems] = useState<{ name: string; quantityG: number; calories: number; protein: number; carbs: number; fat: number; fiber: number; confidence: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [disclaimer, setDisclaimer] = useState('');
  const { toast } = useToast();

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const r = await nutritionApi.recognizeFood(file);
      setItems(r.items); setDisclaimer(r.disclaimer);
    } catch (err) { toast(errorMessage(err, 'Could not analyse that photo.'), 'error'); }
    finally { setBusy(false); }
  };
  const save = async (item: NonNullable<typeof items>[number]) => {
    await nutritionApi.addLog({ mealType: 'SNACK', foodName: item.name, quantityG: item.quantityG, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, fiber: item.fiber, source: 'PHOTO' });
    toast(`Logged ${item.name}`, 'success');
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="card text-center">
        <Camera className="mx-auto h-10 w-10 text-pine" />
        <p className="muted mt-2">Upload a food photo to estimate its nutrition.</p>
        <label className="btn-primary mt-4 inline-flex cursor-pointer">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Choose photo
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      </div>
      {items && (
        <div className="space-y-3">
          {!items.length && <EmptyState title="No food detected" body="Try a clearer, well-lit photo." />}
          {items.map((it, i) => (
            <div key={i} className="card flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 font-medium"><Salad className="h-4 w-4 text-pine" /> {it.name}</p>
                <p className="muted text-xs">{it.quantityG}g · {it.calories} kcal · P{Math.round(it.protein)} C{Math.round(it.carbs)} F{Math.round(it.fat)} · confidence {Math.round(it.confidence * 100)}%</p>
              </div>
              <button onClick={() => save(it)} className="btn-ghost text-xs">Save</button>
            </div>
          ))}
          <p className="text-xs text-ink-faint">{disclaimer}</p>
        </div>
      )}
    </div>
  );
}
