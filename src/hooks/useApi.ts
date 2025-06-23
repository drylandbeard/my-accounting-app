"use client";

import { useAuthStore } from "@/zustand/authStore";
import { api } from "@/lib/api";

/**
 * Custom hook for making company-scoped API requests
 */
export function useApi() {
  const { user, currentCompany } = useAuthStore();

  const companyApi = {
    get: (url: string, options?: RequestInit) => {
      if (!user || !currentCompany) {
        throw new Error("User not authenticated or no company selected");
      }
      return api.get(url, options);
    },

    post: (url: string, data: unknown, options?: RequestInit) => {
      if (!user || !currentCompany) {
        throw new Error("User not authenticated or no company selected");
      }
      return api.post(url, data, options);
    },

    put: (url: string, data: unknown, options?: RequestInit) => {
      if (!user || !currentCompany) {
        throw new Error("User not authenticated or no company selected");
      }
      return api.put(url, data, options);
    },

    delete: (url: string, options?: RequestInit) => {
      if (!user || !currentCompany) {
        throw new Error("User not authenticated or no company selected");
      }
      return api.delete(url, options);
    },
  };

  return {
    api: companyApi,
    hasCompanyContext: !!(user && currentCompany),
    currentCompany,
    user,
  };
} 