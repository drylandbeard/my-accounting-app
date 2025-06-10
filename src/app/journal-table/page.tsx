'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function JournalTablePage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    fetchJournalEntries();
    fetchAccounts();
  }, []);

  const fetchJournalEntries = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('journal')
        .select('*')
        .order('date', { ascending: false });
      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      setError('Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    const { data, error } = await supabase.from('chart_of_accounts').select('*');
    if (!error) setAccounts(data || []);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/sync-journal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      await fetchJournalEntries();
    } catch (err: any) {
      setSyncError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  function getAccountName(id: string) {
    const account = accounts.find(a => a.id === id);
    return account ? account.name : id;
  }

  // Get all unique keys from the entries for table headers, but exclude chart_account_id
  const columns = Array.from(
    entries.reduce((cols, entry) => {
      Object.keys(entry).forEach((k) => cols.add(k));
      return cols;
    }, new Set<string>())
  ).filter((col): col is string => col !== 'chart_account_id');

  return (
    <div className="p-4">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="mb-4 mr-2 px-4 py-1.5 bg-gray-800 text-white text-sm rounded hover:bg-black disabled:opacity-50"
      >
        {syncing ? 'Syncing...' : 'Sync Journal'}
      </button>
      {syncError && <div className="text-red-600 mb-2">{syncError}</div>}
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
                {columns.map((col: string) => (
                  <th key={col} className="border px-2 py-1 text-left uppercase tracking-wider">{col}</th>
                ))}
                <th className="border px-2 py-1 text-left uppercase tracking-wider">Category Name</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={String(entry.id)}>
                  {columns.map((col: string) => (
                    <td key={col} className="border px-2 py-1">{String(entry[col] ?? '')}</td>
                  ))}
                  <td className="border px-2 py-1">{getAccountName(entry.chart_account_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
} 