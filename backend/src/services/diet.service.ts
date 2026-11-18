import { DietType, Food, FoodRole, MealType, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../utils/AppError';
import { complete } from './llm.service';
import { computeMetrics } from './nutrition.service';
import { GoalKey } from '../config/nutrition';

const ALLOWED: Record<DietType, DietType[]> = {
  VEGAN: ['VEGAN'],
  VEGETARIAN: ['VEGAN', 'VEGETARIAN'],
  EGGETARIAN: ['VEGAN', 'VEGETARIAN', 'EGGETARIAN'],
  NON_VEGETARIAN: ['VEGAN', 'VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'],
};
/** Free-text allergy words → allergen tags stored on foods. */
const ALLERGY_SYNONYMS: Record<string, string[]> = {
  nut: ['peanut', 'tree_nut'], nuts: ['peanut', 'tree_nut'], peanut: ['peanut'], peanuts: ['peanut'],
  almond: ['tree_nut'], cashew: ['tree_nut'], dairy: ['milk'], milk: ['milk'], lactose: ['milk'],
  egg: ['egg'], eggs: ['egg'], soy: ['soy'], soya: ['soy'], gluten: ['gluten'], wheat: ['gluten'],
  fish: ['fish'], shellfish: ['shellfish'], sesame: ['sesame'],
};
const EXPENSIVE = ['almond', 'quinoa', 'whey', 'fish', 'plant protein'];

export function allergenTags(allergies: string[]) {
  const tags = new Set<string>();
  for (const a of allergies.map((x) => x.toLowerCase().trim())) {
    for (const [word, t] of Object.entries(ALLERGY_SYNONYMS)) if (a.includes(word)) t.forEach((x) => tags.add(x));
    tags.add(a.replace(/\s+/g, '_'));
  }
  return tags;
}

export interface DietFilter { dietType: DietType; allergies: string[]; dislikedFoods: string[]; budgetPerDayInr?: number | null }

/** The one place where dietary restrictions are enforced. Everything the planner picks goes through here. */
export function safeFoods(foods: Food[], f: DietFilter) {
  const allergens = allergenTags(f.allergies);
  const disliked = f.dislikedFoods.map((d) => d.toLowerCase());
  const allergyWords = f.allergies.map((a) => a.toLowerCase());
  return foods.filter(
    (fd) =>
      ALLOWED[f.dietType].includes(fd.dietType) &&
      !fd.allergens.some((a) => allergens.has(a)) &&
      !allergyWords.some((w) => w.length > 2 && fd.name.toLowerCase().includes(w)) &&
      !disliked.some((d) => d.length > 2 && fd.name.toLowerCase().includes(d)) &&
      !(f.budgetPerDayInr && f.budgetPerDayInr < 250 && EXPENSIVE.some((e) => fd.name.toLowerCase().includes(e))),
  );
}

const MEAL_SLOTS: Record<number, { type: MealType; share: number }[]> = {
  3: [{ type: 'BREAKFAST', share: 0.3 }, { type: 'LUNCH', share: 0.4 }, { type: 'DINNER', share: 0.3 }],
  4: [{ type: 'BREAKFAST', share: 0.25 }, { type: 'LUNCH', share: 0.35 }, { type: 'SNACK', share: 0.1 }, { type: 'DINNER', share: 0.3 }],
  5: [{ type: 'BREAKFAST', share: 0.22 }, { type: 'SNACK', share: 0.1 }, { type: 'LUNCH', share: 0.3 }, { type: 'SNACK', share: 0.1 }, { type: 'DINNER', share: 0.28 }],
  6: [{ type: 'BREAKFAST', share: 0.2 }, { type: 'SNACK', share: 0.1 }, { type: 'LUNCH', share: 0.27 }, { type: 'SNACK', share: 0.1 }, { type: 'DINNER', share: 0.23 }, { type: 'SNACK', share: 0.1 }],
};
const COMPOSITION: Record<MealType, { role: FoodRole[]; share: number }[]> = {
  BREAKFAST: [{ role: ['PROTEIN', 'DAIRY'], share: 0.35 }, { role: ['CARB'], share: 0.45 }, { role: ['FRUIT'], share: 0.2 }],
  LUNCH: [{ role: ['PROTEIN'], share: 0.33 }, { role: ['CARB'], share: 0.4 }, { role: ['VEGETABLE'], share: 0.12 }, { role: ['DAIRY'], share: 0.15 }],
  DINNER: [{ role: ['PROTEIN'], share: 0.4 }, { role: ['CARB'], share: 0.4 }, { role: ['VEGETABLE'], share: 0.2 }],
  SNACK: [{ role: ['SNACK', 'FRUIT'], share: 0.55 }, { role: ['DAIRY', 'PROTEIN'], share: 0.45 }],
};
const MAX_G: Partial<Record<FoodRole, number>> = { PROTEIN: 250, CARB: 350, VEGETABLE: 300, FRUIT: 250, DAIRY: 300, SNACK: 60, FAT: 30 };

interface Item { food: Food; grams: number; role: FoodRole }
interface DayMeal { type: MealType; items: Item[] }
const nutr = (i: Item) => {
  const f = i.grams / 100;
  return { calories: i.food.calories * f, protein: i.food.protein * f, carbs: i.food.carbs * f, fat: i.food.fat * f, fiber: i.food.fiber * f };
};
const add = (a: ReturnType<typeof nutr>, b: ReturnType<typeof nutr>) => ({
  calories: a.calories + b.calories, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fiber: a.fiber + b.fiber,
});
const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
const step5 = (g: number) => Math.max(10, Math.round(g / 5) * 5);

export function buildDay(pool: Food[], slots: { type: MealType; share: number }[], targets: { calories: number; protein: number }, dayIdx: number, preferred: string[]): DayMeal[] {
  const pref = preferred.map((p) => p.toLowerCase());
  const meals: DayMeal[] = slots.map((slot, mi) => {
    const items: Item[] = [];
    const used = new Set<string>();
    for (const comp of COMPOSITION[slot.type]) {
      let cands = pool.filter((f) => comp.role.includes(f.category) && f.mealTypes.includes(slot.type) && !used.has(f.id));
      if (!cands.length && !comp.role.every((r) => r === 'DAIRY')) cands = pool.filter((f) => comp.role.includes(f.category) && !used.has(f.id));
      if (!cands.length) continue;
      cands.sort((a, b) => a.name.localeCompare(b.name));
      const liked = cands.filter((c) => pref.some((p) => p.length > 2 && c.name.toLowerCase().includes(p)));
      const list = liked.length && (dayIdx + mi) % 2 === 0 ? liked : cands; // preferred foods appear often, not always
      const food = list[(dayIdx * 3 + mi) % list.length];
      used.add(food.id);
      const role = food.category;
      const kcal = targets.calories * slot.share * comp.share;
      const grams = Math.min(step5((kcal / Math.max(food.calories, 1)) * 100), MAX_G[role] ?? 300);
      items.push({ food, grams, role });
    }
    return { type: slot.type, items };
  });
  // Protein top-up: scale protein/dairy items up (bounded) and shave carbs to stay calorie-neutral.
  for (let pass = 0; pass < 2; pass++) {
    const all = meals.flatMap((m) => m.items);
    const tot = all.reduce((t, i) => add(t, nutr(i)), ZERO);
    const ratio = targets.protein / Math.max(tot.protein, 1);
    if (ratio <= 1.05) break;
    const boost = Math.min(ratio, 1.35);
    let addedKcal = 0;
    for (const i of all.filter((x) => x.role === 'PROTEIN' || x.role === 'DAIRY')) {
      const before = nutr(i).calories;
      i.grams = Math.min(step5(i.grams * boost), MAX_G[i.role] ?? 300);
      addedKcal += nutr(i).calories - before;
    }
    const carbs = all.filter((x) => x.role === 'CARB');
    const carbKcal = carbs.reduce((s, i) => s + nutr(i).calories, 0);
    if (carbKcal > 0 && addedKcal > 0) {
      const f = Math.max(0.6, 1 - addedKcal / carbKcal);
      carbs.forEach((i) => (i.grams = step5(i.grams * f)));
    }
  }
  return meals;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function generateMealPlan(userId: string, opts: { calories?: number; useAI?: boolean } = {}) {
  const [profile, goal, foods] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.fitnessGoal.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' } }),
    prisma.food.findMany({ where: { OR: [{ createdById: null }, { createdById: userId }] } }),
  ]);
  if (!profile || !goal) throw AppError.badRequest('Complete onboarding first');
  const m = computeMetrics(profile, goal.type as GoalKey);
  const calories = opts.calories ?? m.calorieTarget;
  const macros = { ...m.macros, calories };
  const pool = safeFoods(foods, profile);
  const roles = new Set(pool.map((f) => f.category));
  if (!['PROTEIN', 'CARB', 'VEGETABLE'].every((r) => roles.has(r as FoodRole))) {
    throw AppError.badRequest('Your restrictions leave too few foods to build a plan. Relax some allergies/dislikes or add custom foods.');
  }
  const slots = MEAL_SLOTS[Math.min(6, Math.max(3, profile.mealsPerDay))];

  const days = Array.from({ length: 7 }, (_, d) => buildDay(pool, slots, { calories, protein: macros.protein }, d, profile.foodPreferences));
  const note = opts.useAI === false ? null : await complete({
    maxTokens: 200,
    messages: [{ role: 'user', content: `Write 3 short practical tips (no medical claims) for someone following this Indian ${profile.dietType.toLowerCase().replace('_', '-')} meal plan for goal ${goal.type}. Targets: ${JSON.stringify(macros)}.` }],
  });

  return prisma.$transaction(async (tx) => {
    await tx.mealPlan.updateMany({ where: { userId, active: true }, data: { active: false } });
    const plan = await tx.mealPlan.create({
      data: { userId, name: `${profile.dietType.replace('_', '-')} plan · ${calories} kcal`, targetCalories: calories, targetProtein: macros.protein, targetCarbs: macros.carbs, targetFat: macros.fat, notes: note },
    });
    for (const [dayIndex, meals] of days.entries()) {
      for (const meal of meals) {
        const t = meal.items.reduce((s, i) => add(s, nutr(i)), ZERO);
        await tx.meal.create({
          data: {
            mealPlanId: plan.id, dayIndex, type: meal.type,
            name: meal.items.map((i) => i.food.name).join(' + '),
            calories: Math.round(t.calories), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat), fiber: r1(t.fiber),
            items: {
              create: meal.items.map((i): Prisma.MealItemCreateWithoutMealInput => {
                const n = nutr(i);
                return { foodId: i.food.id, foodName: i.food.name, quantityG: i.grams, calories: Math.round(n.calories), protein: r1(n.protein), carbs: r1(n.carbs), fat: r1(n.fat), fiber: r1(n.fiber) };
              }),
            },
          },
        });
      }
    }
    return tx.mealPlan.findUniqueOrThrow({ where: { id: plan.id }, include: mealPlanInclude });
  });
}

export const mealPlanInclude = {
  meals: { orderBy: [{ dayIndex: 'asc' as const }], include: { items: true } },
} satisfies Prisma.MealPlanInclude;

export const activeMealPlan = (userId: string) =>
  prisma.mealPlan.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' }, include: mealPlanInclude });

export const searchFoods = (userId: string, q: string | undefined, category: string | undefined, limit: number) =>
  prisma.food.findMany({
    where: {
      OR: [{ createdById: null }, { createdById: userId }],
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      ...(category ? { category: category as FoodRole } : {}),
    },
    orderBy: { name: 'asc' },
    take: limit,
  });
