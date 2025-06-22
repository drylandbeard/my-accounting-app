"use client";

import { useEffect } from "react";
import { initializeAuth } from "@/zustand/authStore";

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * AuthProvider component that initializes authentication state on app startup
 * This replaces the old AuthContext provider
 */
export function AuthProvider({ children }: AuthProviderProps) {
  useEffect(() => {
    // Initialize auth state when app starts
    initializeAuth();
  }, []);

  return <>{children}</>;
} 