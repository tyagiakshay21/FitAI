import axios, { AxiosError } from 'axios';
import type {
  Achievement, ChatMessage, DashboardData, Exercise, Food, MealPlan, Metrics, Notification,
  NutritionLog, Profile, TimelineEvent, User, WorkoutPlan, WorkoutSession,
} from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

export const api = axios.create({ baseURL: API_URL, withCredentials: true });

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

type Refresher = () => Promise<string | null>;
let refresher: Refresher | null = null;
export const setRefresher = (fn: Refresher) => { refresher = fn; };

let refreshing: Promise<string | null> | null = null;
api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes('/auth/')) {
      original._retry = true;
      refreshing ??= (refresher?.() ?? Promise.resolve(null)).finally(() => { refreshing = null; });
      const token = await refreshing;
      if (token) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.') {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string; error?: { message?: string; details?: Record<string, string[]> } } | undefined;
    const firstDetail = body?.error?.details
      ? Object.entries(body.error.details).flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))[0]
      : undefined;
    return firstDetail ?? body?.error?.message ?? body?.message ?? fallback;
  }
  return fallback;
}

/* ---------- Auth ---------- */
export const authApi = {
  register: (data: { email: string; password: string; name?: string }) => api.post<{ user: User; accessToken: string }>('/auth/register', data).then((r) => r.data),
  login: (email: string, password: string) => api.post<{ user: User; accessToken: string }>('/auth/login', { email, password }).then((r) => r.data),
  refresh: () => api.post<{ user: User; accessToken: string }>('/auth/refresh').then((r) => r.data),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => api.post('/auth/reset-password', { token, password }),
  me: () => api.get<User>('/auth/me').then((r) => r.data),
};

/* ---------- Profile ---------- */
export const profileApi = {
  get: () => api.get<{ profile: Profile | null; goal: unknown; metrics: Metrics | null }>('/profile').then((r) => r.data),
  onboard: (data: unknown) => api.post('/profile/onboarding', data).then((r) => r.data),
  update: (data: Partial<Profile> & { goal?: string; targetWeightKg?: number }) => api.put('/profile', data).then((r) => r.data),
  bmi: (weightKg: number, heightCm: number) => api.post<{
    value: number;
    standard: string;
    asianPacific: string;
    healthyWeightRangeKg: [number, number];
    disclaimer: string;
  }>('/metrics/bmi', { weightKg, heightCm }).then((r) => r.data),
  dashboard: (date?: string) => api.get<DashboardData>('/dashboard', { params: { date } }).then((r) => r.data),
};

/* ---------- Workouts ---------- */
export const workoutApi = {
  exercises: (params: Record<string, unknown>) => api.get<{ items: Exercise[]; total: number }>('/exercises', { params }).then((r) => r.data),
  generatePlan: () => api.post<WorkoutPlan>('/workouts/plans/generate').then((r) => r.data),
  activePlan: () => api.get<WorkoutPlan | null>('/workouts/plans/active').then((r) => r.data),
  adaptPlan: () => api.post('/workouts/plans/adapt').then((r) => r.data),
  today: (date?: string) => api.get<{ restDay: boolean; workout: WorkoutPlan['workouts'][number] | null; planId: string | null }>('/workouts/today', { params: { date } }).then((r) => r.data),
  sessions: () => api.get<WorkoutSession[]>('/workouts/sessions').then((r) => r.data),
  startSession: (workoutId?: string, date?: string) => api.post<WorkoutSession>('/workouts/sessions', { workoutId, date }).then((r) => r.data),
  logSet: (sessionId: string, data: { exerciseId: string; setNumber: number; reps: number; weightKg?: number; rpe?: number; durationSec?: number }) =>
    api.post(`/workouts/sessions/${sessionId}/sets`, data).then((r) => r.data),
  finishSession: (sessionId: string, data: { rating?: number; notes?: string }) =>
    api.post<{ session: WorkoutSession; newAchievements: string[] }>(`/workouts/sessions/${sessionId}/finish`, data).then((r) => r.data),
  saveFormAnalysis: (data: Record<string, unknown>) => api.post('/analysis/form', data).then((r) => r.data),
  formHistory: () => api.get('/analysis/form').then((r) => r.data),
};

