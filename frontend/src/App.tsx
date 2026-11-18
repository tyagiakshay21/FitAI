import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Loader } from './components/Loader';
import { profileApi } from './lib/api';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Workouts from './pages/Workouts';
import WorkoutSession from './pages/WorkoutSession';
import FormCheck from './pages/FormCheck';
import Nutrition from './pages/Nutrition';
import Progress from './pages/Progress';
import Assistant from './pages/Assistant';
import Achievements from './pages/Achievements';
import BmiCalculator from './pages/BmiCalculator';
import Admin from './pages/Admin';

/** Ensures a logged-in user without a completed profile lands on onboarding, everywhere else. */
function AppShell() {
  const { user } = useAuth();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return setOnboarded(null);
    profileApi.get().then((r) => setOnboarded(r.profile?.onboardingCompleted ?? false)).catch(() => setOnboarded(false));
  }, [user]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute />}>
        <Route
          path="/onboarding"
          element={onboarded === null ? <Loader full /> : onboarded ? <Navigate to="/dashboard" replace /> : <Onboarding />}
        />
        <Route
          element={
            onboarded === null ? <Loader full /> : onboarded === false ? <Navigate to="/onboarding" replace /> : <Layout />
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/workouts/session/:workoutId" element={<WorkoutSession />} />
          <Route path="/form-check" element={<FormCheck />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/bmi" element={<BmiCalculator />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
