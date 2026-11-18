import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bot, Droplets, Flame, Footprints, Moon, Scale, Sparkles, Target, Zap } from 'lucide-react';
import { profileApi } from '../lib/api';
import type { DashboardData } from '../lib/types';
import { formatDate, titleCase } from '../lib/utils';
import { Loader, ErrorState } from '../components/Loader';
import { StatCard } from '../components/StatCard';
import { ProgressBar } from '../components/ProgressBar';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    profileApi.dashboard().then(setData).catch(() => setError('Could not load your dashboard.'));
  };
  useEffect(load, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loader full />;
  const { cards, today, recommendation, charts } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Welcome back</h1>
          <p className="muted">{formatDate(data.date)} · {cards.goal ? titleCase(cards.goal) : 'General fitness'}</p>
        </div>
        <Link to="/workouts" className="btn-primary">
          <Zap className="h-4 w-4" /> {today.restDay ? 'Rest day — view plan' : `Start: ${today.workout?.focus ?? 'today\u2019s workout'}`}
        </Link>
      </div>

      <div className="card flex items-start gap-3 border-pine/30 bg-pine-light/40">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-pine" />
        <p className="text-sm">{recommendation.content}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Scale} label="Weight" value={`${cards.currentWeightKg} kg`} sub={cards.targetWeightKg ? `target ${cards.targetWeightKg} kg` : undefined} />
        <StatCard icon={Target} label="BMI" value={`${cards.bmi}`} />
        <StatCard icon={Flame} label="Calories left" value={`${cards.caloriesRemaining}`} sub={`of ${cards.calorieTarget} kcal target`} accent="bg-amber/20 text-amber" />
        <StatCard icon={Footprints} label="Steps" value={`${cards.steps.count}`} sub={`goal ${cards.steps.target}`} accent="bg-lane/10 text-lane" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="font-display text-lg">Today's macros</h3>
          <div className="mt-4 space-y-4">
            {(['protein', 'carbs', 'fat'] as const).map((k) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm"><span className="capitalize">{k}</span><span className="text-ink-soft">{cards[k].consumed}g / {cards[k].target}g</span></div>
                <ProgressBar pct={cards[k].pct} />
              </div>
            ))}
            <div>
              <div className="mb-1 flex items-center justify-between text-sm"><span className="flex items-center gap-1"><Droplets className="h-3.5 w-3.5 text-lane" /> Water</span><span className="text-ink-soft">{Math.round(cards.water.consumedMl / 1000 * 10) / 10}L / {Math.round(cards.water.targetMl / 1000 * 10) / 10}L</span></div>
              <ProgressBar pct={cards.water.pct} color="bg-lane" />
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="font-display text-lg">This week</h3>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-pine-light p-4 text-center">
              <p className="font-display text-2xl">{cards.weeklyWorkouts.completed}/{cards.weeklyWorkouts.planned}</p>
              <p className="muted">Workouts</p>
            </div>
            <div className="rounded-xl bg-amber/15 p-4 text-center">
              <p className="font-display text-2xl">{cards.workoutStreak}</p>
              <p className="muted">Day streak</p>
            </div>
            <div className="rounded-xl bg-line/40 p-4 text-center col-span-2 flex items-center justify-center gap-2">
              <Moon className="h-4 w-4 text-ink-soft" />
              <p className="text-sm">{cards.sleepHours ? `${cards.sleepHours}h sleep logged` : 'No sleep logged today'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="font-display text-lg">Weight trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={charts.weight.map((d) => ({ ...d, date: formatDate(d.date) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DDE2DC" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={36} />
              <Tooltip />
              <Line type="monotone" dataKey="weightKg" stroke="#1F6F5B" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="font-display text-lg">Calories vs target</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={charts.calories.map((d) => ({ ...d, date: formatDate(d.date) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DDE2DC" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={36} />
              <Tooltip />
              <Area type="monotone" dataKey="calories" stroke="#1F6F5B" fill="#DCEBE5" />
              <Line type="monotone" dataKey="target" stroke="#E9A72C" strokeDasharray="4 4" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="font-display text-lg">Training volume (weekly)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.workoutVolume.map((d) => ({ ...d, week: formatDate(d.weekStart) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DDE2DC" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              <Bar dataKey="volumeKg" fill="#164A3E" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 className="font-display text-lg">Steps</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.steps.map((d) => ({ ...d, date: formatDate(d.date) })).slice(-14)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DDE2DC" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              <Bar dataKey="steps" fill="#3B6FE0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <Link to="/assistant" className="card flex items-center gap-3 hover:bg-pine-light/40">
        <Bot className="h-5 w-5 text-pine" />
        <span className="text-sm">Ask the AI assistant about your workout, macros or progress</span>
      </Link>
    </div>
  );
}
