import { GoalKey, NutritionConfig, loadNutritionConfig } from '../config/nutrition';

/** Pure calculation helpers — no I/O — so they are trivial to unit-test. */

export interface BodyInput {
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** BMI = kg / m². Screening metric only — it does not measure body fat. */
export function bmi(weightKg: number, heightCm: number) {
  const m = heightCm / 100;
  return r1(weightKg / (m * m));
}

export function bmiCategory(value: number) {
  const standard =
    value < 18.5 ? 'Underweight' : value < 25 ? 'Normal weight' : value < 30 ? 'Overweight' : 'Obese';
  // WHO Asia-Pacific cut-offs are lower and commonly used for South Asian populations.
  const asian =
    value < 18.5 ? 'Underweight' : value < 23 ? 'Normal weight' : value < 25 ? 'Overweight (at risk)' : 'Obese';
  return { standard, asianPacific: asian };
}

export function bmiSummary(weightKg: number, heightCm: number) {
  const value = bmi(weightKg, heightCm);
  return {
    value,
    ...bmiCategory(value),
    healthyWeightRangeKg: [
      r1(18.5 * (heightCm / 100) ** 2),
      r1(24.9 * (heightCm / 100) ** 2),
    ] as [number, number],
    disclaimer:
      'BMI is a screening metric. It does not measure body fat and does not account for muscle mass, age or body frame.',
  };
}

/** Mifflin–St Jeor equation (1990). */
export function bmr({ gender, age, heightCm, weightKg }: BodyInput) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const adj = gender === 'MALE' ? 5 : gender === 'FEMALE' ? -161 : -78; // midpoint for OTHER
  return Math.round(base + adj);
}

export function tdee(input: BodyInput, cfg: NutritionConfig = loadNutritionConfig()) {
  const mult = cfg.activityMultipliers[input.activityLevel] ?? cfg.activityMultipliers.MODERATE;
  return Math.round(bmr(input) * mult);
}

export function calorieTarget(
  input: BodyInput,
  goal: GoalKey,
  cfg: NutritionConfig = loadNutritionConfig(),
) {
  const maintenance = tdee(input, cfg);
  let fraction = cfg.goalAdjustments[goal] ?? 0;
  if (fraction < -cfg.maxDeficitFraction) fraction = -cfg.maxDeficitFraction; // safety clamp
  const raw = Math.round(maintenance * (1 + fraction));
  const floor = cfg.minCalories[input.gender] ?? cfg.minCalories.OTHER;
  const target = Math.max(raw, floor);
  return { maintenance, target, adjustmentFraction: fraction, flooredToMinimum: raw < floor };
}

export function macroTargets(
  calories: number,
  weightKg: number,
  goal: GoalKey,
  opts: { active?: boolean } = {},
  cfg: NutritionConfig = loadNutritionConfig(),
) {
  const protein = Math.round(weightKg * (cfg.proteinPerKg[goal] ?? 1.4));
  const fat = Math.max(Math.round((calories * cfg.fatFractionOfCalories) / 9), Math.round(weightKg * cfg.minFatPerKg));
  const carbs = Math.max(Math.round((calories - protein * 4 - fat * 9) / 4), cfg.minCarbsG);
  const fiber = Math.round((calories / 1000) * cfg.fiberPer1000Kcal);
  const waterMl = Math.round((weightKg * cfg.waterMlPerKg + (opts.active ? cfg.waterActiveBonusMl : 0)) / 50) * 50;
  return { calories, protein, carbs, fat, fiber, waterMl };
}

export function computeMetrics(
  input: BodyInput,
  goal: GoalKey,
  cfg: NutritionConfig = loadNutritionConfig(),
) {
  const cal = calorieTarget(input, goal, cfg);
  const macros = macroTargets(cal.target, input.weightKg, goal, { active: ['ACTIVE', 'VERY_ACTIVE'].includes(input.activityLevel) }, cfg);
  return {
    bmi: bmiSummary(input.weightKg, input.heightCm),
    bmr: bmr(input),
    tdee: cal.maintenance,
    calorieTarget: cal.target,
    adjustmentPct: Math.round(cal.adjustmentFraction * 100),
    flooredToMinimum: cal.flooredToMinimum,
    macros,
    method: 'Mifflin–St Jeor BMR × activity multiplier, goal-adjusted; configurable in config/nutrition.ts',
  };
}

export const progressPct = (consumed: number, target: number) =>
  target > 0 ? Math.min(999, Math.round((consumed / target) * 100)) : 0;
