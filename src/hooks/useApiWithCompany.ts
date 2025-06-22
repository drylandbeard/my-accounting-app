"use client";

import { useAuthStore, createAuthenticatedFetch } from "@/zustand/authStore";

/**
 * Custom hook for making API requests with company context and JWT authentication
 */
export function useApiWithCompany() {
  const { user, currentCompany, isAuthenticated } = useAuthStore();
  const authenticatedFetch = createAuthenticatedFetch();

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
      "x-user-id": user.id,
      "x-company-id": currentCompany.id,
      ...(options.headers as Record<string, string> || {}),
    };

    return authenticatedFetch(url, {
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

  /**
   * Make an authenticated request without company context (for user-level operations)
   */
  const fetchAuthenticated = async (url: string, options: RequestInit = {}) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    const headers = {
      "x-user-id": user.id,
      ...(options.headers as Record<string, string> || {}),
    };

    return authenticatedFetch(url, {
      ...options,
      headers,
    });
  };

  return {
    fetchWithCompany,
    postWithCompany,
    getWithCompany,
    fetchAuthenticated,
    hasCompanyContext: !!(user && currentCompany),
    isAuthenticated,
    currentCompany,
    user,
  };
} 