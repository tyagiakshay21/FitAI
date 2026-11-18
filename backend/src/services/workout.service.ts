import { ExerciseCategory, Exercise, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../utils/AppError';
import { addDays, isoDate, toDate, weekStart } from '../utils/dates';
import { scheduleWeekdays, workoutIndexForDate } from './schedule';
import { complete } from './llm.service';
import { syncCalorieLog } from './tracking.service';

/* ─────────────── Limitations (injuries) ─────────────── */
const LIMITATION_KEYWORDS: Record<string, string[]> = {
  knee: ['knee', 'acl', 'mcl', 'meniscus', 'patell'],
  shoulder: ['shoulder', 'rotator', 'clavicle', 'labrum'],
  lower_back: ['back', 'lumbar', 'spine', 'spinal', 'disc', 'sciatica'],
  wrist: ['wrist', 'carpal'],
  elbow: ['elbow', 'tendonitis'],
  neck: ['neck', 'cervical'],
  ankle: ['ankle', 'achilles'],
  hip: ['hip'],
};
export function limitationTags(injuries: string[]) {
  const text = injuries.join(' ').toLowerCase();
  return Object.entries(LIMITATION_KEYWORDS)
    .filter(([, kws]) => kws.some((k) => text.includes(k)))
    .map(([tag]) => tag);
}

/* ─────────────── Templates ─────────────── */
interface Slot { cats: ExerciseCategory[]; compound?: boolean }
interface DayTemplate { name: string; slots: Slot[] }
const S = (cat: ExerciseCategory, compound = false): Slot => ({ cats: [cat], compound });

const T: Record<string, DayTemplate> = {
  FULL: { name: 'Full Body', slots: [S('LEGS', true), S('CHEST', true), S('BACK', true), S('SHOULDERS'), S('GLUTES'), S('CORE')] },
  UPPER: { name: 'Upper Body', slots: [S('CHEST', true), S('BACK', true), S('SHOULDERS', true), S('BACK'), S('BICEPS'), S('TRICEPS')] },
  LOWER: { name: 'Lower Body', slots: [S('LEGS', true), S('GLUTES', true), S('LEGS'), S('LEGS'), S('CORE')] },
  PUSH: { name: 'Push · Chest, Shoulders, Triceps', slots: [S('CHEST', true), S('CHEST'), S('SHOULDERS', true), S('SHOULDERS'), S('TRICEPS'), S('TRICEPS')] },
  PULL: { name: 'Pull · Back, Biceps', slots: [S('BACK', true), S('BACK', true), S('BACK'), S('BICEPS'), S('BICEPS'), S('CORE')] },
  LEGS: { name: 'Legs & Glutes', slots: [S('LEGS', true), S('GLUTES', true), S('LEGS'), S('LEGS'), S('GLUTES'), S('CORE')] },
};
const SPLITS: Record<number, { label: string; days: string[] }> = {
  1: { label: 'Full Body', days: ['FULL'] },
  2: { label: 'Full Body ×2', days: ['FULL', 'FULL'] },
  3: { label: 'Full Body ×3', days: ['FULL', 'FULL', 'FULL'] },
  4: { label: 'Upper / Lower', days: ['UPPER', 'LOWER', 'UPPER', 'LOWER'] },
  5: { label: 'Push / Pull / Legs + Upper / Lower', days: ['PUSH', 'PULL', 'LEGS', 'UPPER', 'LOWER'] },
  6: { label: 'Push / Pull / Legs ×2', days: ['PUSH', 'PULL', 'LEGS', 'PUSH', 'PULL', 'LEGS'] },
};
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayNameFor = (days: number, i: number) => DAY_NAMES[(scheduleWeekdays(days)[i] + 6) % 7];

/* ─────────────── Prescription ─────────────── */
type Goal = string;
export function prescribe(goal: Goal, compound: boolean, experience: string, age: number) {
  let p: { sets: number; repMin: number; repMax: number; restSec: number; tempo: string };
  switch (goal) {
    case 'STRENGTH':
      p = compound ? { sets: 5, repMin: 3, repMax: 5, restSec: 180, tempo: '2-0-X-0' } : { sets: 3, repMin: 6, repMax: 8, restSec: 120, tempo: '2-0-1-0' };
      break;
    case 'MUSCLE_GAIN':
      p = compound ? { sets: 4, repMin: 6, repMax: 10, restSec: 120, tempo: '3-0-1-0' } : { sets: 3, repMin: 10, repMax: 12, restSec: 75, tempo: '3-1-1-0' };
      break;
    case 'ENDURANCE':
      p = { sets: 3, repMin: 15, repMax: 20, restSec: 45, tempo: '2-0-2-0' };
      break;
    case 'WEIGHT_LOSS': case 'FAT_LOSS': case 'BODY_RECOMPOSITION':
      p = compound ? { sets: 3, repMin: 8, repMax: 12, restSec: 90, tempo: '2-0-1-0' } : { sets: 3, repMin: 12, repMax: 15, restSec: 60, tempo: '2-0-1-0' };
      break;
    default:
      p = { sets: 3, repMin: 8, repMax: 12, restSec: 75, tempo: '2-0-1-0' };
  }
  if (experience === 'BEGINNER') p.sets = Math.min(p.sets, 3);
  if (age >= 50) { p.sets = Math.min(p.sets, 3); p.restSec += 15; }
  return p;
}

const CARDIO_GOALS = ['WEIGHT_LOSS', 'FAT_LOSS', 'ENDURANCE', 'BODY_RECOMPOSITION'];
const LOWER_CATS = ['LEGS', 'GLUTES'];
const warmupFor = (focus: string) => [
  '5 min easy cardio (brisk walk, bike or light skipping)',
  LOWER_CATS.some((c) => focus.toUpperCase().includes(c)) || /lower|full/i.test(focus)
    ? 'Dynamic mobility: leg swings, hip circles, bodyweight squats ×10'
    : 'Dynamic mobility: arm circles, band pull-aparts, scapular push-ups ×10',
  'Ramp-up: 1–2 light sets of your first exercise before working weight',
];
const cooldownFor = (focus: string) => [
  '3–5 min easy walk to bring heart rate down',
  /pull|back|upper|full/i.test(focus) ? 'Stretch: lats, chest doorway stretch, biceps (30 s each)' : 'Stretch: quads, hamstrings, hip flexors, calves (30 s each)',
  'Slow nasal breathing for 1 minute',
];

/* ─────────────── Generation ─────────────── */
export interface PlanInput {
  goal: string;
  experience: string;
  age: number;
  daysPerWeek: number;
  durationMin: number;
  location: string;
  equipment: string[];
  injuries: string[];
}

export function selectExercises(catalog: Exercise[], input: PlanInput) {
  const limits = new Set(limitationTags(input.injuries));
  const injuryText = input.injuries.join(' ').toLowerCase();
  const available = new Set([...(input.location === 'GYM' ? ['barbell', 'dumbbell', 'bench', 'rack', 'cable', 'machine', 'pull-up bar', 'band', 'kettlebell', 'treadmill', 'bike'] : []), ...input.equipment.map((e) => e.toLowerCase()), 'bodyweight']);
  const rank = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 } as const;
  const usable = catalog.filter(
    (e) =>
      rank[e.difficulty] <= rank[input.experience as keyof typeof rank] &&
      e.equipment.every((q) => available.has(q)) &&
      !e.jointStress.some((j) => limits.has(j)) &&
      !injuryText.includes(e.name.toLowerCase()),
  );
  return { usable, limits: [...limits] };
}

