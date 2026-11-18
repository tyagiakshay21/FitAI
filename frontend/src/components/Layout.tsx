import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity, Bot, Calculator, Dumbbell, Flame, LayoutDashboard, LogOut, Menu, Salad,
  ShieldCheck, TrendingUp, Trophy, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { aiApi } from '../lib/api';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workouts', label: 'Workouts', icon: Dumbbell },
  { to: '/form-check', label: 'Form Check', icon: Activity },
  { to: '/nutrition', label: 'Nutrition', icon: Salad },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/assistant', label: 'AI Assistant', icon: Bot },
  { to: '/achievements', label: 'Achievements', icon: Trophy },
  { to: '/bmi', label: 'BMI Calculator', icon: Calculator },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    aiApi.notifications().then((n) => setUnread(n.filter((x) => !x.read).length)).catch(() => {});
  }, []);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-pine text-white' : 'text-ink-soft hover:bg-pine-light hover:text-ink'
            }`
          }>
          <Icon className="h-4.5 w-4.5" /> {label}
        </NavLink>
      ))}
      {user?.role === 'ADMIN' && (
        <NavLink to="/admin" onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-pine text-white' : 'text-ink-soft hover:bg-pine-light'}`}>
          <ShieldCheck className="h-4.5 w-4.5" /> Admin
        </NavLink>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-white py-6 md:flex">
        <div className="mb-6 flex items-center gap-2 px-4">
          <div className="rounded-lg bg-pine p-1.5"><Flame className="h-5 w-5 text-white" /></div>
          <span className="font-display text-lg font-semibold">FitAI</span>
        </div>
        {nav}
        <div className="mt-auto space-y-2 px-4 pt-4">
          <p className="truncate text-xs text-ink-faint">{user?.email}</p>
          <button onClick={async () => { await logout(); navigate('/login'); }} className="btn-ghost w-full justify-start gap-2 text-sm">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-pine p-1.5"><Flame className="h-4 w-4 text-white" /></div>
          <span className="font-display font-semibold">FitAI</span>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-pine-light"><Menu className="h-5 w-5" /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 bg-ink/40 md:hidden" onClick={() => setOpen(false)}>
          <div className="flex h-full w-72 flex-col bg-white py-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between px-4">
              <span className="font-display text-lg font-semibold">FitAI</span>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            {nav}
            <button onClick={async () => { await logout(); navigate('/login'); }} className="btn-ghost mx-4 mt-4 gap-2">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet key={unread} />
        </div>
      </main>
    </div>
  );
}
