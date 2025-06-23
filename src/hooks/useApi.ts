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
      return api.company.get(url, currentCompany.id, user.id, options);
    },

    post: (url: string, data: unknown, options?: RequestInit) => {
      if (!user || !currentCompany) {
        throw new Error("User not authenticated or no company selected");
      }
      return api.company.post(url, data, currentCompany.id, user.id, options);
    },

    put: (url: string, data: unknown, options?: RequestInit) => {
      if (!user || !currentCompany) {
        throw new Error("User not authenticated or no company selected");
      }
      return api.company.put(url, data, currentCompany.id, user.id, options);
    },

    delete: (url: string, options?: RequestInit) => {
      if (!user || !currentCompany) {
        throw new Error("User not authenticated or no company selected");
      }
      return api.company.delete(url, currentCompany.id, user.id, options);
    },
  };

  return {
    api: companyApi,
    hasCompanyContext: !!(user && currentCompany),
    currentCompany,
    user,
  };
} 