export function buildPlan(catalog: Exercise[], input: PlanInput) {
  const days = Math.min(6, Math.max(1, input.daysPerWeek));
  const split = SPLITS[days];
  const { usable, limits } = selectExercises(catalog, input);
  const cardioPool = usable.filter((e) => e.category === 'CARDIO');
  const workouts = split.days.map((key, dayIdx) => {
    const tpl = T[key];
    const used = new Set<string>();
    const picked: { ex: Exercise; compoundSlot: boolean }[] = [];
    const occurrence = split.days.slice(0, dayIdx).filter((k) => k === key).length; // vary repeated days
    tpl.slots.forEach((slot, si) => {
      let pool = usable.filter((e) => slot.cats.includes(e.category) && !used.has(e.id));
      const pref = pool.filter((e) => e.isCompound === !!slot.compound);
      if (pref.length) pool = pref;
      if (!pool.length) return;
      pool.sort((a, b) => a.name.localeCompare(b.name));
      const ex = pool[(occurrence * 2 + si) % pool.length];
      used.add(ex.id);
      picked.push({ ex, compoundSlot: !!slot.compound });
    });
    // Keep the session inside the requested duration.
    const est = () => 13 + picked.reduce((m, p) => {
      const rx = prescribe(input.goal, p.compoundSlot, input.experience, input.age);
      return m + (rx.sets * (40 + rx.restSec)) / 60;
    }, 0);
    while (est() > input.durationMin && picked.length > 3) {
      const idx = [...picked.keys()].reverse().find((i) => !picked[i].compoundSlot) ?? picked.length - 1;
      picked.splice(idx, 1);
    }
    const items: Prisma.WorkoutExerciseUncheckedCreateWithoutWorkoutInput[] = picked.map((p, order) => {
      const rx = prescribe(input.goal, p.compoundSlot, input.experience, input.age);
      return { exerciseId: p.ex.id, order, sets: rx.sets, repMin: rx.repMin, repMax: rx.repMax, restSec: rx.restSec, tempo: rx.tempo };
    });
    if (CARDIO_GOALS.includes(input.goal) && cardioPool.length) {
      const c = cardioPool[(dayIdx + occurrence) % cardioPool.length];
      const mins = input.goal === 'ENDURANCE' ? 20 : 12;
      items.push({ exerciseId: c.id, order: items.length, sets: 1, repMin: 1, repMax: 1, restSec: 0, durationMin: mins, notes: 'Steady, conversational pace' });
    }
    return {
      dayIndex: dayIdx,
      dayName: dayNameFor(days, dayIdx),
      focus: tpl.name,
      warmup: warmupFor(tpl.name) as Prisma.InputJsonValue,
      cooldown: cooldownFor(tpl.name) as Prisma.InputJsonValue,
      estimatedMinutes: Math.round(est() + (items.some((i) => i.durationMin) ? 12 : 0)),
      exercises: items,
    };
  });
  return { split: split.label, workouts, limitations: limits };
}

