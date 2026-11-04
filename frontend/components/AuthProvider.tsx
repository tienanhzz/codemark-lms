"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api } from "../lib/api";
import type { User } from "../lib/types";

type AuthContextValue = {
  user: User | null | undefined;
  loading: boolean;
  refresh: () => Promise<User | null>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const current = await api<User>("/api/auth/me");
      setUser(current);
      return current;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => setUser(null);
    window.addEventListener("lms:unauthorized", onUnauthorized);
    return () => window.removeEventListener("lms:unauthorized", onUnauthorized);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setUser(response.user);
    return response.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors during logout
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading: user === undefined, refresh, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
