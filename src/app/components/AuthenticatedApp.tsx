"use client";

import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import AuthForm from "./AuthForm";
import NavBar from "./NavBar";
import AISidePanel from "./AISidePanel";
import { SelectedToAddProvider } from "./SelectedToAddContext";
import AIContextProvider from "./AIContextProvider";
import { usePathname } from "next/navigation";

export default function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const pathname = usePathname();
  
  // Check if we're on the homepage
  const isHomepage = pathname === "/";

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-600">Loading...</div>
      </div>
    );
  }

  // Show login form if not authenticated
  if (!user) {
    return <AuthForm />;
  }

  // Show authenticated app
  return (
    <SelectedToAddProvider>
      <AIContextProvider>
        {/* Only show navbar if not on homepage */}
        {!isHomepage && <NavBar />}
        <div className={`flex ${isHomepage ? 'min-h-screen' : ''}`} style={isHomepage ? {} : { height: 'calc(100vh - 4rem)' }}>
          <main className={`flex-1 ${isHomepage ? '' : 'overflow-auto'}`}>
            {children}
          </main>
          {isAIPanelOpen && !isHomepage && (
            <AISidePanel isOpen={isAIPanelOpen} setIsOpen={setIsAIPanelOpen} />
          )}
        </div>
        {/* Always render the panel for floating button when closed, but not on homepage */}
        {!isAIPanelOpen && !isHomepage && (
          <AISidePanel isOpen={isAIPanelOpen} setIsOpen={setIsAIPanelOpen} />
        )}
      </AIContextProvider>
    </SelectedToAddProvider>
  );
} 