const progressionText = (goal: string, exp: string) => ({
  method: exp === 'BEGINNER' ? 'Linear progression' : 'Double progression',
  rules: [
    'Work inside the rep range. When you hit the top of the range on every set with good form, add 2.5%–5% load next session (about 1–2.5 kg) and drop back to the bottom of the range.',
    'Log RPE. Aim to finish most sets with 1–3 reps in reserve (RPE 7–9).',
    'If you miss reps on the same lift two sessions in a row, keep the load and focus on form and recovery.',
    'Every 4–6 weeks (or when you feel run-down), take a lighter deload week: ~60% of usual sets.',
  ],
  goalNote: goal === 'STRENGTH' ? 'Prioritise heavy compound lifts and long rests.' : goal === 'MUSCLE_GAIN' ? 'Aim for steady weekly volume increases.' : 'Consistency over intensity: show up on planned days.',
});

export async function generatePlan(userId: string) {
  const [profile, goal, catalog] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.fitnessGoal.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' } }),
    prisma.exercise.findMany(),
  ]);
  if (!profile || !goal) throw AppError.badRequest('Complete onboarding first');
  const input: PlanInput = {
    goal: goal.type, experience: profile.experience, age: profile.age, daysPerWeek: profile.workoutDaysPerWeek,
    durationMin: profile.workoutDurationMin, location: profile.location, equipment: profile.equipment, injuries: profile.injuries,
  };
  const built = buildPlan(catalog, input);
  if (!built.workouts.some((w) => w.exercises.length)) throw AppError.badRequest('No exercises match your equipment and limitations. Add equipment or adjust limitations.');

  // The LLM only writes the coach note. Exercise selection is rule-based so limitations are always enforced.
  const summary = built.workouts.map((w) => `${w.dayName}: ${w.focus}`).join('; ');
  const note = await complete({
    maxTokens: 220,
    messages: [{ role: 'user', content: `Write a 3-sentence motivating coach note (no medical claims) for this plan. Data: ${JSON.stringify({ goal: goal.type, experience: profile.experience, split: built.split, days: summary, limitationsRespected: built.limitations })}` }],
  });
  const notes = [
    note,
    built.limitations.length ? `Exercises stressing these areas were excluded: ${built.limitations.join(', ')}. Stop any exercise that causes pain and consult a qualified professional.` : null,
  ].filter(Boolean).join('\n\n') || null;

  return prisma.$transaction(async (tx) => {
    await tx.workoutPlan.updateMany({ where: { userId, active: true }, data: { active: false } });
    return tx.workoutPlan.create({
      data: {
        userId, name: `${built.split} · ${goal.type.replace(/_/g, ' ').toLowerCase()}`, split: built.split,
        generatedBy: note ? 'RULES+LLM' : 'RULES', notes,
        progression: progressionText(goal.type, profile.experience) as Prisma.InputJsonValue,
        workouts: { create: built.workouts.map((w) => ({ ...w, exercises: { create: w.exercises } })) },
      },
      include: planInclude,
    });
  });
}

