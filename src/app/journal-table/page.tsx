'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Transaction = {
  id: string;
  date: string;
  description: string;
  debit_account_id: string;
  credit_account_id: string;
  amount: number;
  spent: number;
  received: number;
};

type Category = {
  id: string;
  name: string;
};

export default function RegisterPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const fetchTransactions = async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
      if (error) {
        console.error('Error fetching transactions:', error);
        return;
      }
      setTransactions(data || []);
    };
    fetchTransactions();
  }, []);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('id, name');
      if (error) {
        console.error('Error fetching categories:', error);
        return;
      }
      setCategories(data || []);
    };
    fetchCategories();
  }, []);

  const getCategoryName = (id: string) => {
    return categories.find(c => c.id === id)?.name || id;
  };

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">General Ledger Register</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
              <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
              <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
              <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Debit Category</th>
              <th className="px-6 py-3 border-b text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {transactions.flatMap(tx => {
              const amount = Number(tx.spent) > 0 ? Number(tx.spent) : Number(tx.received);
              return [
                // Debit side
                <tr key={tx.id + '-debit'} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(tx.date)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tx.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{amount ? `$${amount.toFixed(2)}` : '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">-</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getCategoryName(tx.debit_account_id)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                </tr>,
                // Credit side
                <tr key={tx.id + '-credit'} className="hover:bg-gray-50 bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(tx.date)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{tx.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">-</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{amount ? `$${amount.toFixed(2)}` : '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">-</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getCategoryName(tx.credit_account_id)}</td>
                </tr>
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
} 