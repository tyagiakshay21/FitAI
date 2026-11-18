export type Role = 'USER' | 'ADMIN' | 'TRAINER';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type Experience = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export type Location = 'HOME' | 'GYM' | 'BOTH' | 'OUTDOOR';
export type DietType = 'VEGAN' | 'VEGETARIAN' | 'EGGETARIAN' | 'NON_VEGETARIAN';
export type Goal =
  | 'WEIGHT_LOSS' | 'FAT_LOSS' | 'MUSCLE_GAIN' | 'STRENGTH' | 'ENDURANCE'
  | 'BODY_RECOMPOSITION' | 'GENERAL_FITNESS';
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type FoodRole = 'PROTEIN' | 'CARB' | 'VEGETABLE' | 'FRUIT' | 'DAIRY' | 'FAT' | 'SNACK';
export type ExerciseCategory =
  | 'CHEST' | 'BACK' | 'SHOULDERS' | 'BICEPS' | 'TRICEPS' | 'LEGS' | 'GLUTES'
  | 'CORE' | 'CARDIO' | 'FULL_BODY' | 'MOBILITY' | 'STRETCHING';

export interface User { id: string; email: string; name: string | null; role: Role; }

export interface Profile {
  userId: string; age: number; gender: Gender; heightCm: number; weightKg: number;
  bodyFatPct: number | null; experience: Experience; location: Location; equipment: string[];
  workoutDaysPerWeek: number; workoutDurationMin: number; injuries: string[];
  dietType: DietType; allergies: string[]; dislikedFoods: string[]; foodPreferences: string[];
  mealsPerDay: number; budgetPerDayInr: number | null; stepTarget: number; sleepHours: number;
  onboardingCompleted: boolean;
}
export interface FitnessGoal { id: string; type: Goal; targetWeightKg: number | null; startWeightKg: number | null; }
export interface Metrics {
  bmi: number; bmiCategories: { standard: string; asianPacific: string };
  bmr: number; tdee: number; calorieTarget: number; flooredToMinimum: boolean;
  macros: { protein: number; carbs: number; fat: number; fiber: number; waterMl: number };
}

export interface Exercise {
  id: string; name: string; description: string; category: ExerciseCategory; muscleGroups: string[];
  equipment: string[]; difficulty: Experience; isCompound: boolean; instructions: string[];
  defaultSets: number; repMin: number; repMax: number; restSec: number; caloriesPerMin: number;
  safetyNotes: string | null; jointStress: string[];
}
export interface WorkoutExercise {
  id: string; order: number; sets: number; repMin: number; repMax: number; restSec: number;
  tempo: string | null; durationMin: number | null; notes: string | null; exercise: Exercise;
}
export interface Workout {
  id: string; dayIndex: number; dayName: string; focus: string; estimatedMinutes: number;
  warmup: string[]; cooldown: string[]; exercises: WorkoutExercise[];
}
export interface WorkoutPlan {
  id: string; name: string; split: string; notes: string | null;
  progression: { method: string; rules: string[]; goalNote: string }; workouts: Workout[];
}
export interface ExerciseSet { id: string; exerciseId: string; reps: number; weightKg: number | null; rpe: number | null; durationSec: number | null; }
export interface WorkoutSession {
  id: string; date: string; startedAt: string; endedAt: string | null; durationMin: number | null;
  caloriesBurned: number | null; completed: boolean; rating: number | null; notes: string | null;
  workout?: { dayName: string; focus: string } | null; sets: (ExerciseSet & { exercise: { name: string; category: string } })[];
}

export interface Food {
  id: string; name: string; category: FoodRole; dietType: DietType; servingG: number;
  servingLabel: string | null; calories: number; protein: number; carbs: number; fat: number;
  fiber: number; allergens: string[]; mealTypes: MealType[]; isIndian: boolean;
}
export interface MealItem { id: string; foodId: string | null; foodName: string; quantityG: number; calories: number; protein: number; carbs: number; fat: number; fiber: number; }
export interface Meal { id: string; dayIndex: number; type: MealType; name: string; calories: number; protein: number; carbs: number; fat: number; fiber: number; items: MealItem[]; }
export interface MealPlan { id: string; name: string; targetCalories: number; targetProtein: number; targetCarbs: number; targetFat: number; notes: string | null; meals: Meal[]; }
export interface NutritionLog { id: string; date: string; mealType: MealType; foodName: string; quantityG: number; calories: number; protein: number; carbs: number; fat: number; fiber: number; }

export interface DashboardData {
  date: string;
  cards: {
    currentWeightKg: number; targetWeightKg: number | null; goal: Goal | null; bmi: number; bmr: number; tdee: number;
    calorieTarget: number; caloriesConsumed: number; caloriesBurned: number; caloriesRemaining: number;
    protein: MacroCard; carbs: MacroCard; fat: MacroCard; fiber: { target: number; consumed: number; pct: number };
    water: { targetMl: number; consumedMl: number; pct: number }; steps: { target: number; count: number; pct: number };
    sleepHours: number | null; workoutStreak: number; weeklyWorkouts: { completed: number; planned: number };
  };
  metrics: Metrics;
  today: { restDay: boolean; workout: { id: string; dayName: string; focus: string; exercises: number; estimatedMinutes: number } | null };
  recommendation: { content: string; source: string };
  charts: {
    weight: { date: string; weightKg: number }[];
    calories: { date: string; calories: number; target: number }[];
    protein: { date: string; protein: number; target: number }[];
    workoutVolume: { weekStart: string; volumeKg: number }[];
    steps: { date: string; steps: number; target: number }[];
    measurements: { date: string; waistCm: number | null; chestCm: number | null; armsCm: number | null; thighsCm: number | null }[];
    consistency: { weekStart: string; completed: number; planned: number }[];
    strength: { exercise: string; points: { date: string; e1rm: number }[] }[];
  };
}
interface MacroCard { target: number; consumed: number; remaining: number; pct: number }

export interface Achievement { id: string; code: string; title: string; description: string; unlockedAt: string; }
export interface Notification { id: string; type: string; title: string; body: string; read: boolean; createdAt: string; }
export interface ChatMessage { id: string; role: 'USER' | 'ASSISTANT'; content: string; createdAt: string; }
export interface TimelineEvent { date: string; type: 'WEEK' | 'MEASUREMENT' | 'PHOTO' | 'ACHIEVEMENT'; title: string; detail: string; photoUrl: string | null; }
