"use client";

import { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useApiWithCompany } from '@/hooks/useApiWithCompany';

interface Category {
  id: string;
  name: string;
  type: string;
  company_id: string;
  parent_id?: string | null;
  subtype?: string;
  plaid_account_id?: string | null;
}

export type SharedContextType = {
  categories: Category[];
  refreshCategories: () => Promise<void>;
};

export const SharedContext = createContext<SharedContextType>({
  categories: [],
  refreshCategories: async () => {},
});

export default function SharedContextProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const { currentCompany, hasCompanyContext } = useApiWithCompany();

  const refreshCategories = useCallback(async () => {
    try {
      if (!hasCompanyContext || !currentCompany?.id) {
        setCategories([]);
        return;
      }

      const { data: catData, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('company_id', currentCompany.id)
        .order('parent_id', { ascending: true, nullsFirst: true })
        .order('type', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) {
        console.error('Error refreshing categories:', error);
        return;
      }
      
      setCategories(catData || []);
    } catch (err) {
      console.error('Error in refreshCategories:', err);
    }
  }, [hasCompanyContext, currentCompany?.id]);

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  return (
    <SharedContext.Provider value={{ categories, refreshCategories }}>
      {children}
    </SharedContext.Provider>
  );
} 