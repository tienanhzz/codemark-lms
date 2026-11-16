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
  login: (studentId: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  passwordReminder: { feature: string } | null;
  remindPasswordChange: (feature: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [passwordReminder, setPasswordReminder] = useState<{ feature: string } | null>(null);

  const remindPasswordChange = useCallback((feature: string) => {
    setPasswordReminder({ feature });
  }, []);

  useEffect(() => {
    if (!user?.mustChangePassword) setPasswordReminder(null);
  }, [user]);

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

  const login = useCallback(async (studentId: string, password: string) => {
    const response = await api<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: { studentId, password },
    });
    setUser(response.user);
    setPasswordReminder(null);
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
      value={{ user, loading: user === undefined, refresh, login, logout, passwordReminder, remindPasswordChange }}
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
