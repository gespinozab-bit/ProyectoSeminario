import type { AuthResponse, AuthUser } from '@lensegua/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';
interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

async function request(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
}
async function getError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? 'No fue posible completar la solicitud.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const loadSession = useCallback(async () => {
    let response = await request('/api/auth/me');
    if (response.status === 401) {
      const refresh = await request('/api/auth/refresh', { method: 'POST' });
      if (refresh.ok) response = await request('/api/auth/me');
    }
    if (response.ok) {
      const data = (await response.json()) as AuthResponse;
      setUser(data.user);
      setSessionExpired(false);
    } else {
      setUser(null);
      setSessionExpired(true);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void loadSession();
  }, [loadSession]);
  useEffect(() => {
    const expire = () => {
      setUser(null);
      setSessionExpired(true);
    };
    window.addEventListener('lensegua:session-expired', expire);
    return () => window.removeEventListener('lensegua:session-expired', expire);
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(await getError(response));
    const data = (await response.json()) as AuthResponse;
    setUser(data.user);
    setSessionExpired(false);
  }, []);
  const logout = useCallback(async () => {
    await request('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setSessionExpired(false);
  }, []);
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const response = await request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!response.ok) throw new Error(await getError(response));
    const data = (await response.json()) as AuthResponse;
    setUser(data.user);
  }, []);
  const value = useMemo(
    () => ({ user, loading, sessionExpired, login, logout, changePassword }),
    [user, loading, sessionExpired, login, logout, changePassword],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