export const planInclude = {
  workouts: { orderBy: { dayIndex: 'asc' as const }, include: { exercises: { orderBy: { order: 'asc' as const }, include: { exercise: true } } } },
} satisfies Prisma.WorkoutPlanInclude;

export const getActivePlan = (userId: string) =>
  prisma.workoutPlan.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' }, include: planInclude });

export async function todayWorkout(userId: string, dateIso?: string) {
  const [plan, profile] = await Promise.all([getActivePlan(userId), prisma.profile.findUnique({ where: { userId } })]);
  if (!plan || !profile) return { plan: null, workout: null, restDay: false };
  const idx = workoutIndexForDate(Math.min(6, profile.workoutDaysPerWeek), toDate(dateIso));
  return { plan, workout: idx === null ? null : plan.workouts[idx] ?? null, restDay: idx === null };
}

/* ─────────────── Adaptation ─────────────── */
export async function adaptPlan(userId: string) {
  const plan = await getActivePlan(userId);
  const profile = await prisma.profile.findUnique({ where: { userId } });
  if (!plan || !profile) throw AppError.badRequest('No active plan to adapt');
  const since = addDays(toDate(), -14);
  const [sessions, sets] = await Promise.all([
    prisma.workoutSession.count({ where: { userId, completed: true, date: { gte: since } } }),
    prisma.exerciseSet.findMany({ where: { session: { userId, date: { gte: since } }, rpe: { not: null } }, select: { rpe: true } }),
  ]);
  const planned = Math.max(1, Math.round(profile.workoutDaysPerWeek * 2));
  const adherence = sessions / planned;
  const avgRpe = sets.length ? sets.reduce((s, x) => s + (x.rpe ?? 0), 0) / sets.length : null;
  const changes: string[] = [];
  let action: 'INCREASE' | 'REDUCE' | 'DELOAD' | 'HOLD' = 'HOLD';

  if (sessions < 2) {
    return { action, adherence, avgRpe, changes: ['Not enough recent sessions to adapt safely. Complete at least 2 sessions first.'] };
  }
  const exs = plan.workouts.flatMap((w) => w.exercises);
  if (avgRpe !== null && avgRpe >= 9.2) {
    action = 'DELOAD';
    await Promise.all(exs.filter((e) => e.sets > 2 && !e.durationMin).map((e) => prisma.workoutExercise.update({ where: { id: e.id }, data: { sets: e.sets - 1 } })));
    changes.push('Sessions are being rated very hard (avg RPE ≥ 9). Reduced each exercise by 1 set for a deload.');
  } else if (adherence < 0.5) {
    action = 'REDUCE';
    await Promise.all(exs.filter((e) => e.sets > 2 && !e.durationMin).map((e) => prisma.workoutExercise.update({ where: { id: e.id }, data: { sets: e.sets - 1 } })));
    changes.push(`You completed ${sessions} of ~${planned} planned sessions. Trimmed one set per exercise to make sessions shorter and easier to fit in.`);
  } else if (adherence >= 0.85 && (avgRpe === null || avgRpe <= 7.8)) {
    action = 'INCREASE';
    const compounds = exs.filter((e) => e.sets < 5 && !e.durationMin && e.repMax <= 12).slice(0, 4);
    await Promise.all(compounds.map((e) => prisma.workoutExercise.update({ where: { id: e.id }, data: { sets: e.sets + 1 } })));
    changes.push(`Great consistency (${sessions} sessions) and manageable effort${avgRpe ? ` (avg RPE ${avgRpe.toFixed(1)})` : ''}. Added one set to ${compounds.length} key exercises.`);
  } else {
    changes.push('Adherence and effort look balanced. Keep the current plan and apply the progression rules.');
  }
  await prisma.aIRecommendation.create({
    data: { userId, type: 'PLAN_ADAPTATION', date: toDate(), title: `Plan adaptation: ${action}`, content: changes.join(' '), metadata: { adherence, avgRpe, sessions } },
  });
  return { action, adherence: Math.round(adherence * 100) / 100, avgRpe, changes };
}

