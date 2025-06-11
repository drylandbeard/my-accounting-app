"use client";

import React, { useState } from "react";
import { useAuth } from "./AuthContext";
import AuthForm from "./AuthForm";
import NavBar from "./NavBar";
import AISidePanel from "./AISidePanel";
import { SelectedToAddProvider } from "./SelectedToAddContext";
import AIContextProvider from "./AIContextProvider";

export default function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);

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
        <NavBar />
        <div className="flex" style={{ height: 'calc(100vh - 4rem)' }}>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
          {isAIPanelOpen && (
            <AISidePanel isOpen={isAIPanelOpen} setIsOpen={setIsAIPanelOpen} />
          )}
        </div>
        {/* Always render the panel for floating button when closed */}
        {!isAIPanelOpen && (
          <AISidePanel isOpen={isAIPanelOpen} setIsOpen={setIsAIPanelOpen} />
        )}
      </AIContextProvider>
    </SelectedToAddProvider>
  );
} 