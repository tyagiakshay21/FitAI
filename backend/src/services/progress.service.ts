import { prisma } from '../config/db';
import { addDays, isoDate, round, toDate, weekStart } from '../utils/dates';
import { nutritionRange } from './tracking.service';

/** Volume = Σ reps × weight (kg). Bodyweight sets (no weight) contribute 0 and are tracked via reps instead. */
export async function weeklyVolume(userId: string, weeks = 8) {
  const from = weekStart(addDays(toDate(), -7 * (weeks - 1)));
  const sets = await prisma.exerciseSet.findMany({
    where: { session: { userId, completed: true, date: { gte: from } } },
    select: { reps: true, weightKg: true, session: { select: { date: true } }, exercise: { select: { category: true } } },
  });
  const map = new Map<string, { weekStart: string; volumeKg: number; totalReps: number; byCategory: Record<string, number> }>();
  for (let i = 0; i < weeks; i++) {
    const k = isoDate(addDays(from, i * 7));
    map.set(k, { weekStart: k, volumeKg: 0, totalReps: 0, byCategory: {} });
  }
  for (const s of sets) {
    const w = map.get(isoDate(weekStart(s.session.date)));
    if (!w) continue;
    const v = s.reps * (s.weightKg ?? 0);
    w.volumeKg += v;
    w.totalReps += s.reps;
    w.byCategory[s.exercise.category] = (w.byCategory[s.exercise.category] ?? 0) + v;
  }
  return [...map.values()].map((w) => ({ ...w, volumeKg: Math.round(w.volumeKg) }));
}

/** Estimated 1RM via the Epley formula — an estimate, most reliable for ≤10 reps. */
export const epley1RM = (weightKg: number, reps: number) => round(weightKg * (1 + reps / 30), 1);

export async function strengthSeries(userId: string, days = 120, top = 4) {
  const sets = await prisma.exerciseSet.findMany({
    where: { weightKg: { gt: 0 }, session: { userId, completed: true, date: { gte: addDays(toDate(), -days) } } },
    select: { reps: true, weightKg: true, session: { select: { date: true } }, exercise: { select: { name: true } } },
  });
  const byEx = new Map<string, Map<string, number>>();
  for (const s of sets) {
    const m = byEx.get(s.exercise.name) ?? new Map<string, number>();
    const d = isoDate(s.session.date);
    m.set(d, Math.max(m.get(d) ?? 0, epley1RM(s.weightKg!, s.reps)));
    byEx.set(s.exercise.name, m);
  }
  return [...byEx.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, top)
    .map(([exercise, m]) => ({ exercise, points: [...m.entries()].sort().map(([date, e1rm]) => ({ date, e1rm })) }));
}

export async function refreshWeeklyProgress(userId: string, weeks = 12) {
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const planned = profile?.workoutDaysPerWeek ?? 3;
  const from = weekStart(addDays(toDate(), -7 * (weeks - 1)));
  const to = toDate();
  const [sessions, weights, vol, nutrition] = await Promise.all([
    prisma.workoutSession.findMany({ where: { userId, completed: true, date: { gte: from } }, select: { date: true } }),
    prisma.weightLog.findMany({ where: { userId, date: { gte: from } } }),
    weeklyVolume(userId, weeks),
    nutritionRange(userId, from, to),
  ]);
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(from, i * 7);
    const we = addDays(ws, 6);
    const inWeek = <T extends { date: Date }>(x: T) => x.date >= ws && x.date <= we;
    const completed = sessions.filter(inWeek).length;
    const w = weights.filter(inWeek);
    const n = nutrition.daily.filter((d) => d.logged && d.date >= isoDate(ws) && d.date <= isoDate(we));
    const avg = (a: number[]) => (a.length ? round(a.reduce((s, x) => s + x, 0) / a.length) : null);
    const data = {
      workoutsCompleted: completed,
      workoutsPlanned: planned,
      avgCalories: avg(n.map((d) => d.calories)),
      avgProtein: avg(n.map((d) => d.protein)),
      avgWeightKg: avg(w.map((x) => x.weightKg)),
      totalVolumeKg: vol[i]?.volumeKg ?? 0,
      consistencyPct: Math.min(100, Math.round((completed / planned) * 100)),
    };
    out.push(await prisma.progress.upsert({ where: { userId_weekStart: { userId, weekStart: ws } }, create: { userId, weekStart: ws, ...data }, update: data }));
  }
  return out;
}

export async function timeline(userId: string) {
  const weeks = await refreshWeeklyProgress(userId, 12);
  const [measurements, achievements] = await Promise.all([
    prisma.bodyMeasurement.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 20 }),
    prisma.achievement.findMany({ where: { userId }, orderBy: { unlockedAt: 'desc' }, take: 20 }),
  ]);
  const events = [
    ...weeks.filter((w) => w.workoutsCompleted > 0 || w.avgWeightKg).map((w) => ({
      date: isoDate(w.weekStart), type: 'WEEK' as const, title: `Week of ${isoDate(w.weekStart)}`,
      detail: `${w.workoutsCompleted}/${w.workoutsPlanned} workouts` + (w.avgWeightKg ? ` · avg ${w.avgWeightKg} kg` : '') + (w.avgProtein ? ` · ${Math.round(w.avgProtein)} g protein/day` : ''),
      photoUrl: null as string | null,
    })),
    ...measurements.map((m) => ({
      date: isoDate(m.date), type: (m.photoUrl ? 'PHOTO' : 'MEASUREMENT') as 'PHOTO' | 'MEASUREMENT', title: 'Body check-in',
      detail: [m.waistCm && `waist ${m.waistCm} cm`, m.chestCm && `chest ${m.chestCm} cm`, m.armsCm && `arms ${m.armsCm} cm`, m.thighsCm && `thighs ${m.thighsCm} cm`, m.bodyFatPct && `body fat ~${m.bodyFatPct}%`].filter(Boolean).join(' · '),
      photoUrl: m.photoUrl,
    })),
    ...achievements.map((a) => ({ date: isoDate(a.unlockedAt), type: 'ACHIEVEMENT' as const, title: a.title, detail: a.description, photoUrl: null as string | null })),
  ];
  return events.sort((a, b) => (a.date < b.date ? 1 : -1));
}
