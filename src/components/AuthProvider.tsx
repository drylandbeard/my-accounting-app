"use client";

import React, { useEffect, useState } from "react";
import { initializeAuth } from "@/zustand/authStore";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize auth state on mount
    const init = async () => {
      await initializeAuth();
      setIsInitialized(true);
    };
    
    init();
  }, []);

  // Don't render children until auth is initialized
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return <>{children}</>;
} 