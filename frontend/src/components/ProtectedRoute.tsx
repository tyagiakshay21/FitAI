import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from './Loader';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loader full />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

export function AdminRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loader full />;
  if (!user || user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function OnboardingGate({ completed }: { completed: boolean | null }) {
  if (completed === false) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
