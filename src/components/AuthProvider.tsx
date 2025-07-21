"use client";

import React, { useEffect, useState } from "react";
import { initializeAuth } from "@/zustand/authStore";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const pathname = usePathname();

  // Define public pages that don't need auth initialization
  const publicPages = [
    "/verify-email",
    "/accept-invitation",
    "/accountant/accept-invite"
  ];
  
  // Check if current page is public (auth pages don't need token validation)
  const isPublicPage = publicPages.some(page => pathname.startsWith(page));

  useEffect(() => {
    // Initialize auth state on mount
    const init = async () => {
      // For public pages, skip auth initialization entirely to prevent unnecessary API calls
      if (isPublicPage) {
        setIsInitialized(true);
        return;
      }

      // For homepage and protected pages, initialize auth to check current state
      await initializeAuth();
      setIsInitialized(true);
    };
    
    init();
  }, [pathname, isPublicPage]);

  // Don't render children until auth is initialized
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
} 