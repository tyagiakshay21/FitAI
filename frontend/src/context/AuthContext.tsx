import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, setAccessToken, setRefresher } from '../lib/api';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setRefresher(async () => {
      try {
        const r = await authApi.refresh();
        setAccessToken(r.accessToken);
        setUser(r.user);
        return r.accessToken;
      } catch {
        setAccessToken(null);
        setUser(null);
        return null;
      }
    });
    (async () => {
      try {
        const r = await authApi.refresh();
        setAccessToken(r.accessToken);
        setUser(r.user);
      } catch {
        setAccessToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const r = await authApi.login(email, password);
    setAccessToken(r.accessToken);
    setUser(r.user);
  };
  const register = async (email: string, password: string, name?: string) => {
    const r = await authApi.register({ email, password, name });
    setAccessToken(r.accessToken);
    setUser(r.user);
  };
  const logout = async () => {
    try { await authApi.logout(); } finally { setAccessToken(null); setUser(null); }
  };
  const refreshUser = async () => setUser(await authApi.me());

  return <Ctx.Provider value={{ user, loading, login, register, logout, refreshUser }}>{children}</Ctx.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
