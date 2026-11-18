import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { aiLimiter, authLimiter } from '../middlewares/rateLimit';
import { memoryImageUpload, photoUpload } from '../middlewares/upload';
import * as authC from '../controllers/auth.controller';
import * as profileC from '../controllers/profile.controller';
import * as workoutC from '../controllers/workout.controller';
import * as nutC from '../controllers/nutrition.controller';
import * as progC from '../controllers/progress.controller';
import * as aiC from '../controllers/ai.controller';
import * as adminC from '../controllers/admin.controller';
import { forgotSchema, loginSchema, registerSchema, resetSchema } from '../validators/auth.validators';
import { bmiSchema, onboardingSchema, updateProfileSchema } from '../validators/profile.validators';
import * as wv from '../validators/workout.validators';
import * as nv from '../validators/nutrition.validators';
import * as pv from '../validators/progress.validators';
import * as av from '../validators/ai.validators';
import { idParam, optionalDateQuery } from '../validators/common';

const api = Router();
api.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

/* Auth (public) */
const auth = Router();
auth.use(authLimiter);
auth.post('/register', validate(registerSchema), authC.register);
auth.post('/login', validate(loginSchema), authC.login);
auth.post('/refresh', authC.refresh);
auth.post('/logout', authC.logout);
auth.post('/forgot-password', validate(forgotSchema), authC.forgot);
auth.post('/reset-password', validate(resetSchema), authC.reset);
auth.get('/me', authenticate, authC.me);
api.use('/auth', auth);

/* Everything below requires a valid access token */
api.use(authenticate);

api.get('/profile', profileC.get);
api.post('/profile/onboarding', validate(onboardingSchema), profileC.onboard);
api.put('/profile', validate(updateProfileSchema), profileC.update);
api.post('/metrics/bmi', validate(bmiSchema), profileC.bmi);
api.get('/metrics', profileC.metrics);
api.get('/dashboard', validate(optionalDateQuery, 'query'), profileC.dash);

/* Exercises & training */
api.get('/exercises', validate(wv.exerciseQuery, 'query'), workoutC.listExercises);
api.get('/exercises/:id', validate(idParam, 'params'), workoutC.getExercise);
api.post('/exercises', authorize('ADMIN', 'TRAINER'), validate(wv.exerciseBody), workoutC.createExercise);
api.put('/exercises/:id', authorize('ADMIN', 'TRAINER'), validate(idParam, 'params'), validate(wv.exerciseBody.partial()), workoutC.updateExercise);
api.delete('/exercises/:id', authorize('ADMIN'), validate(idParam, 'params'), workoutC.deleteExercise);

api.post('/workouts/plans/generate', aiLimiter, workoutC.generate);
api.get('/workouts/plans/active', workoutC.activePlan);
api.post('/workouts/plans/adapt', workoutC.adapt);
api.get('/workouts/today', validate(optionalDateQuery, 'query'), workoutC.today);
api.get('/workouts/sessions', workoutC.sessions);
api.post('/workouts/sessions', validate(wv.startSessionSchema), workoutC.startSession);
api.post('/workouts/sessions/:id/sets', validate(idParam, 'params'), validate(wv.logSetSchema), workoutC.logSet);
api.post('/workouts/sessions/:id/finish', validate(idParam, 'params'), validate(wv.finishSessionSchema), workoutC.finishSession);
api.post('/analysis/form', validate(wv.formAnalysisSchema), workoutC.saveFormAnalysis);
api.get('/analysis/form', workoutC.formHistory);

/* Nutrition */
api.get('/nutrition/foods', validate(nv.foodQuery, 'query'), nutC.foods);
api.post('/nutrition/foods', validate(nv.foodBody), nutC.createFood);
api.post('/nutrition/logs', validate(nv.nutritionLogBody), nutC.addLog);
api.delete('/nutrition/logs/:id', validate(idParam, 'params'), nutC.deleteLog);
api.get('/nutrition/day', validate(optionalDateQuery, 'query'), nutC.day);
api.get('/nutrition/summary', validate(nv.rangeQuery, 'query'), nutC.summary);
api.post('/nutrition/meal-plans/generate', aiLimiter, validate(nv.mealPlanBody), nutC.generatePlan);
api.get('/nutrition/meal-plans/active', nutC.activePlan);
api.post('/nutrition/meals/:id/log', validate(idParam, 'params'), nutC.logPlannedMeal);
api.post('/nutrition/water', validate(nv.waterBody), nutC.water);
api.post('/nutrition/sleep', validate(nv.sleepBody), nutC.sleep);
api.post('/nutrition/steps', validate(nv.stepsBody), nutC.steps);

/* Progress */
api.post('/progress/weight', validate(pv.weightBody), progC.addWeight);
api.get('/progress/weight', validate(pv.daysQuery, 'query'), progC.weights);
api.post('/progress/measurements', photoUpload.single('photo'), validate(pv.measurementBody), progC.addMeasurement);
api.get('/progress/measurements', validate(pv.daysQuery, 'query'), progC.measurements);
api.get('/progress/timeline', progC.timeline);
api.get('/progress/strength', progC.strength);
api.get('/progress/volume', progC.volume);

/* AI + ML */
api.post('/ai/chat', aiLimiter, validate(av.chatBody), aiC.chat);
api.get('/ai/chat/history', aiC.history);
api.get('/ai/recommendation/daily', validate(optionalDateQuery, 'query'), aiC.daily);
api.post('/ai/progress-analysis', aiLimiter, aiC.analysis);
api.post('/ai/food-recognition', aiLimiter, memoryImageUpload.single('image'), aiC.foodPhoto);
api.get('/ml/weight-forecast', validate(av.forecastQuery, 'query'), aiC.weightForecast);
api.get('/ml/adherence', aiC.adherence);
api.get('/ml/workout-recommendations', aiC.workoutRecs);
api.get('/ml/insights', aiC.insights);

api.get('/notifications', aiC.notifications);
api.post('/notifications/read', aiC.readNotifications);
api.get('/achievements', aiC.achievements);

/* Admin */
const admin = Router();
admin.use(authorize('ADMIN'));
admin.get('/users', adminC.users);
admin.patch('/users/:id/role', validate(idParam, 'params'), validate(z.object({ role: z.enum(['USER', 'ADMIN', 'TRAINER']) })), adminC.setRole);
admin.patch('/users/:id/active', validate(idParam, 'params'), validate(z.object({ isActive: z.boolean() })), adminC.setActive);
api.use('/admin', admin);

export default api;
