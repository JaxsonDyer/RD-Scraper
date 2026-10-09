'use client';
import { createContext, useContext, type ReactNode } from 'react';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

type Auth = { user: AuthUser | null; isAdmin: boolean; configured: boolean };
const AuthContext = createContext<Auth>({ user: null, isAdmin: false, configured: false });
export function AuthProvider({ value, children }: { value: Auth; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
