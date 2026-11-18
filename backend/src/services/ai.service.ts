import { prisma } from '../config/db';
import { AppError } from '../utils/AppError';
import { addDays, isoDate, round, toDate } from '../utils/dates';
import { GoalKey } from '../config/nutrition';
import { SAFETY_SYSTEM, complete, llmConfigured, parseJson } from './llm.service';
import { computeMetrics } from './nutrition.service';
import { nutritionDay, nutritionRange, waterTotal } from './tracking.service';
import { strengthSeries, weeklyVolume } from './progress.service';
import { workoutStreak } from './achievement.service';
import { todayWorkout } from './workout.service';
import { weightForecast } from './ml.service';

export const DISCLAIMER = 'FitAI gives general fitness and nutrition guidance, not medical advice. Predictions are estimates, not guarantees.';

/* ───────────── Context (only facts computed from the user's own data) ───────────── */
export async function buildContext(userId: string, dateIso?: string) {
  const date = toDate(dateIso);
  const [profile, goal] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.fitnessGoal.findFirst({ where: { userId, active: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  const effectiveProfile = profile ?? {
    id: 'placeholder',
    userId,
    age: 25,
    gender: 'MALE' as const,
    weightKg: 70,
    heightCm: 170,
    activityLevel: 'MODERATE' as const,
    experience: 'BEGINNER' as const,
    workoutDaysPerWeek: 3,
    workoutDurationMin: 45,
    location: 'GYM' as const,
    equipment: [] as string[],
    injuries: [] as string[],
    dietType: 'VEGETARIAN' as const,
    allergies: [] as string[],
    foodPreferences: [] as string[],
    dislikedFoods: [] as string[],
    mealsPerDay: 4,
    stepTarget: 8000,
    sleepHours: 7.5,
    bodyFatPct: null,
    budgetPerDayInr: null,
    cookingPreference: 'STANDARD',
    onboardingCompleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const metrics = computeMetrics(effectiveProfile, (goal?.type ?? 'GENERAL_FITNESS') as GoalKey);
  const [day, water, steps, sleep, streak, today, vol, sessions, weights, week] = await Promise.all([
    nutritionDay(userId, isoDate(date)),
    waterTotal(userId, date),
    prisma.stepLog.findUnique({ where: { userId_date: { userId, date } } }),
    prisma.sleepLog.findUnique({ where: { userId_date: { userId, date } } }),
    workoutStreak(userId),
    todayWorkout(userId, isoDate(date)),
    weeklyVolume(userId, 4),
    prisma.workoutSession.findMany({ where: { userId, completed: true }, orderBy: { date: 'desc' }, take: 5, include: { workout: { select: { focus: true } } } }),
    prisma.weightLog.findMany({ where: { userId, date: { gte: addDays(date, -28) } }, orderBy: { date: 'asc' } }),
    prisma.workoutSession.count({ where: { userId, completed: true, date: { gte: addDays(date, -((date.getUTCDay() + 6) % 7)), lte: date } } }),
  ]);
  return {
    date: isoDate(date),
    profile: {
      age: effectiveProfile.age, gender: effectiveProfile.gender, weightKg: effectiveProfile.weightKg, heightCm: effectiveProfile.heightCm, experience: effectiveProfile.experience,
      dietType: effectiveProfile.dietType, allergies: effectiveProfile.allergies, injuries: effectiveProfile.injuries, workoutDaysPerWeek: effectiveProfile.workoutDaysPerWeek,
      onboardingCompleted: !!profile?.onboardingCompleted,
    },
    goal: goal ? { type: goal.type, targetWeightKg: goal.targetWeightKg } : null,
    targets: { ...metrics.macros },
    today: { totals: day.totals, waterMl: water, steps: steps?.steps ?? null, sleepHours: sleep?.hours ?? null },
    weekSessions: { completed: week, planned: effectiveProfile.workoutDaysPerWeek },
    streak,
    plannedToday: today.restDay
      ? { restDay: true }
      : today.workout
        ? { focus: today.workout.focus, exercises: today.workout.exercises.map((e) => `${e.exercise.name} ${e.durationMin ? `${e.durationMin} min` : `${e.sets}×${e.repMin}-${e.repMax}`}`) }
        : null,
    weeklyVolumeKg: vol.map((v) => ({ weekStart: v.weekStart, volumeKg: v.volumeKg, byCategory: v.byCategory })),
    recentSessions: sessions.map((s) => ({ date: isoDate(s.date), focus: s.workout?.focus ?? 'Custom', durationMin: s.durationMin })),
    weight: weights.length ? { first: weights[0].weightKg, last: weights[weights.length - 1].weightKg, entries: weights.length, days: 28 } : null,
  };
}
type Ctx = Awaited<ReturnType<typeof buildContext>>;

/* ───────────── Daily recommendation ───────────── */
function dailyFacts(ctx: Ctx): string[] {
  const facts: string[] = [];
  facts.push(`You have completed ${ctx.weekSessions.completed} of ${ctx.weekSessions.planned} planned workouts this week.`);
  if (ctx.plannedToday && 'restDay' in ctx.plannedToday) facts.push('Today is a scheduled rest day; an easy walk and good sleep are useful options.');
  else if (ctx.plannedToday) facts.push(`Today's planned session is ${ctx.plannedToday.focus}.`);
  const [prev, cur] = ctx.weeklyVolumeKg.slice(-2);
  if (prev && cur && prev.volumeKg > 0 && cur.volumeKg > 0) {
    const pct = Math.round(((cur.volumeKg - prev.volumeKg) / prev.volumeKg) * 100);
    if (Math.abs(pct) >= 5) facts.push(`Your logged training volume is ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct)}% compared with last week.${pct > 0 ? ' If recovery feels good, keep progression gradual.' : ''}`);
  }
  if (ctx.today.totals.protein > 0 || ctx.today.totals.calories > 0) {
    const left = Math.round(ctx.targets.protein - ctx.today.totals.protein);
    if (left > 0) facts.push(`You have about ${left} g of protein left for today.`);
  }
  if (ctx.today.sleepHours !== null && ctx.today.sleepHours < 6.5) facts.push(`You logged ${ctx.today.sleepHours} h of sleep, so consider keeping intensity moderate today.`);
  return facts.slice(0, 4);
}

export async function dailyRecommendation(userId: string, dateIso?: string) {
  const date = toDate(dateIso);
  const cached = await prisma.aIRecommendation.findFirst({ where: { userId, type: 'DAILY', date } });
  // Re-generate if the cached one was made before any activity today (cheap staleness check).
  if (cached && Date.now() - cached.createdAt.getTime() < 3 * 3600_000) return { content: cached.content, source: (cached.metadata as any)?.source ?? 'RULES' };
  const ctx = await buildContext(userId, isoDate(date));
  const facts = dailyFacts(ctx);
  const ai = await complete({
    maxTokens: 200,
    messages: [{ role: 'user', content: `Rewrite these facts as one friendly daily coaching note (max 3 sentences). Add no new facts, numbers or medical claims.\nFacts: ${JSON.stringify(facts)}` }],
  });
  const content = ai ?? facts.join(' ');
  const source = ai ? 'LLM' : 'RULES';
  if (cached) await prisma.aIRecommendation.delete({ where: { id: cached.id } });
  await prisma.aIRecommendation.create({ data: { userId, type: 'DAILY', date, title: 'Daily recommendation', content, metadata: { source, facts } } });
  return { content, source };
}

/* ───────────── Chat ───────────── */
const POST_WORKOUT: { text: string; diet: string[]; tags: string[] }[] = [
  { text: 'Chicken breast (150 g) with rice and a side of sabzi', diet: ['NON_VEGETARIAN'], tags: [] },
  { text: '3-egg omelette with 2 rotis', diet: ['NON_VEGETARIAN', 'EGGETARIAN'], tags: ['egg', 'gluten', 'wheat'] },
  { text: 'Paneer bhurji (100 g paneer) with roti', diet: ['VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'], tags: ['milk', 'dairy', 'gluten', 'wheat'] },
  { text: 'Dal, rice and a bowl of curd', diet: ['VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'], tags: ['milk', 'dairy'] },
  { text: 'Soya chunks curry (40 g dry) with rice', diet: ['VEGAN', 'VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'], tags: ['soy', 'soya'] },
  { text: 'Chickpea (chole) salad with a banana', diet: ['VEGAN', 'VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'], tags: [] },
  { text: 'Tofu stir-fry with vegetables and rice', diet: ['VEGAN', 'VEGETARIAN', 'EGGETARIAN', 'NON_VEGETARIAN'], tags: ['soy', 'soya'] },
];

export function ruleBasedAnswer(message: string, ctx: Ctx): string {
  const m = message.toLowerCase().trim();
  const t = ctx.today.totals;
  const p = ctx.plannedToday;

  // Greetings & Identity
  if (/^(hi|hello|hey|greetings|hola)\b/.test(m)) {
    return `Hello! I'm FitAI, your personal workout and nutrition coach. I can help answer workout questions, guide your exercise technique, explain nutrition, or check today's targets (${Math.round(t.protein)}/${ctx.targets.protein}g protein, ${t.calories}/${ctx.targets.calories} kcal). What are you working on today?`;
  }
  if (/who are you|what can you do|help me/.test(m)) {
    return `I am FitAI, your AI fitness coach! You can ask me anything about:\n• Today's workout session and exercises\n• Form and technique tips for any lift (squats, bench, deadlifts, etc.)\n• Nutrition, protein sources, and calorie balance\n• Post-workout and pre-workout meals\n• Progressive overload, muscle building, and fat loss\n• Recovery, sleep, and managing soreness\n\nWhat would you like to explore?`;
  }

  // Today's workout
  if (/(train|workout|exercise).*(today)|what should i (do|train)|today.*(train|workout)|what is my workout/.test(m)) {
    if (!p) return 'You do not have an active workout plan yet. Head over to the Workouts page to generate a personalized routine!';
    if ('restDay' in p) return 'Today is a scheduled rest day! Focus on active recovery: a 20–30 minute walk, light stretching, proper hydration, and quality sleep to help your muscles rebuild.';
    return `Today's session is focused on ${p.focus}:\n${p.exercises.map((e) => `• ${e}`).join('\n')}\nRemember to warm up for 5–8 minutes first, maintain strict form, and stay hydrated!`;
  }

  // Post-workout meals
  if (/after.*(workout|training|gym)|post.?workout/.test(m)) {
    const avoid = ctx.profile.allergies.map((a) => a.toLowerCase());
    const options = POST_WORKOUT.filter((o) => o.diet.includes(ctx.profile.dietType) && !o.tags.some((tag) => avoid.some((a) => a.includes(tag) || tag.includes(a)))).slice(0, 3);
    return `Within 1–2 hours after training, aim for 20–35g of protein plus complex carbohydrates to replenish glycogen and support muscle repair.\n\nGreat options for your ${ctx.profile.dietType.toLowerCase().replace('_', '-')} diet:\n${options.map((o) => `• ${o.text}`).join('\n')}\nAlways verify food labels for your personal allergens.`;
  }

  // Pre-workout nutrition
  if (/pre.?workout|before.*(workout|training|gym)|what to eat before/.test(m)) {
    return `For pre-workout fuel (1–2 hours before training), choose easy-to-digest carbs with moderate protein to maximize energy:\n• A banana with a small scoop of peanut butter or handful of almonds\n• Oatmeal with fruits or a dash of honey\n• Whole grain toast with eggs or paneer\n• Stay well hydrated with 400–500 ml of water beforehand.`;
  }

  // Protein status today
  if (/protein/.test(m) && /(how much|consum|eaten|ate|had|so far|today|target)/.test(m)) {
    const remaining = Math.max(0, Math.round(ctx.targets.protein - t.protein));
    const pct = Math.round((t.protein / ctx.targets.protein) * 100);
    return `You have logged ${Math.round(t.protein)}g of protein today against your target of ${ctx.targets.protein}g (${pct}%).\nYou have about ${remaining}g left to hit your goal today!`;
  }

  // Calorie status today
  if (/calorie|kcal/.test(m) && /(how much|consum|eaten|ate|had|so far|today|target|left|remain)/.test(m)) {
    const remaining = Math.round(ctx.targets.calories - t.calories);
    return `You have logged ${t.calories} kcal today. Your daily target is ${ctx.targets.calories} kcal, leaving roughly ${remaining} kcal for the remainder of the day.`;
  }

  // General protein questions / sources
  if (/protein source|high protein|how to get protein|best protein/.test(m)) {
    if (ctx.profile.dietType === 'VEGAN') {
      return `Top vegan protein sources:\n• Tofu & Tempeh (15–20g per 100g)\n• Soya chunks (approx. 50g protein per 100g dry)\n• Lentils (dal), chickpeas (chana), and rajma\n• Edamame and green peas\n• Hemp seeds, chia seeds, and plant protein powders.`;
    }
    if (ctx.profile.dietType === 'VEGETARIAN') {
      return `Top vegetarian protein sources:\n• Low-fat paneer (18–20g per 100g)\n• Greek yogurt / Hung curd (10–12g per 100g)\n• Soya chunks (approx. 50g protein per 100g dry)\n• Lentils (dal), chickpeas, rajma, and moong sprouts\n• Whey protein supplement to conveniently hit daily targets.`;
    }
    return `Top protein sources:\n• Chicken breast (30g per 100g)\n• Whole eggs and egg whites (6g per whole egg)\n• Fish like salmon, tuna, or rohu\n• Paneer, Greek yogurt, and cottage cheese\n• Soya chunks, lentils, and beans.`;
  }

  // Creatine
  if (/creatine/.test(m)) {
    return `Creatine monohydrate is one of the most researched and effective sports supplements:\n• Benefits: Increases muscular ATP stores, boosting strength, power output, and lean mass over time.\n• Dosage: 3–5 grams daily taken consistently (any time of day).\n• Hydration: Drink plenty of water (an extra 300–500ml daily), as creatine draws water into muscle cells.\n• Note: A loading phase (20g/day for 5 days) is optional; taking 3–5g daily achieves saturation in ~3 weeks.`;
  }

  // Progressive Overload & Building Muscle
  if (/progressive overload|build muscle|hypertrophy|get stronger|bulk/.test(m)) {
    return `To build muscle (hypertrophy) effectively:\n1. Progressive Overload: Aim to gradually add weight, extra reps, or improve execution on your exercises week over week.\n2. Rep Ranges: Work between 6–12 reps for compound movements and 8–15 reps for isolation movements, taking sets within 1–3 reps of failure (RPE 7–9).\n3. Calorie Balance: Maintain maintenance calories or a slight surplus (200–300 kcal).\n4. Adequate Protein: Hit 1.6–2.2g of protein per kg of body weight.\n5. Sleep: Aim for 7–9 hours nightly for optimal hormone and tissue recovery.`;
  }

  // Fat loss & Cutting
  if (/fat loss|lose weight|burn fat|cut calories|deficit/.test(m)) {
    return `Sustainable fat loss principles:\n1. Caloric Deficit: Maintain a moderate deficit of 300–500 kcal below your maintenance (TDEE: ${ctx.targets.calories} kcal).\n2. Preserve Lean Mass: Keep protein high (${ctx.targets.protein}g) and continue lifting with challenging weights.\n3. Daily Activity: Increase NEAT (non-exercise activity) by aiming for 8,000–10,000 steps daily.\n4. Patience: Safe fat loss is typically 0.5–1% of body weight per week to avoid muscle loss and metabolic slowdown.`;
  }

  // Soreness / Recovery / DOMS
  if (/sore|doms|muscle pain|recovery|recover/.test(m)) {
    return `Delayed Onset Muscle Soreness (DOMS) is common, especially after new exercises or higher volume:\n• Light Movement: A 20-minute walk or gentle cycling increases blood flow and eases stiffness.\n• Hydration & Electrolytes: Ensure you drink enough water throughout the day.\n• Sleep & Protein: Your body repairs tissue primarily during deep sleep with dietary amino acids.\n• Important: Differentiate between normal muscle soreness (diffuse, dull ache) and joint/tendon sharp pain. If you feel sharp joint pain, rest that area and seek professional medical guidance.`;
  }

  // Hydration
  if (/water|hydrat/.test(m)) {
    return `Hydration is essential for gym performance and cognitive function:\n• General goal: 2.5 to 3.5 liters per day, plus an extra 500ml for every hour of strenuous workout.\n• Electrolytes: On heavy sweat days, ensure adequate sodium and potassium intake.`;
  }

  // Form & Exercise Technique
  if (/squat/.test(m)) {
    return `Squat Key Technique Cues:\n• Feet shoulder-width apart, toes angled slightly out (15–30°).\n• Brace your core like you're about to be punched, keep chest proud.\n• Initiate by breaking at the hips and knees simultaneously.\n• Keep knees tracking in line with your toes (avoid knee caving / valgus).\n• Descend until hip crease is parallel with or below knees, then push the floor away through midfoot.`;
  }
  if (/bench press/.test(m)) {
    return `Bench Press Key Cues:\n• Set your shoulder blades pinched together and driven down into the bench.\n• Keep a stable arch, glutes on the bench, and feet firmly planted on the floor.\n• Lower the bar in a controlled diagonal path to lower chest / sternum.\n• Tuck elbows at roughly a 45–70° angle (don't flare them out 90°).\n• Drive up evenly without lifting your hips off the pad.`;
  }
  if (/deadlift/.test(m)) {
    return `Deadlift Key Cues:\n• Stand with mid-foot directly under the bar (bar ~1 inch from shins).\n• Hinge at your hips and grip the bar just outside your knees.\n• Bring shins forward to touch the bar, pull your chest up and lock your lats ('protect your armpits').\n• Take the slack out of the bar, brace core, and push the floor away through your heels and midfoot.\n• Stand tall without hyperextending your lower back at lockout.`;
  }

  // Training volume trend
  if (/volume/.test(m)) {
    const v = ctx.weeklyVolumeKg.filter((x) => x.volumeKg > 0);
    if (v.length < 2) return 'I need at least two weeks of logged workout sets to analyze your volume trend.';
    const last = v[v.length - 1], prev = v[v.length - 2];
    const pct = Math.round(((last.volumeKg - prev.volumeKg) / prev.volumeKg) * 100);
    return `Your weekly volume (sets × reps × weight) shifted from ${prev.volumeKg} kg to ${last.volumeKg} kg (${pct >= 0 ? '+' : ''}${pct}%).\nA steady 5–10% increase over weeks indicates good progressive overload, provided recovery feels strong!`;
  }

  // Meal Plan guidance
  if (/meal plan|diet plan|what should i eat|what to eat/.test(m)) {
    return `Open Nutrition → Meal plan in the app to view or generate your tailored 7-day ${ctx.profile.dietType.toLowerCase().replace('_', '-')} meal plan designed around your ${ctx.targets.calories} kcal target and ${ctx.targets.protein}g protein, automatically excluding your allergies (${ctx.profile.allergies.join(', ') || 'none'}).`;
  }

  // Fallback
  return `I can help with any fitness, training, or nutrition question! For example:\n• "What is my planned workout today?"\n• "How much protein or calories do I have left today?"\n• "What are the best pre/post-workout meal ideas?"\n• "How to do squats with proper form?"\n• "Explain progressive overload or creatine"\n\nFeel free to ask any specific question!`;
}

export async function chat(userId: string, message: string, dateIso?: string) {
  const ctx = await buildContext(userId, dateIso);
  const history = await prisma.chatMessage.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 8 });
  const msgs = [
    ...history.reverse().map((h) => ({ role: (h.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: message },
  ];

  const systemPrompt = `${SAFETY_SYSTEM}

User Profile & Live Tracking Context:
${JSON.stringify(ctx, null, 2)}

Instructions for answering the user:
- Act as FitAI, the user's motivating personal trainer and sports nutrition coach.
- You can answer ANY question on workout routines, exercise mechanics, nutrition, muscle building, fat loss, mobility, recovery, and fitness science.
- If the question relates to the user's personal tracking (e.g. today's workout, calories consumed, protein status, streak, current weight), use the JSON context data provided above.
- If the user asks a general fitness question, provide thorough, accurate, practical and actionable advice with bullet points where appropriate.
- Always respect the user's diet (${ctx.profile.dietType}), allergies (${ctx.profile.allergies.join(', ') || 'none'}), and reported injuries (${ctx.profile.injuries.join(', ') || 'none'}).
- Keep the response warm, inspiring, concise (under 250 words unless detailed depth is required), and free of medical jargon.`;

  const ai = await complete({
    system: systemPrompt,
    messages: msgs,
    maxTokens: 750,
  });

  const reply = ai ?? ruleBasedAnswer(message, ctx);
  await prisma.chatMessage.createMany({ data: [{ userId, role: 'USER', content: message }, { userId, role: 'ASSISTANT', content: reply }] });
  return { reply, source: ai ? 'LLM' : 'RULES', disclaimer: DISCLAIMER };
}
export const chatHistory = (userId: string) =>
  prisma.chatMessage.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: 60, select: { id: true, role: true, content: true, createdAt: true } });

/* ───────────── Progress analysis ───────────── */
export async function progressAnalysis(userId: string) {
  const today = toDate();
  const [ctx, range, strength, forecast, prog] = await Promise.all([
    buildContext(userId),
    nutritionRange(userId, addDays(today, -27), today),
    strengthSeries(userId, 56, 3),
    weightForecast(userId, 28).catch(() => null) as Promise<any>,
    prisma.progress.findMany({ where: { userId }, orderBy: { weekStart: 'desc' }, take: 4 }),
  ]);
  const findings: string[] = [];
  if (ctx.weight && ctx.weight.entries >= 2) {
    const d = round(ctx.weight.last - ctx.weight.first);
    findings.push(`Weight: ${d === 0 ? 'unchanged' : `${d > 0 ? '+' : ''}${d} kg`} over the last 28 days (${ctx.weight.entries} weigh-ins).`);
  } else findings.push('Weight: log at least two weigh-ins to see a trend.');
  if (prog.length) {
    const avg = Math.round(prog.reduce((s, p) => s + (p.consistencyPct ?? 0), 0) / prog.length);
    findings.push(`Workout consistency: ${avg}% of planned sessions over the last ${prog.length} weeks.`);
  }
  const logged = range.daily.filter((d) => d.logged);
  if (logged.length >= 5) {
    const within = logged.filter((d) => Math.abs(d.calories - ctx.targets.calories) <= ctx.targets.calories * 0.1).length;
    const protein = logged.filter((d) => d.protein >= ctx.targets.protein * 0.9).length;
    findings.push(`Calories: within ±10% of target on ${within} of ${logged.length} logged days.`);
    findings.push(`Protein: at least 90% of target on ${protein} of ${logged.length} logged days.`);
  } else findings.push('Nutrition: log food for at least 5 days to assess adherence.');
  for (const s of strength) {
    if (s.points.length >= 2) {
      const a = s.points[0].e1rm, b = s.points[s.points.length - 1].e1rm;
      findings.push(`${s.exercise}: estimated 1RM ${a} → ${b} kg (${b >= a ? '+' : ''}${round(b - a)} kg).`);
    }
  }
  if (forecast?.available && forecast.forecast?.length) {
    const end = forecast.forecast[forecast.forecast.length - 1];
    findings.push(`Trend estimate: about ${end.weight_kg} kg in ${forecast.horizon_days} days if recent habits continue (range ${end.low}–${end.high} kg). This is an estimate, not a guarantee.`);
  }
  const narrative = await complete({
    maxTokens: 350,
    messages: [{ role: 'user', content: `Write a short progress summary (max 5 sentences) and 2 concrete suggestions based ONLY on these findings. No medical claims.\n${JSON.stringify(findings)}` }],
  });
  const summary = narrative ?? findings.join(' ');
  await prisma.aIRecommendation.create({ data: { userId, type: 'PROGRESS_ANALYSIS', date: today, title: 'Progress analysis', content: summary, metadata: { findings } } });
  return { summary, findings, source: narrative ? 'LLM' : 'RULES', forecast: forecast ?? null, disclaimer: DISCLAIMER };
}

/* ───────────── Food photo recognition ───────────── */
export async function recognizeFood(image: Buffer, mimeType: string) {
  if (!llmConfigured()) throw AppError.unavailable('Food recognition needs GEMINI_API_KEY or ANTHROPIC_API_KEY. You can still log food manually.');
  const text = await complete({
    maxTokens: 700,
    system: 'You estimate nutrition from food photos. Reply with JSON only.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: image.toString('base64') } },
        { type: 'text', text: 'Identify each distinct food item (Indian foods included). Return ONLY JSON: {"items":[{"name":string,"estimatedQuantityG":number,"calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"confidence":number between 0 and 1}]}. Values are for the estimated portion. If there is no food, return {"items":[]}.' },
      ],
    }],
  });
  const parsed = parseJson<{ items: any[] }>(text);
  if (!parsed) throw AppError.unavailable('Could not analyse the image. Try a clearer photo or log manually.');
  const num = (v: unknown, max: number) => Math.min(max, Math.max(0, Number(v) || 0));
  const items = (parsed.items ?? []).slice(0, 8).map((i) => ({
    name: String(i.name ?? 'Unknown food').slice(0, 80),
    quantityG: num(i.estimatedQuantityG, 2000) || 100,
    calories: Math.round(num(i.calories, 3000)), protein: round(num(i.protein, 300)), carbs: round(num(i.carbs, 500)),
    fat: round(num(i.fat, 300)), fiber: round(num(i.fiber, 100)), confidence: num(i.confidence, 1),
  }));
  return { items, estimate: true, disclaimer: 'Photo-based nutrition is a rough estimate. Please review and edit before saving.' };
}
