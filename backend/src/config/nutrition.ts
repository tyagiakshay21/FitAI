/**
 * Nutrition calculation configuration. Nothing here is hard-wired into the
 * calculation code: override any value at runtime with the NUTRITION_OVERRIDES
 * env var (JSON), e.g.
 *   NUTRITION_OVERRIDES='{"goalAdjustments":{"WEIGHT_LOSS":-0.15}}'
 */
export type GoalKey =
  | 'WEIGHT_LOSS' | 'FAT_LOSS' | 'MUSCLE_GAIN' | 'STRENGTH'
  | 'ENDURANCE' | 'GENERAL_FITNESS' | 'BODY_RECOMPOSITION';

export interface NutritionConfig {
  activityMultipliers: Record<string, number>;
  /** Fraction of TDEE added (+) or removed (-) for each goal. */
  goalAdjustments: Record<GoalKey, number>;
  /** Hard safety limits so a mis-configuration cannot produce an extreme target. */
  maxDeficitFraction: number;
  minCalories: { MALE: number; FEMALE: number; OTHER: number };
  proteinPerKg: Record<GoalKey, number>;
  fatFractionOfCalories: number;
  minFatPerKg: number;
  minCarbsG: number;
  fiberPer1000Kcal: number;
  waterMlPerKg: number;
  waterActiveBonusMl: number;
}

export const DEFAULT_NUTRITION_CONFIG: NutritionConfig = {
  activityMultipliers: { SEDENTARY: 1.2, LIGHT: 1.375, MODERATE: 1.55, ACTIVE: 1.725, VERY_ACTIVE: 1.9 },
  goalAdjustments: {
    WEIGHT_LOSS: -0.2,
    FAT_LOSS: -0.15,
    MUSCLE_GAIN: 0.1,
    STRENGTH: 0.05,
    ENDURANCE: 0,
    GENERAL_FITNESS: 0,
    BODY_RECOMPOSITION: -0.05,
  },
  maxDeficitFraction: 0.25,
  minCalories: { MALE: 1500, FEMALE: 1200, OTHER: 1350 },
  proteinPerKg: {
    WEIGHT_LOSS: 1.8, FAT_LOSS: 2.0, MUSCLE_GAIN: 1.8, STRENGTH: 1.8,
    ENDURANCE: 1.4, GENERAL_FITNESS: 1.4, BODY_RECOMPOSITION: 2.0,
  },
  fatFractionOfCalories: 0.27,
  minFatPerKg: 0.6,
  minCarbsG: 100,
  fiberPer1000Kcal: 14,
  waterMlPerKg: 35,
  waterActiveBonusMl: 500,
};

function merge<T>(base: T, over: any): T {
  if (over === null || typeof over !== 'object' || Array.isArray(over)) return base;
  const out: any = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = typeof (base as any)[k] === 'object' && (base as any)[k] !== null
      ? merge((base as any)[k], over[k])
      : over[k];
  }
  return out;
}

export function loadNutritionConfig(overridesJson = process.env.NUTRITION_OVERRIDES): NutritionConfig {
  if (!overridesJson) return DEFAULT_NUTRITION_CONFIG;
  try {
    return merge(DEFAULT_NUTRITION_CONFIG, JSON.parse(overridesJson));
  } catch {
    return DEFAULT_NUTRITION_CONFIG;
  }
}
