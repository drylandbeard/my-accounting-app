'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useApiWithCompany } from '@/hooks/useApiWithCompany';

type Payee = {
  id: string;
  name: string;
  company_id: string;
};

type Account = {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  company_id: string;
};

type JournalEntry = {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  transaction_id: string;
  chart_account_id: string;
  company_id: string;
  transactions?: {
    payee_id?: string;
  };
  [key: string]: unknown; // Allow dynamic property access for additional columns
};

export default function JournalTablePage() {
  const { hasCompanyContext, currentCompany } = useApiWithCompany();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJournalEntries();
    fetchAccounts();
    fetchPayees();
  }, [currentCompany?.id]);

  const fetchJournalEntries = async () => {
    if (!hasCompanyContext) return;
    
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('journal')
        .select(`
          *,
          transactions!inner(payee_id)
        `)
        .eq('company_id', currentCompany?.id)
        .order('date', { ascending: false });
      if (error) throw error;
      setEntries(data || []);
    } catch {
      setError('Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    if (!hasCompanyContext) return;
    
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('company_id', currentCompany?.id);
    if (!error) setAccounts(data || []);
  };

  const fetchPayees = async () => {
    if (!hasCompanyContext) return;
    
    const { data, error } = await supabase
      .from('payees')
      .select('*')
      .eq('company_id', currentCompany?.id)
      .order('name');
    if (!error) setPayees(data || []);
  };

  function getAccountName(id: string) {
    const account = accounts.find(a => a.id === id);
    return account ? account.name : id;
  }

  function getPayeeName(id: string) {
    if (!id) return '';
    const payee = payees.find(p => p.id === id);
    return payee ? payee.name : '';
  }

  // Define specific column order for the journal table
  const orderedColumns = [
    { key: 'id', label: 'ID' },
    { key: 'date', label: 'Date' },
    { key: 'description', label: 'Description' },
    { key: 'payee', label: 'Payee', isCustom: true },
    { key: 'debit', label: 'Debit' },
    { key: 'credit', label: 'Credit' }
  ];

  // Get all available columns from entries to include any additional fields
  const availableColumns = Array.from(
    entries.reduce((cols, entry) => {
      Object.keys(entry).forEach((k) => cols.add(k));
      return cols;
    }, new Set<string>())
  ).filter((col): col is string => col !== 'chart_account_id' && col !== 'payee_id' && col !== 'transactions');

  // Combine ordered columns with any additional columns not in our predefined list, then add category at the end
  const finalColumns = [
    ...orderedColumns,
    ...availableColumns
      .filter(col => !orderedColumns.some(ordCol => ordCol.key === col))
      .map(col => ({ key: col, label: col.toUpperCase() })),
    { key: 'category', label: 'Category Name', isCustom: true }
  ];

  // Check if user has company context
  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-sm text-yellow-700">
            Please select a company from the dropdown in the navigation bar to view journal entries.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : !entries.length ? (
        <div>No journal entries found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border">
            <thead>
              <tr>
                {finalColumns.map((col) => (
                  <th key={col.key} className="border px-2 py-1 text-left uppercase tracking-wider">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={String(entry.id)}>
                  {finalColumns.map((col) => (
                    <td key={col.key} className="border px-2 py-1">
                      {col.key === 'payee' ? (
                        getPayeeName(entry.transactions?.payee_id || '')
                      ) : col.key === 'category' ? (
                        getAccountName(entry.chart_account_id)
                      ) : (
                        String(entry[col.key] ?? '')
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 