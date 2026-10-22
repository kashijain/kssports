import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearAuthToken } from './lib/api';
import type { Business, Meta, Settings, User } from './types';

interface Session {
  user: User | null;
  business: Business | null;
  settings: Settings | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setSession: (next: { user: User; business: Business | null; settings: Settings | null }) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<Session | null>(null);
let metaCache: Meta | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const data = await api<{ user: User; business: Business | null; settings: Settings | null }>('/api/auth/me');
    setUser(data.user);
    setBusiness(data.business);
    setSettings(data.settings);
  }

  useEffect(() => {
    refresh()
      .catch(() => {
        setUser(null);
        setBusiness(null);
        setSettings(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<Session>(
    () => ({
      user,
      business,
      settings,
      loading,
      refresh,
      setSession: (next) => {
        setUser(next.user);
        setBusiness(next.business);
        setSettings(next.settings);
      },
      logout: async () => {
        try {
          await api('/api/auth/logout', { method: 'POST' });
        } finally {
          clearAuthToken();
          setUser(null);
          setBusiness(null);
          setSettings(null);
        }
      },
    }),
    [user, business, settings, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Auth missing');
  return value;
}

export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(metaCache);
  useEffect(() => {
    if (metaCache) return;
    api<Meta>('/api/meta').then((data) => {
      metaCache = data;
      setMeta(data);
    });
  }, []);
  return meta;
}