/* ---------- Nutrition ---------- */
export const nutritionApi = {
  foods: (params: Record<string, unknown>) => api.get<Food[]>('/nutrition/foods', { params }).then((r) => r.data),
  addLog: (data: Record<string, unknown>) => api.post<NutritionLog>('/nutrition/logs', data).then((r) => r.data),
  deleteLog: (id: string) => api.delete(`/nutrition/logs/${id}`),
  day: (date?: string) => api.get('/nutrition/day', { params: { date } }).then((r) => r.data),
  summary: (days: number) => api.get('/nutrition/summary', { params: { days } }).then((r) => r.data),
  generateMealPlan: (calories?: number) => api.post<MealPlan>('/nutrition/meal-plans/generate', { calories }).then((r) => r.data),
  activeMealPlan: () => api.get<MealPlan | null>('/nutrition/meal-plans/active').then((r) => r.data),
  logMeal: (mealId: string, date?: string) => api.post(`/nutrition/meals/${mealId}/log`, { date }).then((r) => r.data),
  water: (amountMl: number, date?: string) => api.post('/nutrition/water', { amountMl, date }).then((r) => r.data),
  sleep: (hours: number, quality?: number, date?: string) => api.post('/nutrition/sleep', { hours, quality, date }).then((r) => r.data),
  steps: (steps: number, date?: string) => api.post('/nutrition/steps', { steps, date }).then((r) => r.data),
  recognizeFood: (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return api.post('/ai/food-recognition', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
};

/* ---------- Progress ---------- */
export const progressApi = {
  addWeight: (weightKg: number, date?: string) => api.post('/progress/weight', { weightKg, date }).then((r) => r.data),
  weights: (days = 120) => api.get('/progress/weight', { params: { days } }).then((r) => r.data),
  addMeasurement: (data: Record<string, unknown>, photo?: File) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => v !== undefined && v !== '' && fd.append(k, String(v)));
    if (photo) fd.append('photo', photo);
    return api.post('/progress/measurements', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  measurements: (days = 180) => api.get('/progress/measurements', { params: { days } }).then((r) => r.data),
  timeline: () => api.get<TimelineEvent[]>('/progress/timeline').then((r) => r.data),
  strength: () => api.get('/progress/strength').then((r) => r.data),
  volume: () => api.get('/progress/volume').then((r) => r.data),
};

/* ---------- AI + ML ---------- */
export const aiApi = {
  chat: (message: string) => api.post<{ reply: string; source: string; disclaimer: string }>('/ai/chat', { message }).then((r) => r.data),
  history: () => api.get<ChatMessage[]>('/ai/chat/history').then((r) => r.data),
  daily: () => api.get('/ai/recommendation/daily').then((r) => r.data),
  progressAnalysis: () => api.post('/ai/progress-analysis').then((r) => r.data),
  weightForecast: (days = 28) => api.get('/ml/weight-forecast', { params: { days } }).then((r) => r.data),
  adherence: () => api.get('/ml/adherence').then((r) => r.data),
  workoutRecs: () => api.get('/ml/workout-recommendations').then((r) => r.data),
  insights: () => api.get('/ml/insights').then((r) => r.data),
  notifications: () => api.get<Notification[]>('/notifications').then((r) => r.data),
  readNotifications: () => api.post('/notifications/read'),
  achievements: () => api.get<Achievement[]>('/achievements').then((r) => r.data),
};

/* ---------- Admin ---------- */
export const adminApi = {
  users: () => api.get('/admin/users').then((r) => r.data),
  setRole: (id: string, role: string) => api.patch(`/admin/users/${id}/role`, { role }),
  setActive: (id: string, isActive: boolean) => api.patch(`/admin/users/${id}/active`, { isActive }),
};
