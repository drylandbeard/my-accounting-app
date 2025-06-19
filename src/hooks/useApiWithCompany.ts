"use client";

import { useAuth } from "@/components/AuthContext";

/**
 * Custom hook for making API requests with company context
 */
export function useApiWithCompany() {
  const { user, currentCompany } = useAuth();

  /**
   * Make a fetch request with company and user context automatically included
   */
  const fetchWithCompany = async (url: string, options: RequestInit = {}) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    if (!currentCompany) {
      throw new Error("No company selected. Please select a company first.");
    }

    const headers = {
      "Content-Type": "application/json",
      "x-user-id": user.id,
      "x-company-id": currentCompany.id,
      ...options.headers,
    };

    return fetch(url, {
      ...options,
      headers,
    });
  };

  /**
   * Make a POST request with company context
   */
  const postWithCompany = async (url: string, data?: unknown) => {
    return fetchWithCompany(url, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  };

  /**
   * Make a GET request with company context
   */
  const getWithCompany = async (url: string) => {
    return fetchWithCompany(url, {
      method: "GET",
    });
  };

  return {
    fetchWithCompany,
    postWithCompany,
    getWithCompany,
    hasCompanyContext: !!(user && currentCompany),
    currentCompany,
    user,
  };
} 