"use client";

import { createContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useApiWithCompany } from '@/hooks/useApiWithCompany';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount?: number;
  spent?: number;
  received?: number;
  category?: string;
  selected_category_id?: string;
  plaid_account_id?: string;
  plaid_account_name?: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  plaid_account_id?: string | null;
  parent_id?: string | null;
}

interface Account {
  plaid_account_id: string | null;
  plaid_account_name: string;
  starting_balance: number | null;
  current_balance: number | null;
  last_synced: string | null;
  is_manual?: boolean;
}

interface AIContextType {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  currentAccount: Account | null;
}

export const AIContext = createContext<AIContextType>({
  transactions: [],
  categories: [],
  accounts: [],
  currentAccount: null,
});

export default function AIContextProvider({ children }: { children: ReactNode }) {
  const { hasCompanyContext, currentCompany } = useApiWithCompany();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!hasCompanyContext) return;

      const { data: txData } = await supabase
        .from('imported_transactions')
        .select('*')
        .eq('company_id', currentCompany!.id);
      setTransactions(txData || []);

      const { data: catData } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .eq('company_id', currentCompany!.id);
      setCategories(catData || []);

      const { data: accData } = await supabase
        .from('accounts')
        .select('*')
        .eq('company_id', currentCompany!.id);
      setAccounts(accData || []);
      if (accData && accData.length > 0) {
        setCurrentAccount(accData[0]);
      }
    };
    fetchData();
  }, [hasCompanyContext, currentCompany?.id]);

  return (
    <AIContext.Provider value={{ transactions, categories, accounts, currentAccount }}>
      {children}
    </AIContext.Provider>
  );
} 