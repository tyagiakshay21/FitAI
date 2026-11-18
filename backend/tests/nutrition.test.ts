import { describe, expect, it } from 'vitest';
import { bmi, bmiCategory, bmr, calorieTarget, macroTargets, tdee } from '../src/services/nutrition.service';
import { DEFAULT_NUTRITION_CONFIG, loadNutritionConfig } from '../src/config/nutrition';

const man = { gender: 'MALE' as const, age: 30, heightCm: 180, weightKg: 80, activityLevel: 'MODERATE' };

describe('nutrition calculations', () => {
  it('BMI = kg / m²', () => {
    expect(bmi(70, 175)).toBe(22.9);
    expect(bmiCategory(22.9).standard).toBe('Normal weight');
    expect(bmiCategory(24).asianPacific).toBe('Overweight (at risk)');
  });
  it('Mifflin-St Jeor', () => {
    expect(bmr(man)).toBe(1780); // 10*80 + 6.25*180 - 5*30 + 5
    expect(bmr({ ...man, gender: 'FEMALE' })).toBe(1614);
    expect(tdee(man)).toBe(Math.round(1780 * 1.55));
  });
  it('applies goal adjustments and never goes below the safe floor', () => {
    const loss = calorieTarget(man, 'WEIGHT_LOSS');
    expect(loss.target).toBe(Math.round(tdee(man) * 0.8));
    const tiny = { gender: 'FEMALE' as const, age: 60, heightCm: 150, weightKg: 42, activityLevel: 'SEDENTARY' };
    const t = calorieTarget(tiny, 'WEIGHT_LOSS');
    expect(t.target).toBeGreaterThanOrEqual(1200);
    expect(t.flooredToMinimum).toBe(true);
  });
  it('clamps an extreme configured deficit', () => {
    const cfg = { ...DEFAULT_NUTRITION_CONFIG, goalAdjustments: { ...DEFAULT_NUTRITION_CONFIG.goalAdjustments, WEIGHT_LOSS: -0.6 } };
    expect(calorieTarget(man, 'WEIGHT_LOSS', cfg).adjustmentFraction).toBe(-0.25);
  });
  it('macros roughly add up to the calorie target', () => {
    const m = macroTargets(2400, 80, 'MUSCLE_GAIN');
    expect(m.protein).toBe(144);
    expect(Math.abs(m.protein * 4 + m.carbs * 4 + m.fat * 9 - 2400)).toBeLessThan(30);
  });
  it('supports JSON overrides', () => {
    expect(loadNutritionConfig('{"goalAdjustments":{"WEIGHT_LOSS":-0.1}}').goalAdjustments.WEIGHT_LOSS).toBe(-0.1);
    expect(loadNutritionConfig('not json')).toBe(DEFAULT_NUTRITION_CONFIG);
  });
});
