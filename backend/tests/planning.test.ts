import { describe, expect, it, vi } from 'vitest';

// These tests exercise pure planning logic only; no database is touched.
vi.mock('../src/config/db', () => ({ prisma: {} }));
import type { Exercise, Food } from '@prisma/client';
import { buildPlan, limitationTags } from '../src/services/workout.service';
import { allergenTags, buildDay, safeFoods } from '../src/services/diet.service';

const mk = (i: number, category: string, over: Partial<Exercise> = {}): Exercise => ({
  id: `e${i}`, name: `Ex ${i}`, description: '', category: category as any, muscleGroups: [], equipment: ['bodyweight'], difficulty: 'BEGINNER',
  isCompound: i % 2 === 0, instructions: [], defaultSets: 3, repMin: 8, repMax: 12, restSec: 60, caloriesPerMin: 5, mediaUrl: null, safetyNotes: null,
  jointStress: [], createdAt: new Date(), updatedAt: new Date(), ...over,
});
const cats = ['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'LEGS', 'GLUTES', 'CORE', 'CARDIO'];
const catalog = cats.flatMap((c, ci) => [0, 1, 2].map((k) => mk(ci * 10 + k, c)));
const base = { goal: 'MUSCLE_GAIN', experience: 'BEGINNER', age: 28, daysPerWeek: 3, durationMin: 60, location: 'HOME', equipment: [], injuries: [] as string[] };

describe('workout generator', () => {
  it('builds one workout per training day', () => {
    for (const d of [1, 2, 3, 4, 5, 6]) expect(buildPlan(catalog, { ...base, daysPerWeek: d }).workouts).toHaveLength(d);
  });
  it('never prescribes exercises that stress a reported limitation', () => {
    const risky = catalog.map((e) => (e.category === 'LEGS' ? { ...e, jointStress: ['knee'] } : e));
    const plan = buildPlan(risky, { ...base, injuries: ['Old knee injury'] });
    const ids = new Set(plan.workouts.flatMap((w) => w.exercises.map((x) => x.exerciseId)));
    expect(risky.filter((e) => e.jointStress.includes('knee')).some((e) => ids.has(e.id))).toBe(false);
    expect(limitationTags(['bad lower back', 'left shoulder'])).toEqual(expect.arrayContaining(['lower_back', 'shoulder']));
  });
  it('respects available equipment and difficulty', () => {
    const c2 = [...catalog, mk(900, 'CHEST', { equipment: ['barbell', 'bench'] }), mk(901, 'CHEST', { difficulty: 'ADVANCED' })];
    const ids = new Set(buildPlan(c2, base).workouts.flatMap((w) => w.exercises.map((x) => x.exerciseId)));
    expect(ids.has('e900')).toBe(false);
    expect(ids.has('e901')).toBe(false);
  });
  it('keeps sessions within the requested duration', () => {
    const w = buildPlan(catalog, { ...base, durationMin: 40 }).workouts;
    w.forEach((x) => expect(x.estimatedMinutes).toBeLessThanOrEqual(55));
  });
});

const food = (id: string, name: string, category: any, dietType: any, allergens: string[] = [], meals: any[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']): Food => ({
  id, name, category, dietType, servingG: 100, servingLabel: null, calories: category === 'VEGETABLE' ? 50 : 150, protein: category === 'PROTEIN' ? 20 : 3, carbs: 20, fat: 3, fiber: 2,
  allergens, mealTypes: meals, isIndian: true, createdById: null, createdAt: new Date(),
});
const foods = [
  food('1', 'Paneer', 'PROTEIN', 'VEGETARIAN', ['milk']), food('2', 'Tofu', 'PROTEIN', 'VEGAN', ['soy']), food('3', 'Chicken', 'PROTEIN', 'NON_VEGETARIAN'),
  food('4', 'Rice', 'CARB', 'VEGAN'), food('5', 'Sabzi', 'VEGETABLE', 'VEGAN'), food('6', 'Egg', 'PROTEIN', 'EGGETARIAN', ['egg']), food('7', 'Peanut Chikki', 'SNACK', 'VEGAN', ['peanut']),
];

describe('diet planner safety', () => {
  const f = { dietType: 'VEGETARIAN' as const, allergies: [] as string[], dislikedFoods: [] as string[] };
  it('excludes non-veg foods for vegetarians and animal products for vegans', () => {
    expect(safeFoods(foods, f).map((x) => x.name)).not.toContain('Chicken');
    expect(safeFoods(foods, f).map((x) => x.name)).not.toContain('Egg');
    expect(safeFoods(foods, { ...f, dietType: 'VEGAN' }).map((x) => x.name)).not.toContain('Paneer');
  });
  it('excludes allergens, including free-text synonyms', () => {
    expect(allergenTags(['Nuts', 'lactose'])).toEqual(expect.objectContaining({}));
    const names = safeFoods(foods, { ...f, allergies: ['nuts', 'dairy'] }).map((x) => x.name);
    expect(names).not.toContain('Peanut Chikki');
    expect(names).not.toContain('Paneer');
  });
  it('builds day meals only from the safe pool', () => {
    const pool = safeFoods(foods, { ...f, dietType: 'VEGAN', allergies: ['soy'] });
    const day = buildDay(pool, [{ type: 'LUNCH', share: 0.5 }, { type: 'DINNER', share: 0.5 }], { calories: 1800, protein: 100 }, 0, []);
    const used = day.flatMap((m) => m.items.map((i) => i.food.name));
    expect(used).not.toContain('Tofu');
    expect(used.every((n) => pool.some((p) => p.name === n))).toBe(true);
  });
});
