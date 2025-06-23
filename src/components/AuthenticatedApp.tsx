"use client";

import React, { useState } from "react";
import { useAuthStore } from "@/zustand/authStore";
import AuthForm from "./AuthForm";
import NavBar from "./NavBar";
import AISidePanel from "./AISidePanel";
import { SelectedToAddProvider } from "./SelectedToAddContext";

import { usePathname } from "next/navigation";

export default function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const pathname = usePathname();
  
  // Check if we're on the homepage
  const isHomepage = pathname === "/";
  
  // Pages that should be accessible without authentication
  const publicPages = [
    "/verify-email",
    "/accept-invitation",
    // Auth API routes are handled separately by middleware, but included for completeness
    "/api/auth/signup",
    "/api/auth/signin", 
    "/api/auth/verify-email",
    "/api/auth/verify-code",
    "/api/auth/resend-verification",
    "/api/accept-invitation"
  ];
  const isPublicPage = publicPages.some(page => pathname.startsWith(page));

  // Show login form if not authenticated (but allow access to public pages)
  if (!isAuthenticated && !isPublicPage) {
    return <AuthForm />;
  }

  // If user is not authenticated but on a public page, show the page without auth wrapper
  if (!isAuthenticated && isPublicPage) {
    return <>{children}</>;
  }

  // Show authenticated app
  return (
    <SelectedToAddProvider>
      {/* Only show navbar if not on homepage */}
      {!isHomepage && <NavBar onToggleAI={() => setIsAIPanelOpen(!isAIPanelOpen)} />}
      <div className={`flex ${isHomepage ? 'min-h-screen' : ''}`} style={isHomepage ? {} : { height: 'calc(100vh - 2.7rem)' }}>
        <main className={`flex-1 ${isHomepage ? '' : 'overflow-auto'}`}>
          {children}
        </main>
        {/* 
          The previous conditional rendering of AISidePanel caused it to unmount and remount,
          losing its internal state (like chat history). 
          By rendering a single instance, the state is preserved across open/close actions.
          The component itself handles whether to show the full panel or just the "open" button.
        */}
        {!isHomepage && <AISidePanel isOpen={isAIPanelOpen} setIsOpen={setIsAIPanelOpen} />}
      </div>
    </SelectedToAddProvider>
  );
} 