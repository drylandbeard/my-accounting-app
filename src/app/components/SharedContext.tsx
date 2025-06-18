"use client";

import { createContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';

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
  categoriesVersion: number;
};

export const SharedContext = createContext<SharedContextType>({
  categories: [],
  refreshCategories: async () => {},
  categoriesVersion: 0,
});

export default function SharedContextProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesVersion, setCategoriesVersion] = useState(0);

  const refreshCategories = async () => {
    const { data: catData } = await supabase
      .from('chart_of_accounts')
      .select('*');
    setCategories(catData || []);
    setCategoriesVersion(prev => prev + 1);
    

  };

  useEffect(() => {
    refreshCategories();
  }, []);

  return (
    <SharedContext.Provider value={{ categories, refreshCategories, categoriesVersion }}>
      {children}
    </SharedContext.Provider>
  );
} 