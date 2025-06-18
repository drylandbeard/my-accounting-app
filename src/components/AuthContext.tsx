"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface User {
  id: string;
  email: string;
  role: "Owner" | "Member" | "Accountant";
}

export interface Company {
  id: string;
  name: string;
  description?: string;
}

export interface UserCompany {
  company_id: string;
  role: "Owner" | "Member" | "Accountant";
  companies: Company;
}

interface AuthContextType {
  user: User | null;
  companies: UserCompany[];
  currentCompany: Company | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setCompanies: (companies: UserCompany[]) => void;
  setCurrentCompany: (company: Company | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<UserCompany[]>([]);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored user session
    const storedUser = localStorage.getItem("auth_user");
    const storedCompanies = localStorage.getItem("auth_companies");
    const storedCurrentCompany = localStorage.getItem("auth_current_company");

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    if (storedCompanies) {
      setCompanies(JSON.parse(storedCompanies));
    }
    if (storedCurrentCompany) {
      setCurrentCompany(JSON.parse(storedCurrentCompany));
    }
    
    setIsLoading(false);
  }, []);

  // Store user data in localStorage when it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem("auth_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("auth_user");
    }
  }, [user]);

  useEffect(() => {
    if (companies.length > 0) {
      localStorage.setItem("auth_companies", JSON.stringify(companies));
    } else {
      localStorage.removeItem("auth_companies");
    }
  }, [companies]);

  useEffect(() => {
    if (currentCompany) {
      localStorage.setItem("auth_current_company", JSON.stringify(currentCompany));
    } else {
      localStorage.removeItem("auth_current_company");
    }
  }, [currentCompany]);

  const logout = () => {
    setUser(null);
    setCompanies([]);
    setCurrentCompany(null);
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_companies");
    localStorage.removeItem("auth_current_company");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        companies,
        currentCompany,
        isLoading,
        setUser,
        setCompanies,
        setCurrentCompany,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
} 