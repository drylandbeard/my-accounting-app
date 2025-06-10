"use client";

import React from "react";
import { useAuth } from "./AuthContext";
import AuthForm from "./AuthForm";
import NavBar from "./NavBar";
import AISidePanel from "./AISidePanel";
import { SelectedToAddProvider } from "./SelectedToAddContext";
import AIContextProvider from "./AIContextProvider";

export default function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

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
        <main className="relative">
          {children}
        </main>
        <AISidePanel />
      </AIContextProvider>
    </SelectedToAddProvider>
  );
} 