/* ─────────────── Sessions ─────────────── */
export async function startSession(userId: string, workoutId?: string, dateIso?: string) {
  if (workoutId) {
    const w = await prisma.workout.findFirst({ where: { id: workoutId, plan: { userId } } });
    if (!w) throw AppError.notFound('Workout not found');
  }
  return prisma.workoutSession.create({ data: { userId, workoutId, date: toDate(dateIso) } });
}

export async function logSet(userId: string, sessionId: string, data: Omit<Prisma.ExerciseSetUncheckedCreateInput, 'sessionId'>) {
  const s = await prisma.workoutSession.findFirst({ where: { id: sessionId, userId } });
  if (!s) throw AppError.notFound('Session not found');
  if (s.completed) throw AppError.badRequest('Session already finished');
  return prisma.exerciseSet.create({ data: { ...data, sessionId } });
}

export async function finishSession(userId: string, sessionId: string, body: { rating?: number; notes?: string }) {
  const s = await prisma.workoutSession.findFirst({ where: { id: sessionId, userId }, include: { sets: { include: { exercise: true } } } });
  if (!s) throw AppError.notFound('Session not found');
  const profile = await prisma.profile.findUnique({ where: { userId } });
  const endedAt = new Date();
  const durationMin = Math.max(1, Math.round((endedAt.getTime() - s.startedAt.getTime()) / 60_000));
  // Estimate: ~1.5 min of work per set (incl. transitions) × exercise kcal/min, scaled to body weight.
  const kcal = s.sets.reduce((sum, st) => sum + (st.durationSec ? st.durationSec / 60 : 1.5) * st.exercise.caloriesPerMin, 0) * ((profile?.weightKg ?? 70) / 70);
  const updated = await prisma.workoutSession.update({
    where: { id: sessionId },
    data: { endedAt, durationMin, caloriesBurned: Math.round(kcal), completed: true, ...body },
  });
  await syncCalorieLog(userId, s.date);
  return updated;
}

export const listSessions = (userId: string, days = 60) =>
  prisma.workoutSession.findMany({
    where: { userId, date: { gte: addDays(toDate(), -days) } },
    orderBy: { date: 'desc' },
    include: { workout: { select: { dayName: true, focus: true } }, sets: { include: { exercise: { select: { name: true, category: true } } } } },
  });

export const setVolume = (sets: { reps: number; weightKg: number | null }[]) =>
  sets.reduce((v, s) => v + s.reps * (s.weightKg ?? 0), 0);

export { isoDate, weekStart };
