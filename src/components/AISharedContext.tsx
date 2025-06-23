"use client";

import { createContext, useEffect, ReactNode } from 'react';
import { useApiWithCompany } from '@/hooks/useApiWithCompany';
import { useAIStore } from '@/zustand/aiStore';

interface Category {
  id: string;
  name: string;
  type: string;
  company_id: string;
  parent_id?: string | null;
  subtype?: string;
  plaid_account_id?: string | null;
}

// Keep the context for backward compatibility but it will just be a passthrough
export type AISharedContextType = {
  categories: Category[];
  refreshCategories: () => Promise<void>;
};

// Legacy context for components that might still use it
export const AISharedContext = createContext<AISharedContextType>({
  categories: [],
  refreshCategories: async () => {},
});

// Hook that provides the same interface but uses Zustand
export function useAISharedContext() {
  const { currentCompany } = useApiWithCompany();
  const { categories, refreshCategories: refreshCategoriesFromStore } = useAIStore();
  
  const refreshCategories = async () => {
    if (currentCompany?.id) {
      await refreshCategoriesFromStore(currentCompany.id);
    }
  };
  
  return { categories, refreshCategories };
}

export default function AISharedContextProvider({ children }: { children: ReactNode }) {
  const { currentCompany, hasCompanyContext } = useApiWithCompany();
  const { refreshCategories, categories } = useAIStore();

  // Refresh categories when company changes
  useEffect(() => {
    if (hasCompanyContext && currentCompany?.id) {
      refreshCategories(currentCompany.id);
    }
  }, [currentCompany?.id, hasCompanyContext, refreshCategories]);

  // Provide context value using Zustand store data
  const contextValue: AISharedContextType = {
    categories,
    refreshCategories: async () => {
      if (currentCompany?.id) {
        await refreshCategories(currentCompany.id);
      }
    }
  };

  return (
    <AISharedContext.Provider value={contextValue}>
      {children}
    </AISharedContext.Provider>
  );
} 