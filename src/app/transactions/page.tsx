/* eslint-disable @typescript-eslint/no-unused-vars */
'use client'

import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { supabase } from '../../lib/supabaseClient'
import dynamic from 'next/dynamic'
import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useApiWithCompany } from '@/hooks/useApiWithCompany'

type Transaction = {
  id: string
  date: string
  description: string
  amount?: number
  plaid_account_id: string | null
  plaid_account_name: string | null
  selected_category_id?: string
  corresponding_category_id?: string
  spent?: number
  received?: number
  payee_id?: string
  company_id?: string
}

type Category = {
  id: string
  name: string
  type: string
  subtype?: string
  plaid_account_id?: string | null
}

type Payee = {
  id: string
  name: string
  company_id: string
}

type Account = {
  plaid_account_id: string | null
  name: string // Database column is 'name'
  starting_balance: number | null
  current_balance: number | null
  last_synced: string | null
  is_manual?: boolean
  plaid_account_name?: string // Add missing property
}

type ImportModalState = {
  isOpen: boolean
  step: 'upload' | 'review'
  selectedAccount: Account | null
  csvData: Transaction[]
  isLoading: boolean
  error: string | null
  selectedTransactions: Set<string>
}

type CSVRow = {
  Date: string
  Description: string
  Amount: string
}

type SortConfig = {
  key: 'date' | 'description' | 'amount' | null;
  direction: 'asc' | 'desc';
}

type JournalEntry = {
  date: string
  description: string
  entries: {
    account_id: string
    amount: number
    type: 'debit' | 'credit'
  }[]
}

type SelectOption = {
  value: string;
  label: string;
};

const Select = dynamic(() => import('react-select'), { ssr: false })

export default function Page() {
  const { getWithCompany, postWithCompany, hasCompanyContext, currentCompany } = useApiWithCompany()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [payees, setPayees] = useState<Payee[]>([])
  const [importedTransactions, setImportedTransactions] = useState<Transaction[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  // Removed unused searchQuery state
  const [toAddSearchQuery, setToAddSearchQuery] = useState('')
  const [addedSearchQuery, setAddedSearchQuery] = useState('')
  const [manualDate, setManualDate] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualCategoryId, setManualCategoryId] = useState('')

  // Add selected categories state
  const [selectedCategories, setSelectedCategories] = useState<{ [txId: string]: string }>({});
  
  // Add selected payees state  
  const [selectedPayees, setSelectedPayees] = useState<{ [txId: string]: string }>({});

  // Add missing state for multi-select checkboxes
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [selectedAdded, setSelectedAdded] = useState<Set<string>>(new Set());

  // Add sorting state
  const [toAddSortConfig, setToAddSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [addedSortConfig, setAddedSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });

  // Add import modal state
  const [importModal, setImportModal] = useState<ImportModalState>({
    isOpen: false,
    step: 'upload',
    selectedAccount: null,
    csvData: [],
    isLoading: false,
    error: null,
    selectedTransactions: new Set()
  });

  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    transaction: Transaction | null;
  }>({
    isOpen: false,
    transaction: null
  });

  // Add new state for account edit modal
  const [accountEditModal, setAccountEditModal] = useState<{
    isOpen: boolean;
    account: Account | null;
    newName: string;
  }>({
    isOpen: false,
    account: null,
    newName: ''
  });

  // Add new state for category creation modal
  const [newCategoryModal, setNewCategoryModal] = useState<{
    isOpen: boolean;
    name: string;
    type: string;
    parent_id: string | null;
    transactionId: string | null;
  }>({
    isOpen: false,
    name: '',
    type: 'Expense',
    parent_id: null,
    transactionId: null
  });

  // Add new state for payee creation modal
  const [newPayeeModal, setNewPayeeModal] = useState<{
    isOpen: boolean;
    name: string;
    transactionId: string | null;
  }>({
    isOpen: false,
    name: '',
    transactionId: null
  });

  // Add new state for manual account creation modal
  const [manualAccountModal, setManualAccountModal] = useState<{
    isOpen: boolean;
    name: string;
    type: string;
    startingBalance: string;
  }>({
    isOpen: false,
    name: '',
    type: 'Asset',
    startingBalance: '0'
  });

  // Add new state for account names modal
  const [accountNamesModal, setAccountNamesModal] = useState<{
    isOpen: boolean;
    accounts: { id: string; name: string }[];
    accountToDelete: string | null;
    deleteConfirmation: string;
  }>({
    isOpen: false,
    accounts: [],
    accountToDelete: null,
    deleteConfirmation: ''
  });

  // Add journal entry modal state
  const [journalEntryModal, setJournalEntryModal] = useState<{
    isOpen: boolean;
    date: string;
    description: string;
    entries: {
      account_id: string;
      amount: number;
      type: 'debit' | 'credit';
    }[];
  }>({
    isOpen: false,
    date: new Date().toISOString().split('T')[0],
    description: '',
    entries: []
  });

  // Add state for past journal entries modal
  const [pastJournalEntriesModal, setPastJournalEntriesModal] = useState<{
    isOpen: boolean;
    entries: {
      id: string;
      date: string;
      description: string;
      transactions: {
        account_id: string;
        account_name: string;
        amount: number;
        type: 'debit' | 'credit';
      }[];
    }[];
  }>({
    isOpen: false,
    entries: []
  });

  // Add state for editing past journal entries
  const [editJournalEntryModal, setEditJournalEntryModal] = useState<{
    isOpen: boolean;
    entry: {
      id: string;
      date: string;
      description: string;
      transactions: {
        account_id: string;
        account_name: string;
        amount: number;
        type: 'debit' | 'credit';
      }[];
    } | null;
  }>({
    isOpen: false,
    entry: null
  });

  // Add state for past journal entries search
  const [pastJournalEntriesSearch, setPastJournalEntriesSearch] = useState('');

  // Add function to filter past journal entries
  const filteredPastJournalEntries = pastJournalEntriesModal.entries.filter(entry => {
    const searchLower = pastJournalEntriesSearch.toLowerCase();
    
    // Search in date
    if (entry.date.toLowerCase().includes(searchLower)) return true;
    
    // Search in description
    if (entry.description.toLowerCase().includes(searchLower)) return true;
    
    // Search in account names and amounts
    return entry.transactions.some(tx => 
      tx.account_name.toLowerCase().includes(searchLower) ||
      tx.amount.toString().includes(searchLower)
    );
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const formatSyncTime = (date: Date) => {
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const year = date.getFullYear()
    const time = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    return `${month}-${day}-${year} ${time}`
  }

  const formatLastSyncTime = (lastSynced: string | null) => {
    if (!lastSynced) return 'Never';
    const date = new Date(lastSynced);
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const year = date.getFullYear()
    const time = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${month}-${day}-${year} ${time}`
  };

  // Add sync function
  const syncTransactions = async () => {
    setIsSyncing(true);
    setSyncError(null);
    setNotification(null);
    try {
      if (!hasCompanyContext) {
        throw new Error('No company selected. Please select a company first.');
      }
      
      // Get all connected Plaid accounts for current company
      const { data: plaidItems } = await supabase
        .from('plaid_items')
        .select('access_token, item_id')
        .eq('company_id', currentCompany!.id);

      if (!plaidItems || plaidItems.length === 0) {
        throw new Error('No connected Plaid accounts found');
      }

      // Sync each item
      for (const item of plaidItems) {
        // Get all accounts for this item
        const { data: itemAccounts } = await supabase
          .from('accounts')
          .select('plaid_account_id')
          .eq('plaid_item_id', item.item_id)
          .eq('company_id', currentCompany!.id);

        if (!itemAccounts || itemAccounts.length === 0) {
          console.log(`No accounts found for item ${item.item_id}`);
          continue;
        }

        const accountIds = itemAccounts.map(acc => acc.plaid_account_id);

        // Find the latest transaction date for this item's accounts
        const { data: latestTransaction } = await supabase
          .from('imported_transactions')
          .select('date')
          .eq('company_id', currentCompany!.id)
          .in('plaid_account_id', accountIds)
          .order('date', { ascending: false })
          .limit(1)
          .single();

        // Use the latest transaction date, or default to 30 days ago if no transactions exist
        let startDate: string;
        if (latestTransaction) {
          startDate = latestTransaction.date;
        } else {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          startDate = thirtyDaysAgo.toISOString().split('T')[0];
        }

        const response = await postWithCompany('/api/get-transactions', {
          access_token: item.access_token,
          item_id: item.item_id,
          start_date: startDate,
          selected_account_ids: accountIds
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to sync transactions');
        }
      }

      // Refresh the transactions list
      await refreshAll();
      const now = new Date();
      setNotification({ type: 'success', message: `Sync complete! Last synced: ${formatSyncTime(now)}` });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sync transactions';
      setSyncError(errorMessage);
      setNotification({ type: 'error', message: errorMessage });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  // 1️⃣ Plaid Link Token
  useEffect(() => {
    const createLinkToken = async () => {
      if (!hasCompanyContext) {
        console.log('No company context available for Plaid integration')
        return
      }
      
      try {
        const res = await getWithCompany('/api/1-create-link-token')
        const data = await res.json()
        if (res.ok) {
          setLinkToken(data.link_token)
        } else {
          console.error('Failed to create link token:', data.error)
        }
      } catch (error) {
        console.error('Error creating link token:', error)
      }
    }
    createLinkToken()
  }, []) // Removed hasCompanyContext and getWithCompany from dependencies to prevent infinite re-renders

  // Update the account selection modal state to include dates
  const [accountSelectionModal, setAccountSelectionModal] = useState<{
    isOpen: boolean;
    accounts: {
      id: string;
      name: string;
      selected: boolean;
      access_token: string;
      item_id: string;
      startDate: string;
    }[];
  }>({
    isOpen: false,
    accounts: []
  });

  // Update the Plaid success handler
  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess: async (public_token, metadata) => {
      try {
        // First, get the access token
        const res = await postWithCompany('/api/2-exchange-public-token', { public_token });

        const data = await res.json();

        // Show account selection modal with all available accounts
        setAccountSelectionModal({
          isOpen: true,
          accounts: metadata.accounts.map((account: { id: string; name?: string }) => ({
            id: account.id,
            name: account.name || 'new account',
            selected: true, // Default to selected
            access_token: data.access_token,
            item_id: data.item_id,
            startDate: new Date().toISOString().split('T')[0] // Default to today
          }))
        });
      } catch (error) {
        console.error('Error in Plaid success handler:', error);
        setNotification({ 
          type: 'error', 
          message: 'Failed to connect accounts. Please try again.' 
        });
      }
    },
  });

  const handleAccountAndDateSelection = async () => {
    try {
      const selectedAccounts = accountSelectionModal.accounts.filter(acc => acc.selected);

      if (selectedAccounts.length === 0) {
        setNotification({ 
          type: 'error', 
          message: 'Please select at least one account' 
        });
        return;
      }

      // Validate dates aren't in the future
      const today = new Date();
      today.setHours(23, 59, 59, 999); // Set to end of today to allow today's date
      
      for (const account of selectedAccounts) {
        // Parse date in local timezone to avoid timezone issues
        const [year, month, day] = account.startDate.split('-').map(Number);
        const selectedDate = new Date(year, month - 1, day);
        if (selectedDate > today) {
          setNotification({ 
            type: 'error', 
            message: 'Start date cannot be in the future' 
          });
          return;
        }
      }

      setImportProgress({
        isImporting: true,
        currentStep: 'Starting import...',
        progress: 0,
        totalSteps: 3
      });

      const { access_token, item_id } = selectedAccounts[0];
      
      if (!access_token || !item_id) {
        throw new Error('Missing access token or item ID. Please reconnect your account.');
      }

      // Helper function for API calls with error handling
      const callAPI = async (step: string, url: string, payload: Record<string, unknown>) => {
        const response = await postWithCompany(url, payload);

        const data = await response.json();
        
        if (!response.ok) {
          const errorMessage = data?.error || data?.message || `HTTP ${response.status}`;
          throw new Error(`${step} failed: ${errorMessage}`);
        }

        return data;
      };

      // Step 3: Store accounts in database
      setImportProgress(prev => ({
        ...prev,
        currentStep: 'Storing account details...',
        progress: 1
      }));

      const selectedAccountIds = selectedAccounts.map(acc => acc.id);
      const accountsResult = await callAPI(
        'Step 3',
        '/api/3-store-plaid-accounts-as-accounts',
        { 
          accessToken: access_token, 
          itemId: item_id,
          selectedAccountIds: selectedAccountIds
        }
      );

      // Step 4: Create chart of accounts entries
      setImportProgress(prev => ({
        ...prev,
        currentStep: 'Setting up account categories...',
        progress: 2
      }));

      await callAPI(
        'Step 4',
        '/api/4-store-plaid-accounts-as-categories',
        { 
          accessToken: access_token, 
          itemId: item_id,
          selectedAccountIds: selectedAccountIds
        }
      );

      // Step 5: Import transactions
      setImportProgress(prev => ({
        ...prev,
        currentStep: 'Importing transactions...',
        progress: 3
      }));

      // Create account-to-date mapping for API
      const accountDateMap = selectedAccounts.reduce((map, account) => {
        map[account.id] = account.startDate;
        return map;
      }, {} as Record<string, string>);

      const transactionsResult = await callAPI(
        'Step 5',
        '/api/5-import-transactions-to-categorize',
        {
          accessToken: access_token,
          itemId: item_id,
          accountDateMap: accountDateMap,
          selectedAccountIds: selectedAccountIds
        }
      );

      // Complete the process
      setAccountSelectionModal({ isOpen: false, accounts: [] });
      await refreshAll();
      
      const totalAccounts = accountsResult.count || 0;
      const totalTransactions = transactionsResult.count || 0;
      
      setNotification({ 
        type: 'success', 
        message: `Successfully linked ${totalAccounts} accounts and imported ${totalTransactions} transactions with account-specific start dates!` 
      });

    } catch (error) {
      let errorMessage = 'Failed to link accounts. ';
      
      if (error instanceof Error) {
        if (error.message.includes('Step 3')) {
          errorMessage += 'Could not save account information. ';
        } else if (error.message.includes('Step 4')) {
          errorMessage += 'Could not set up account categories. ';
        } else if (error.message.includes('Step 5')) {
          errorMessage += 'Could not import transactions. ';
        }
        errorMessage += error.message || 'Please try again.';
      } else {
        errorMessage += 'Please try again.';
      }
      
      setNotification({ type: 'error', message: errorMessage });
      
    } finally {
      setImportProgress({
        isImporting: false,
        currentStep: '',
        progress: 0,
        totalSteps: 0
      });
    }
  };

  // Add new state for import progress
  const [importProgress, setImportProgress] = useState<{
    isImporting: boolean;
    currentStep: string;
    progress: number;
    totalSteps: number;
  }>({
    isImporting: false,
    currentStep: '',
    progress: 0,
    totalSteps: 0
  });

  // Add tab state for switching between To Add and Added sections
  const [activeTab, setActiveTab] = useState<'toAdd' | 'added'>('toAdd');

  // Add function to handle date selection and start import
  const handleDateSelection = async () => {
    try {
      // Get selected accounts
      const selectedAccounts = accountSelectionModal.accounts
        .filter(acc => acc.selected);

      if (selectedAccounts.length === 0) {
        setNotification({ 
          type: 'error', 
          message: 'Please select at least one account' 
        });
        return;
      }

      // Validate dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      for (const account of selectedAccounts) {
        // Parse date in local timezone to avoid timezone issues
        const [year, month, day] = account.startDate.split('-').map(Number);
        const selectedDate = new Date(year, month - 1, day);
        if (selectedDate > today) {
          setNotification({ 
            type: 'error', 
            message: 'Start date cannot be in the future' 
          });
          return;
        }
      }

      // Set initial progress state
      setImportProgress({
        isImporting: true,
        currentStep: 'Starting import...',
        progress: 0,
        totalSteps: selectedAccounts.length
      });

      // Import each selected account with its selected start date
      for (let i = 0; i < selectedAccounts.length; i++) {
        const account = selectedAccounts[i];
        
        // Update progress
        setImportProgress(prev => ({
          ...prev,
          currentStep: `Importing transactions for ${account.name}...`,
          progress: i + 1
        }));

        const response = await fetch('/api/get-transactions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            access_token: account.access_token,
            item_id: account.item_id,
            account_id: account.id,
            start_date: account.startDate
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to sync transactions');
        }
      }

      // Update progress for final step
      setImportProgress(prev => ({
        ...prev,
        currentStep: 'Finalizing import...',
        progress: prev.totalSteps
      }));

      // Close modal and refresh
      setAccountSelectionModal({ isOpen: false, accounts: [] });
      await refreshAll();
      setNotification({ 
        type: 'success', 
        message: 'Accounts linked and transactions imported successfully' 
      });

    } catch (error) {
      console.error('Error in handleDateSelection:', error);
      setNotification({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to link accounts' 
      });
    } finally {
      // Reset progress state
      setImportProgress({
        isImporting: false,
        currentStep: '',
        progress: 0,
        totalSteps: 0
      });
    }
  };

  // 2️⃣ Supabase Fetching
  const fetchImportedTransactions = async () => {
    if (!hasCompanyContext) return;
    
    const { data } = await supabase
      .from('imported_transactions')
      .select('*')
      .eq('company_id', currentCompany?.id)
      .neq('plaid_account_name', null)
    setImportedTransactions(data || [])
  }

  const fetchConfirmedTransactions = async () => {
    if (!hasCompanyContext) return;
    
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('company_id', currentCompany?.id)
      .neq('plaid_account_name', null)
    setTransactions(data || [])
  }

  const fetchCategories = async () => {
    if (!hasCompanyContext) return;
    
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('company_id', currentCompany?.id)
    setCategories(data || [])
  }

  const fetchPayees = async () => {
    if (!hasCompanyContext) return;
    
    const { data } = await supabase
      .from('payees')
      .select('*')
      .eq('company_id', currentCompany?.id)
      .order('name')
    setPayees(data || [])
  }

  const fetchAccounts = async () => {
    if (!hasCompanyContext) return;
    
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('company_id', currentCompany?.id)
    setAccounts(data || [])
    if (data && data.length > 0 && !selectedAccountId) {
      setSelectedAccountId(data[0].plaid_account_id)
    }
  }

  const refreshAll = () => {
    fetchImportedTransactions()
    fetchConfirmedTransactions()
    fetchCategories()
    fetchPayees()
    fetchAccounts()
  }

  useEffect(() => {
    refreshAll()
  }, [currentCompany?.id]) // Refresh when company changes

  // 3️⃣ Actions
  const addTransaction = async (tx: Transaction, selectedCategoryId: string, selectedPayeeId?: string) => {
    const category = categories.find(c => c.id === selectedCategoryId);
    if (!category) {
      alert('Selected category not found. Please try again.');
      return;
    }

    // Payee is optional - only validate if provided
    if (selectedPayeeId) {
      const payee = payees.find(p => p.id === selectedPayeeId);
      if (!payee) {
        alert('Selected payee not found. Please try again.');
        return;
      }
    }

    // Find the selected account in chart_of_accounts by plaid_account_id
    const selectedAccount = categories.find(
      c => c.plaid_account_id === selectedAccountId
    );

    if (!selectedAccount) {
      console.error('Account details:', {
        selectedAccountId,
        availableAccounts: categories.filter(c => c.plaid_account_id).map(c => ({
          id: c.id,
          name: c.name,
          plaid_account_id: c.plaid_account_id
        }))
      });
      alert(`Account not found in chart of accounts. Please ensure the account "${accounts.find(a => a.plaid_account_id === selectedAccountId)?.name}" is properly set up in your chart of accounts.`);
      return;
    }

    const selectedAccountIdInCOA = selectedAccount.id;

    try {
      // Use the 6-move-to-transactions API endpoint with company context
      const response = await postWithCompany('/api/6-move-to-transactions', {
        imported_transaction_id: tx.id,
        selected_category_id: selectedCategoryId,
        corresponding_category_id: selectedAccountIdInCOA,
        payee_id: selectedPayeeId
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to move transaction');
      }

      await postWithCompany('/api/sync-journal', {});
      refreshAll();
    } catch (error) {
      console.error('Error moving transaction:', error);
      alert(error instanceof Error ? error.message : 'Failed to move transaction. Please try again.');
    }
  };

  const undoTransaction = async (tx: Transaction) => {
    try {
      if (!tx || !tx.id) {
        throw new Error('Invalid transaction: missing ID');
      }

      // 1. Delete journal entries for this transaction
      const { error: journalDeleteError } = await supabase
        .from('journal')
        .delete()
        .eq('transaction_id', tx.id);

      if (journalDeleteError) {
        console.error('Error deleting journal entries:', journalDeleteError);
        throw new Error(`Failed to delete journal entries: ${journalDeleteError.message}`);
      }

      // 2. Delete the transaction
      const { error: deleteError } = await supabase.from('transactions').delete().eq('id', tx.id);
      
      if (deleteError) {
        console.error('Error deleting from transactions:', deleteError);
        throw new Error(`Failed to delete from transactions: ${deleteError.message}`);
      }
      
      // 3. Insert back into imported_transactions
      const { error: insertError } = await supabase.from('imported_transactions').insert([{
        date: tx.date,
        description: tx.description,
        spent: tx.spent,
        received: tx.received,
        plaid_account_id: tx.plaid_account_id,
        plaid_account_name: tx.plaid_account_name,
        company_id: currentCompany?.id
      }]);

      if (insertError) {
        console.error('Error inserting into imported_transactions:', insertError);
        throw new Error(`Failed to insert into imported_transactions: ${insertError.message}`);
      }

              await postWithCompany('/api/sync-journal', {});
        console.log('Successfully deleted transaction and related journal entries:', tx.id);

      refreshAll();
    } catch (error) {
      console.error('Error in undoTransaction:', error);
      alert(error instanceof Error ? error.message : 'Failed to undo transaction. Please try again.');
    }
  };

  const addManualTransaction = async () => {
    if (!manualDate || !manualDescription || !manualAmount || !selectedAccountId || !manualCategoryId) return;

    const category = categories.find(c => c.id === manualCategoryId);
    if (!category) return;

    // Find the selected account in chart_of_accounts by plaid_account_id
    const selectedAccount = categories.find(
      c => c.plaid_account_id === selectedAccountId
    );
    const selectedAccountIdInCOA = selectedAccount?.id;
    if (!selectedAccountIdInCOA) {
      alert('Account not found in chart of accounts.');
      return;
    }

    await supabase.from('transactions').insert([{
      date: manualDate,
      description: manualDescription,
      amount: parseFloat(manualAmount),
      selected_category_id: manualCategoryId,
      corresponding_category_id: selectedAccountIdInCOA,
      plaid_account_id: selectedAccountId,
      plaid_account_name: accounts.find(acc => acc.plaid_account_id === selectedAccountId)?.plaid_account_name || ''
    }]);

    setManualDate('');
    setManualDescription('');
    setManualAmount('');
    setManualCategoryId('');
    refreshAll();
  }

  // 4️⃣ Category dropdown
  const categoryOptions: SelectOption[] = [
    { value: '', label: 'Select' },
    { value: 'add_new', label: '+ Add new category' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ]

  // 5️⃣ Payee dropdown
  const payeeOptions: SelectOption[] = [
    { value: '', label: 'Select' },
    { value: 'add_new', label: '+ Add new payee' },
    ...payees.map(p => ({ value: p.id, label: p.name })),
  ]

  const formatDate = (dateString: string) => {
    // Parse the date string and create a UTC date
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    const formattedMonth = (date.getUTCMonth() + 1).toString().padStart(2, '0')
    const formattedDay = date.getUTCDate().toString().padStart(2, '0')
    return `${formattedMonth}-${formattedDay}-${date.getUTCFullYear()}`
  }

  // Add sorting function
  const sortTransactions = (transactions: Transaction[], sortConfig: SortConfig) => {
    if (!sortConfig.key) return transactions;

    return [...transactions].sort((a, b) => {
      if (sortConfig.key === 'date') {
        return sortConfig.direction === 'asc' 
          ? new Date(a.date).getTime() - new Date(b.date).getTime()
          : new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (sortConfig.key === 'description') {
        return sortConfig.direction === 'asc'
          ? a.description.localeCompare(b.description)
          : b.description.localeCompare(a.description);
      }
      if (sortConfig.key === 'amount') {
        const aAmount = a.amount ?? ((a.received ?? 0) - (a.spent ?? 0));
        const bAmount = b.amount ?? ((b.received ?? 0) - (b.spent ?? 0));
        return sortConfig.direction === 'asc'
          ? aAmount - bAmount
          : bAmount - aAmount;
      }
      return 0;
    });
  };

  const handleSort = (key: 'date' | 'description' | 'amount', section: 'toAdd' | 'added') => {
    if (section === 'toAdd') {
      setToAddSortConfig(current => ({
        key,
        direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
      }));
    } else {
      setAddedSortConfig(current => ({
        key,
        direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
      }));
    }
  };

  // Find the selected account in chart_of_accounts by plaid_account_id
  const selectedAccount = categories.find(
    c => c.plaid_account_id === selectedAccountId
  );
  const selectedAccountIdInCOA = selectedAccount?.id;

  // Update the imported transactions to use sorting
  const imported = sortTransactions(
    importedTransactions
      .filter(tx => tx.plaid_account_id === selectedAccountId)
      .filter(tx => {
        if (!toAddSearchQuery) return true;
        const q = toAddSearchQuery.toLowerCase();
        const desc = tx.description?.toLowerCase() || '';
        const date = formatDate(tx.date).toLowerCase();
        const spent = tx.spent !== undefined ? tx.spent.toString() : '';
        const received = tx.received !== undefined ? tx.received.toString() : '';
        const amount = tx.amount !== undefined ? tx.amount.toString() : '';
        // Also search formatted amounts (what user sees in display)
        const spentFormatted = tx.spent ? tx.spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        const receivedFormatted = tx.received ? tx.received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        const amountFormatted = tx.amount !== undefined ? tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        return (
          desc.includes(q) ||
          date.includes(q) ||
          spent.includes(q) ||
          received.includes(q) ||
          amount.includes(q) ||
          spentFormatted.includes(q) ||
          receivedFormatted.includes(q) ||
          amountFormatted.includes(q)
        );
      }),
    toAddSortConfig
  );

  // Update the confirmed transactions to use sorting
  const confirmed = sortTransactions(
    transactions
      .filter(tx => {
        if (tx.plaid_account_id === selectedAccountId) return true;
        if (tx.plaid_account_id === 'MANUAL_ENTRY') {
          return tx.selected_category_id === selectedAccountIdInCOA || tx.corresponding_category_id === selectedAccountIdInCOA;
        }
        return false;
      })
      .filter(tx => {
        if (!addedSearchQuery) return true;
        const q = addedSearchQuery.toLowerCase();
        const desc = tx.description?.toLowerCase() || '';
        const date = formatDate(tx.date).toLowerCase();
        const spent = tx.spent !== undefined ? tx.spent.toString() : '';
        const received = tx.received !== undefined ? tx.received.toString() : '';
        const amount = tx.amount !== undefined ? tx.amount.toString() : '';
        // Also search formatted amounts (what user sees in display)
        const spentFormatted = tx.spent ? tx.spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        const receivedFormatted = tx.received ? tx.received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        const amountFormatted = tx.amount !== undefined ? tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        // Get the category name for this transaction
        const isAccountDebit = tx.selected_category_id === selectedAccountIdInCOA;
        const categoryId = isAccountDebit ? tx.corresponding_category_id : tx.selected_category_id;
        const category = categories.find(c => c.id === categoryId);
        const categoryName = category ? category.name.toLowerCase() : '';
        return (
          desc.includes(q) ||
          date.includes(q) ||
          spent.includes(q) ||
          received.includes(q) ||
          amount.includes(q) ||
          spentFormatted.includes(q) ||
          receivedFormatted.includes(q) ||
          amountFormatted.includes(q) ||
          categoryName.includes(q)
        );
      }),
    addedSortConfig
  );

  const accountName = accounts.find(a => a.plaid_account_id === selectedAccountId)?.plaid_account_name || ''
  const currentBalance = accounts.find(a => a.plaid_account_id === selectedAccountId)?.current_balance || 0

  // Calculate the Switch (Accounting) Balance for the selected account
  // Simply total received minus total spent
  const switchBalance = transactions.reduce((sum, tx) => {
    return sum + (tx.received ?? 0) - (tx.spent ?? 0);
  }, 0);

  // Helper to get the display amount for a transaction relative to the selected account
  function getDisplayAmountForSelectedAccount(tx: Transaction, selectedAccountIdInCOA: string | undefined) {
    if (!selectedAccountIdInCOA) return Number(tx.amount);
    if (tx.selected_category_id === selectedAccountIdInCOA) return Number(tx.amount);
    if (tx.corresponding_category_id === selectedAccountIdInCOA) return -Number(tx.amount);
    return Number(tx.amount);
  }

  const downloadTemplate = () => {
    const headers = ['Date', 'Description', 'Amount']
    const exampleData = [
      ['01-15-2025', 'Client Payment - Invoice #1001', '1000.00'],
      ['01-16-2025', 'Office Supplies - Staples', '-150.75'],
      ['01-17-2025', 'Bank Interest Received', '25.50'],
      ['01-18-2025', 'Monthly Software Subscription', '-99.99'],
      ['01-19-2025', 'Customer Refund', '-200.00']
    ]
    
    const csvContent = [
      headers.join(','),
      ...exampleData.map(row => row.join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transaction_import_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const validateCSV = (data: Papa.ParseResult<CSVRow>) => {
    if (!data.data || data.data.length === 0) {
      return 'CSV file is empty'
    }

    const requiredColumns = ['Date', 'Description', 'Amount']
    const headers = Object.keys(data.data[0])
    
    const missingColumns = requiredColumns.filter(col => !headers.includes(col))
    if (missingColumns.length > 0) {
      return `Missing required columns: ${missingColumns.join(', ')}. Expected: Date, Description, Amount`
    }

    // Filter out empty rows before validation
    const nonEmptyRows = data.data.filter(row => 
      row.Date && row.Amount && row.Description
    )

    if (nonEmptyRows.length === 0) {
      return 'No valid transaction data found. Please ensure you have at least one row with Date, Description, and Amount.'
    }

    // Validate each non-empty row
    for (let i = 0; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i]
      
      // Validate date format (prefer MM-DD-YYYY, but also support M/D/YY, MM/DD/YY, M/D/YYYY, YYYY-MM-DD)
      let isValidDate = false
      let parsedDate: Date | null = null

      // Try MM-DD-YYYY format first (recommended)
      if (row.Date.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) {
        const dateParts = row.Date.split(/[\/\-]/)
        const monthNum = parseInt(dateParts[0])
        const dayNum = parseInt(dateParts[1])
        const yearStr = dateParts[2]
        const yearNum = parseInt(yearStr)
        
        // Handle two-digit years
        const fullYear = yearNum < 100 ? 2000 + yearNum : yearNum
        
        parsedDate = new Date(Date.UTC(fullYear, monthNum - 1, dayNum))
        isValidDate = !isNaN(parsedDate.getTime()) && monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31
      }
      
      // Try YYYY-MM-DD format as fallback
      if (!isValidDate && row.Date.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
        const [yearStr, monthStr, dayStr] = row.Date.split('-')
        const year = parseInt(yearStr)
        const month = parseInt(monthStr)
        const day = parseInt(dayStr)
        parsedDate = new Date(Date.UTC(year, month - 1, day))
        isValidDate = !isNaN(parsedDate.getTime()) && month >= 1 && month <= 12 && day >= 1 && day <= 31
      }

      if (!isValidDate) {
        return `Invalid date format in row ${i + 1}: "${row.Date}". Please use MM-DD-YYYY format (recommended) or YYYY-MM-DD format.`
      }

      // Validate amount
      const amount = parseFloat(row.Amount)
      if (isNaN(amount)) {
        return `Invalid amount in row ${i + 1}: "${row.Amount}". Please use numeric values (e.g., 100.50 or -75.25)`
      }

      // Validate description is not empty
      if (!row.Description.trim()) {
        return `Empty description in row ${i + 1}. Please provide a description for each transaction.`
      }
    }

    return null
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement> | DragEvent) => {
    const file = event instanceof DragEvent 
      ? event.dataTransfer?.files[0]
      : event.target.files?.[0]
    
    if (!file) return

    setImportModal(prev => ({ ...prev, isLoading: true, error: null }))

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<CSVRow>) => {
        const error = validateCSV(results)
        if (error) {
          setImportModal(prev => ({
            ...prev,
            isLoading: false,
            error
          }))
          return
        }

        // Convert CSV data to transactions, filtering out any empty rows
        const transactions = results.data
          .filter((row: CSVRow) => 
            row.Date && row.Amount && row.Description
          )
          .map((row: CSVRow) => {
            // Parse date - try MM-DD-YYYY format first
            let parsedDate: Date
            
            if (row.Date.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) {
              // MM-DD-YYYY format (recommended)
              const dateParts = row.Date.split(/[\/\-]/)
              const monthNum = parseInt(dateParts[0])
              const dayNum = parseInt(dateParts[1])
              const yearStr = dateParts[2]
              const yearNum = parseInt(yearStr)
              
              // Handle two-digit years
              const fullYear = yearNum < 100 ? 2000 + yearNum : yearNum
              
              // Create date in UTC to prevent timezone shifts
              parsedDate = new Date(Date.UTC(fullYear, monthNum - 1, dayNum))
            } else {
              // Fallback to YYYY-MM-DD format
              const [yearStr, monthStr, dayStr] = row.Date.split('-')
              const year = parseInt(yearStr)
              const month = parseInt(monthStr)
              const day = parseInt(dayStr)
              parsedDate = new Date(Date.UTC(year, month - 1, day))
            }
            
            const amount = parseFloat(row.Amount)
            
            return {
              id: uuidv4(),
              date: parsedDate.toISOString().split('T')[0], // Store as YYYY-MM-DD
              description: row.Description.trim(),
              amount: amount, // Keep original amount for display
              spent: amount < 0 ? Math.abs(amount) : 0, // Negative amounts become spent
              received: amount > 0 ? amount : 0, // Positive amounts become received
              plaid_account_id: importModal.selectedAccount?.plaid_account_id || null,
              plaid_account_name: importModal.selectedAccount?.name || null,
              company_id: currentCompany?.id
            }
          })

        setImportModal(prev => ({
          ...prev,
          isLoading: false,
          csvData: transactions,
          step: 'review'
        }))
      },
      error: (error) => {
        setImportModal(prev => ({
          ...prev,
          isLoading: false,
          error: `Error parsing CSV: ${error.message}`
        }))
      }
    })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files[0];
    if (file) {
      const event = {
        target: { files: [file] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileUpload(event);
    }
  };

  const handleEditTransaction = async (updatedTransaction: Transaction) => {
    if (!editModal.transaction) return;

    // Find the category based on the selected category ID
    const category = categories.find(c => c.id === updatedTransaction.selected_category_id);
    if (!category) return;

    // Find the selected account in chart_of_accounts
    const selectedAccount = categories.find(c => c.plaid_account_id === selectedAccountId);
    if (!selectedAccount) return;

    const selectedAccountIdInCOA = selectedAccount.id;

    await supabase
      .from('transactions')
      .update({
        date: updatedTransaction.date,
        description: updatedTransaction.description,
        spent: updatedTransaction.spent ?? 0,
        received: updatedTransaction.received ?? 0,
        selected_category_id: updatedTransaction.selected_category_id,
        corresponding_category_id: selectedAccountIdInCOA
      })
      .eq('id', editModal.transaction.id);

    await postWithCompany('/api/sync-journal', {});
    setEditModal({ isOpen: false, transaction: null });
    refreshAll();
  };

  // Add handler for updating account name
  const handleUpdateAccountName = async () => {
    if (!accountEditModal.account || !accountEditModal.newName.trim()) return;

    await supabase
      .from('accounts')
      .update({ name: accountEditModal.newName.trim() })
      .eq('plaid_account_id', accountEditModal.account.plaid_account_id);

    setAccountEditModal({ isOpen: false, account: null, newName: '' });
    refreshAll();
  };

  // Add handler for creating new category
  const handleCreateCategory = async () => {
    if (!newCategoryModal.name.trim()) return;

    const { data, error } = await supabase
      .from('chart_of_accounts')
      .insert([{
        name: newCategoryModal.name.trim(),
        type: newCategoryModal.type,
        parent_id: newCategoryModal.parent_id,
        company_id: currentCompany?.id
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      return;
    }

    // After creating the category, set it as selected for the current transaction
    if (newCategoryModal.transactionId) {
      setSelectedCategories(prev => ({
        ...prev,
        [newCategoryModal.transactionId!]: data.id
      }));
    }

    setNewCategoryModal({ isOpen: false, name: '', type: 'Expense', parent_id: null, transactionId: null });
    refreshAll();
  };

  // Add handler for creating new payee
  const handleCreatePayee = async () => {
    if (!newPayeeModal.name.trim()) return;

    const { data, error } = await supabase
      .from('payees')
      .insert([{
        name: newPayeeModal.name.trim(),
        company_id: currentCompany?.id
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating payee:', error);
      return;
    }

    // After creating the payee, set it as selected for the current transaction
    if (newPayeeModal.transactionId) {
      setSelectedPayees(prev => ({
        ...prev,
        [newPayeeModal.transactionId!]: data.id
      }));
    }

    setNewPayeeModal({ isOpen: false, name: '', transactionId: null });
    refreshAll();
  };

  // Add function to create manual account
  const createManualAccount = async () => {
    if (!manualAccountModal.name.trim()) {
      setNotification({ type: 'error', message: 'Account name is required' });
      return;
    }

    if (!hasCompanyContext) {
      setNotification({ type: 'error', message: 'No company selected. Please select a company first.' });
      return;
    }

    try {
      const manualAccountId = uuidv4();
      const startingBalance = parseFloat(manualAccountModal.startingBalance) || 0;

      // Insert into accounts table
      const { error: accountError } = await supabase.from('accounts').insert({
        plaid_account_id: manualAccountId,
        name: manualAccountModal.name.trim(),
        type: manualAccountModal.type,
        starting_balance: startingBalance,
        current_balance: startingBalance,
        last_synced: new Date().toISOString(),
        plaid_item_id: 'MANUAL_ENTRY',
        is_manual: true,
        company_id: currentCompany!.id
      });

      if (accountError) {
        console.error('Error creating manual account:', accountError);
        setNotification({ type: 'error', message: 'Failed to create account. Please try again.' });
        return;
      }

      // Insert into chart_of_accounts table
      const { error: coaError } = await supabase.from('chart_of_accounts').insert({
        name: manualAccountModal.name.trim(),
        type: manualAccountModal.type,
        plaid_account_id: manualAccountId,
        company_id: currentCompany!.id
      });

      if (coaError) {
        console.error('Error creating chart of accounts entry:', coaError);
        setNotification({ type: 'error', message: 'Failed to create chart of accounts entry. Please try again.' });
        return;
      }

      setManualAccountModal({
        isOpen: false,
        name: '',
        type: 'Asset',
        startingBalance: '0'
      });

      // Set the newly created account as selected
      setSelectedAccountId(manualAccountId);
      setNotification({ type: 'success', message: 'Manual account created successfully!' });
      refreshAll();
    } catch (error) {
      console.error('Error creating manual account:', error);
      setNotification({ type: 'error', message: 'An unexpected error occurred. Please try again.' });
    }
  };

  // Add function to handle account name updates
  const handleUpdateAccountNames = async () => {
    for (const account of accountNamesModal.accounts) {
      if (account.id) {  // Only update if id exists
        // Update accounts table - update both name and plaid_account_name for consistency
        await supabase
          .from('accounts')
          .update({ name: account.name })
          .eq('plaid_account_id', account.id);
        // Update chart_of_accounts table
        await supabase
          .from('chart_of_accounts')
          .update({ name: account.name })
          .eq('plaid_account_id', account.id);
      }
    }
    refreshAll();
    setAccountNamesModal({ isOpen: false, accounts: [], accountToDelete: null, deleteConfirmation: '' });
  };

  // Add function to handle account deletion
  const handleDeleteAccount = async (accountId: string) => {
    try {
      // Delete from accounts table
      await supabase
        .from('accounts')
        .delete()
        .eq('plaid_account_id', accountId);

      // Delete from chart_of_accounts table
      await supabase
        .from('chart_of_accounts')
        .delete()
        .eq('plaid_account_id', accountId);

      // Delete related transactions
      await supabase
        .from('transactions')
        .delete()
        .eq('plaid_account_id', accountId);

      // Delete related imported transactions
      await supabase
        .from('imported_transactions')
        .delete()
        .eq('plaid_account_id', accountId);

      // Remove the deleted account from the modal's accounts list
      const updatedAccounts = accountNamesModal.accounts.filter(acc => acc.id !== accountId);
      setAccountNamesModal(prev => ({
        ...prev,
        accounts: updatedAccounts,
        accountToDelete: null,
        deleteConfirmation: ''
      }));

      // If the deleted account was selected, select the first remaining account
      if (selectedAccountId === accountId && updatedAccounts.length > 0) {
        setSelectedAccountId(updatedAccounts[0].id);
      }

      refreshAll();
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account. Please try again.');
    }
  };

  // Add function to add a new journal entry line
  const addJournalEntryLine = () => {
    setJournalEntryModal(prev => ({
      ...prev,
      entries: [...prev.entries, { account_id: '', amount: 0, type: 'debit' }]
    }));
  };

  // Add function to remove a journal entry line
  const removeJournalEntryLine = (index: number) => {
    setJournalEntryModal(prev => ({
      ...prev,
      entries: prev.entries.filter((_, i) => i !== index)
    }));
  };

  // Add function to save journal entry
  const saveJournalEntry = async () => {
    // Validate that debits equal credits
    const totalDebits = journalEntryModal.entries
      .filter(e => e.type === 'debit')
      .reduce((sum, e) => sum + e.amount, 0);
    const totalCredits = journalEntryModal.entries
      .filter(e => e.type === 'credit')
      .reduce((sum, e) => sum + e.amount, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      alert('Total debits must equal total credits');
      return;
    }

    // Validate that both lines have account_id and nonzero amount
    for (const entry of journalEntryModal.entries) {
      if (!entry.account_id || !entry.amount || entry.amount <= 0) {
        alert('Each line must have an account and a nonzero amount.');
        return;
      }
    }

    // Insert both lines
    for (const entry of journalEntryModal.entries) {
      await supabase.from('transactions').insert([{
        date: journalEntryModal.date,
        description: journalEntryModal.description,
        spent: entry.type === 'debit' ? entry.amount : 0,
        received: entry.type === 'credit' ? entry.amount : 0,
        selected_category_id: entry.account_id,
        corresponding_category_id: null,
        plaid_account_id: 'MANUAL_ENTRY',
        plaid_account_name: 'Manual Journal Entry'
      }]);
    }

    // Automatically sync the journal after saving
    await postWithCompany('/api/sync-journal', {});

    // Reset modal and refresh data
    setJournalEntryModal({
      isOpen: false,
      date: new Date().toISOString().split('T')[0],
      description: '',
      entries: []
    });
    refreshAll();
  };

  // Add function to fetch past journal entries
  const fetchPastJournalEntries = async () => {
    const { data: transactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('plaid_account_id', 'MANUAL_ENTRY')
      .order('date', { ascending: false });

    if (transactions) {
      // Group transactions by description and date to form journal entries
      const groupedEntries = transactions.reduce((acc: Record<string, {
        id: string;
        date: string;
        description: string;
        transactions: {
          account_id: string;
          account_name: string;
          amount: number;
          type: 'debit' | 'credit';
        }[];
      }>, tx) => {
        const key = `${tx.date}_${tx.description}`;
        if (!acc[key]) {
          acc[key] = {
            id: tx.id,
            date: tx.date,
            description: tx.description,
            transactions: []
          };
        }
        
        // Find the account name
        const account = categories.find(c => c.id === (tx.selected_category_id || tx.corresponding_category_id));
        
        acc[key].transactions.push({
          account_id: tx.selected_category_id || tx.corresponding_category_id,
          account_name: account?.name || 'Unknown Account',
          amount: typeof tx.amount === 'number' ? tx.amount : (tx.spent ?? tx.received ?? 0),
          type: tx.selected_category_id ? 'debit' : 'credit'
        });
        
        return acc;
      }, {});

      setPastJournalEntriesModal(prev => ({
        ...prev,
        entries: Object.values(groupedEntries)
      }));
    }
  };

  // Add function to handle editing journal entry
  const handleEditJournalEntry = async () => {
    if (!editJournalEntryModal.entry) return;

    // Validate that debits equal credits
    const totalDebits = editJournalEntryModal.entry.transactions
      .filter(tx => tx.type === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const totalCredits = editJournalEntryModal.entry.transactions
      .filter(tx => tx.type === 'credit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      alert('Total debits must equal total credits');
      return;
    }

    // Delete existing transactions
    await supabase
      .from('transactions')
      .delete()
      .eq('plaid_account_id', 'MANUAL_ENTRY')
      .eq('date', editJournalEntryModal.entry.date)
      .eq('description', editJournalEntryModal.entry.description);

    // Create new transactions
    for (const tx of editJournalEntryModal.entry.transactions) {
      await supabase.from('transactions').insert([{
        date: editJournalEntryModal.entry.date,
        description: editJournalEntryModal.entry.description,
        amount: tx.amount,
        debit_account_id: tx.type === 'debit' ? tx.account_id : null,
        credit_account_id: tx.type === 'credit' ? tx.account_id : null,
        plaid_account_id: 'MANUAL_ENTRY',
        plaid_account_name: 'Manual Journal Entry'
      }]);
    }

    setEditJournalEntryModal({ isOpen: false, entry: null });
    fetchPastJournalEntries();
    refreshAll();
  };

  // Add function to remove a transaction from edit modal
  const removeEditTransaction = (index: number) => {
    if (!editJournalEntryModal.entry) return;
    setEditJournalEntryModal(prev => ({
      ...prev,
      entry: prev.entry ? {
        ...prev.entry,
        transactions: prev.entry.transactions.filter((_, i) => i !== index)
      } : null
    }));
  };

  // Add function to add a new transaction to edit modal
  const addEditTransaction = () => {
    if (!editJournalEntryModal.entry) return;
    setEditJournalEntryModal(prev => ({
      ...prev,
      entry: prev.entry ? {
        ...prev.entry,
        transactions: [...prev.entry.transactions, { account_id: '', account_name: '', amount: 0, type: 'debit' }]
      } : null
    }));
  };

  // --- RENDER ---

  // Check if user has company context for Plaid operations
  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-sm text-yellow-700">
            Please select a company from the dropdown in the navigation bar to use Plaid integration and manage transactions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
      <div className="flex justify-end items-center mb-4">
        {notification && (
          <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded shadow-lg text-sm font-medium flex items-center space-x-2 ${
            notification.type === 'success' ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'
          }`}>
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-2 text-xs text-gray-500 hover:text-gray-800">✕</button>
          </div>
        )}
        <div className="flex flex-row items-center space-x-2">
          <button
            onClick={syncTransactions}
            disabled={isSyncing}
            className={`border px-3 py-1 rounded text-xs flex items-center space-x-1 ${
              isSyncing 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {isSyncing ? (
              <div className="flex items-center space-x-1">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400" />
                <span>Syncing...</span>
              </div>
            ) : (
              <span>Update Accounts</span>
            )}
          </button>
          <button
            onClick={() => open()}
            disabled={!ready}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
          >
            Link Accounts
          </button>
          <button
            onClick={() => setImportModal(prev => ({ ...prev, isOpen: true }))}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
          >
            Import CSV
          </button>
          <button
            onClick={() => setManualAccountModal({ isOpen: true, name: '', type: 'Asset', startingBalance: '0' })}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
          >
            Add Manual Account
          </button>
          <button
            onClick={() => setAccountNamesModal({
              isOpen: true,
              accounts: accounts
                .filter(acc => acc.plaid_account_id)
                .map(acc => ({
                  id: acc.plaid_account_id || '',
                  name: acc.plaid_account_name || acc.name || 'Unknown Account'
                })),
              accountToDelete: null,
              deleteConfirmation: ''
            })}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
          >
            Edit Accounts
          </button>
        </div>
      </div>

      {/* Mini-nav for accounts */}
      <div className="space-x-2 mb-4 flex flex-row">
        {accounts.map(acc => (
          <button
            key={acc.plaid_account_id}
            onClick={() => setSelectedAccountId(acc.plaid_account_id)}
            className={`border px-3 py-1 rounded text-xs flex flex-col items-center ${acc.plaid_account_id === selectedAccountId ? 'bg-gray-200 font-semibold' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            <span>{acc.name}</span>
            <span className="text-xs text-gray-500 font-normal">
              Last Updated: {formatLastSyncTime(acc.last_synced)}
            </span>
          </button>
        ))}
      </div>

      {/* Import Modal */}
      {importModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
          <div className="bg-white rounded-lg p-6 w-[600px] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Import Transactions</h2>
              <button
                onClick={() => setImportModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            
            {importModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
                {importModal.error}
              </div>
            )}

            {importModal.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <div className="space-y-1">
                {importModal.step === 'upload' && (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Select Account
                        </label>
                        <Select
                          options={accounts.map(acc => ({
                            value: acc.plaid_account_id || '',
                            label: acc.name
                          }))}
                          value={importModal.selectedAccount ? {
                            value: importModal.selectedAccount.plaid_account_id || '',
                            label: importModal.selectedAccount.name
                          } : null}
                          onChange={(selectedOption) => {
                            const option = selectedOption as SelectOption | null;
                            if (option) {
                              const selectedAccount = accounts.find(
                                acc => acc.plaid_account_id === option.value
                              );
                              setImportModal(prev => ({
                                ...prev,
                                selectedAccount: selectedAccount || null
                              }));
                            }
                          }}
                          isSearchable
                          placeholder="Search accounts..."
                          className="w-full"
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-medium text-gray-700">Upload CSV File</h3>
                          <button
                            onClick={downloadTemplate}
                            className="text-sm text-gray-600 hover:text-gray-800"
                          >
                            Download Template
                          </button>
                        </div>
                        
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-blue-800 mb-2">CSV Format Instructions:</h4>
                          <ul className="text-sm text-blue-700 space-y-1">
                            <li>• <strong>Date:</strong> Use MM-DD-YYYY format (e.g., 01-15-2024)</li>
                            <li>• <strong>Description:</strong> Any text describing the transaction</li>
                            <li>• <strong>Amount:</strong> Positive for money received, negative for money spent</li>
                          </ul>
                          <p className="text-xs text-blue-600 mt-2">
                            Download the template above to see examples of proper formatting.
                          </p>
                        </div>
                      </div>
                      <div 
                        className={`border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors duration-200 ${!importModal.selectedAccount ? 'opacity-50' : 'hover:border-gray-400'}`}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                      >
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleFileUpload}
                          className="hidden"
                          id="csv-upload"
                          disabled={!importModal.selectedAccount}
                        />
                        <label
                          htmlFor="csv-upload"
                          className={`cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${!importModal.selectedAccount ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          Choose CSV File
                        </label>
                        <p className="mt-2 text-sm text-gray-500">
                          {importModal.selectedAccount 
                            ? 'Drag and drop your CSV file here, or click to browse'
                            : 'Please select an account first'}
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <button
                        onClick={() => setImportModal(prev => ({ ...prev, isOpen: false }))}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
                {importModal.step === 'review' && (
                  <>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700">Review Transactions</h3>
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                                <input
                                  type="checkbox"
                                  checked={importModal.csvData.length > 0 && importModal.selectedTransactions.size === importModal.csvData.length}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setImportModal(prev => ({
                                        ...prev,
                                        selectedTransactions: new Set(importModal.csvData.map(tx => tx.id))
                                      }))
                                    } else {
                                      setImportModal(prev => ({
                                        ...prev,
                                        selectedTransactions: new Set()
                                      }))
                                    }
                                  }}
                                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                />
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">Date</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">Description</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-8">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {importModal.csvData.map((tx) => (
                              <tr key={tx.id}>
                                <td className="px-4 py-2 whitespace-nowrap w-8 text-left">
                                  <input
                                    type="checkbox"
                                    checked={importModal.selectedTransactions.has(tx.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(importModal.selectedTransactions)
                                      if (e.target.checked) {
                                        newSelected.add(tx.id)
                                      } else {
                                        newSelected.delete(tx.id)
                                      }
                                      setImportModal(prev => ({
                                        ...prev,
                                        selectedTransactions: newSelected
                                      }))
                                    }}
                                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                  />
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 w-8 text-left">
                                  {formatDate(tx.date)}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900 w-8 text-left" style={{ minWidth: 250 }}>
                                  {tx.description}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900 text-right w-8">
                                  ${(tx.amount ?? ((tx.received ?? 0) - (tx.spent ?? 0))).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td colSpan={4} className="px-4 py-2 text-sm font-medium text-gray-900 text-right w-8">
                                ${importModal.csvData.reduce((sum, tx) => sum + (tx.amount ?? ((tx.received ?? 0) - (tx.spent ?? 0))), 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-sm font-medium">
                        {importModal.selectedTransactions.size > 0 && (
                          <span className="text-gray-600">
                            {importModal.selectedTransactions.size} selected
                          </span>
                        )}
                      </div>
                      <div className="flex justify-end space-x-2 mt-4">
                        <button
                          onClick={() => setImportModal(prev => ({ ...prev, step: 'upload' }))}
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Back
                        </button>
                        <button
                          onClick={async () => {
                            setImportModal(prev => ({ ...prev, isLoading: true, error: null }))
                            try {
                              if (!currentCompany) {
                                throw new Error('No company selected. Please select a company first.')
                              }

                              // Filter selected transactions
                              const selectedTransactions = importModal.csvData.filter(tx => 
                                importModal.selectedTransactions.has(tx.id)
                              )

                              if (selectedTransactions.length === 0) {
                                throw new Error('No transactions selected for import.')
                              }

                              // Prepare data for insertion - ensure all required fields are present
                              const transactionsToInsert = selectedTransactions.map(tx => ({
                                date: tx.date,
                                description: tx.description,
                                spent: tx.spent || 0,
                                received: tx.received || 0,
                                plaid_account_id: tx.plaid_account_id,
                                plaid_account_name: tx.plaid_account_name,
                                company_id: currentCompany.id
                              }))

                              // Insert selected transactions into imported_transactions
                              const { data, error } = await supabase
                                .from('imported_transactions')
                                .insert(transactionsToInsert)
                                .select()

                              if (error) {
                                console.error('Supabase error:', error)
                                throw new Error(error.message)
                              }

                              if (!data) {
                                throw new Error('No data returned from insert')
                              }

                              setImportModal(prev => ({
                                ...prev,
                                isOpen: false,
                                isLoading: false,
                                error: null,
                                step: 'upload',
                                csvData: [],
                                selectedTransactions: new Set()
                              }))

                              // Refresh the transactions list
                              refreshAll()
                              
                              // Show success message
                              setNotification({ 
                                type: 'success', 
                                message: `Successfully imported ${selectedTransactions.length} transactions!` 
                              })
                            } catch (error) {
                              console.error('Import error:', error)
                              setImportModal(prev => ({
                                ...prev,
                                isLoading: false,
                                error: error instanceof Error ? error.message : 'Failed to import transactions. Please try again.'
                              }))
                            }
                          }}
                          className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                        >
                          Import Transactions
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editModal.isOpen && editModal.transaction && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setEditModal({ isOpen: false, transaction: null })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Transaction</h2>
              <button
                onClick={() => setEditModal({ isOpen: false, transaction: null })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={editModal.transaction.date}
                  onChange={(e) => setEditModal(prev => ({
                    ...prev,
                    transaction: prev.transaction ? {
                      ...prev.transaction,
                      date: e.target.value
                    } : null
                  }))}
                  className="w-full border px-2 py-1 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={editModal.transaction.description}
                  onChange={(e) => setEditModal(prev => ({
                    ...prev,
                    transaction: prev.transaction ? {
                      ...prev.transaction,
                      description: e.target.value
                    } : null
                  }))}
                  className="w-full border px-2 py-1 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Spent
                </label>
                <input
                  type="number"
                  value={editModal.transaction.spent ?? 0}
                  onChange={(e) => setEditModal(prev => ({
                    ...prev,
                    transaction: prev.transaction ? {
                      ...prev.transaction,
                      spent: parseFloat(e.target.value) || 0
                    } : null
                  }))}
                  className="w-full border px-2 py-1 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Received
                </label>
                <input
                  type="number"
                  value={editModal.transaction.received ?? 0}
                  onChange={(e) => setEditModal(prev => ({
                    ...prev,
                    transaction: prev.transaction ? {
                      ...prev.transaction,
                      received: parseFloat(e.target.value) || 0
                    } : null
                  }))}
                  className="w-full border px-2 py-1 rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <Select
                  options={categoryOptions}
                  value={categoryOptions.find(opt => {
                    const isAccountDebit = editModal.transaction?.selected_category_id === selectedAccountIdInCOA;
                    const categoryId = isAccountDebit ? editModal.transaction?.corresponding_category_id : editModal.transaction?.selected_category_id;
                    return opt.value === categoryId;
                  })}
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    if (option && editModal.transaction) {
                      const updatedTransaction = { ...editModal.transaction };
                      const isAccountDebit = updatedTransaction.selected_category_id === selectedAccountIdInCOA;
                      if (isAccountDebit) {
                        updatedTransaction.corresponding_category_id = option.value;
                      } else {
                        updatedTransaction.selected_category_id = option.value;
                      }
                      setEditModal(prev => ({
                        ...prev,
                        transaction: updatedTransaction
                      }));
                    }
                  }}
                  isSearchable
                  styles={{ control: (base) => ({ ...base, minHeight: '30px', fontSize: '0.875rem' }) }}
                />
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => editModal.transaction && handleEditTransaction(editModal.transaction)}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Edit Modal */}
      {accountEditModal.isOpen && accountEditModal.account && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setAccountEditModal({ isOpen: false, account: null, newName: '' })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Account Name</h2>
              <button
                onClick={() => setAccountEditModal({ isOpen: false, account: null, newName: '' })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  value={accountEditModal.newName}
                  onChange={(e) => setAccountEditModal(prev => ({
                    ...prev,
                    newName: e.target.value
                  }))}
                  className="w-full border px-2 py-1 rounded"
                />
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={handleUpdateAccountName}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Category Modal */}
      {newCategoryModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setNewCategoryModal({ isOpen: false, name: '', type: 'Expense', parent_id: null, transactionId: null })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add New Category</h2>
              <button
                onClick={() => setNewCategoryModal({ isOpen: false, name: '', type: 'Expense', parent_id: null, transactionId: null })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  value={newCategoryModal.name}
                  onChange={(e) => setNewCategoryModal(prev => ({
                    ...prev,
                    name: e.target.value
                  }))}
                  className="w-full border px-2 py-1 rounded"
                  placeholder="Enter category name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={newCategoryModal.type}
                  onChange={(e) => setNewCategoryModal(prev => ({
                    ...prev,
                    type: e.target.value
                  }))}
                  className="w-full border px-2 py-1 rounded"
                >
                  <option value="Expense">Expense</option>
                  <option value="Revenue">Revenue</option>
                  <option value="Asset">Asset</option>
                  <option value="Liability">Liability</option>
                  <option value="Equity">Equity</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parent Account (Optional)
                </label>
                <Select
                  options={[
                    { value: '', label: 'None' },
                    ...categories
                      .filter(c => c.type === newCategoryModal.type)
                      .map(c => ({ value: c.id, label: c.name }))
                  ]}
                  value={newCategoryModal.parent_id ? 
                    { value: newCategoryModal.parent_id, label: categories.find(c => c.id === newCategoryModal.parent_id)?.name || '' } :
                    { value: '', label: 'None' }
                  }
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    setNewCategoryModal(prev => ({
                      ...prev,
                      parent_id: option?.value || null
                    }));
                  }}
                  isSearchable
                  styles={{ control: (base) => ({ ...base, minHeight: '30px', fontSize: '0.875rem' }) }}
                />
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={handleCreateCategory}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Payee Modal */}
      {newPayeeModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setNewPayeeModal({ isOpen: false, name: '', transactionId: null })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add New Payee</h2>
              <button
                onClick={() => setNewPayeeModal({ isOpen: false, name: '', transactionId: null })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payee Name
                </label>
                <input
                  type="text"
                  value={newPayeeModal.name}
                  onChange={(e) => setNewPayeeModal(prev => ({
                    ...prev,
                    name: e.target.value
                  }))}
                  className="w-full border px-2 py-1 rounded"
                  placeholder="Enter payee name"
                />
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={handleCreatePayee}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Account Modal */}
      {manualAccountModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setManualAccountModal({ isOpen: false, name: '', type: 'Asset', startingBalance: '0' })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add Manual Account</h2>
              <button
                onClick={() => setManualAccountModal({ isOpen: false, name: '', type: 'Asset', startingBalance: '0' })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Name
                </label>
                <input
                  type="text"
                  value={manualAccountModal.name}
                  onChange={(e) => setManualAccountModal(prev => ({
                    ...prev,
                    name: e.target.value
                  }))}
                  className="w-full border px-2 py-1 rounded"
                  placeholder="Enter account name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={manualAccountModal.type}
                  onChange={(e) => setManualAccountModal(prev => ({
                    ...prev,
                    type: e.target.value
                  }))}
                  className="w-full border px-2 py-1 rounded"
                >
                  <option value="Asset">Asset</option>
                  <option value="Liability">Liability</option>
                  <option value="Equity">Equity</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Starting Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={manualAccountModal.startingBalance}
                  onChange={(e) => setManualAccountModal(prev => ({
                    ...prev,
                    startingBalance: e.target.value
                  }))}
                  className="w-full border px-2 py-1 rounded"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={createManualAccount}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                disabled={!manualAccountModal.name.trim() || !manualAccountModal.type.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Names Modal */}
      {accountNamesModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setAccountNamesModal({ isOpen: false, accounts: [], accountToDelete: null, deleteConfirmation: '' })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Accounts</h2>
              <button
                onClick={() => setAccountNamesModal({ isOpen: false, accounts: [], accountToDelete: null, deleteConfirmation: '' })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {accountNamesModal.accounts.map((account, index) => (
                <div key={account.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={account.name}
                      onChange={(e) => {
                        const newAccounts = [...accountNamesModal.accounts];
                        newAccounts[index] = { ...account, name: e.target.value };
                        setAccountNamesModal(prev => ({
                          ...prev,
                          accounts: newAccounts
                        }));
                      }}
                      className="flex-1 border px-2 py-1 rounded"
                    />
                    <button
                      onClick={() => setAccountNamesModal(prev => ({
                        ...prev,
                        accountToDelete: account.id
                      }))}
                      className="text-red-600 hover:text-red-800 px-2 py-1"
                    >
                      Delete
                    </button>
                  </div>
                  {accountNamesModal.accountToDelete === account.id && (
                    <div className="bg-red-50 p-3 rounded border border-red-200">
                      <p className="text-sm text-red-700 mb-2">
                        Warning: This will permanently delete the account and all its transactions.
                        Type &quot;delete&quot; to confirm.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={accountNamesModal.deleteConfirmation}
                          onChange={(e) => setAccountNamesModal(prev => ({
                            ...prev,
                            deleteConfirmation: e.target.value
                          }))}
                          placeholder="Type 'delete' to confirm"
                          className="flex-1 border px-2 py-1 rounded"
                        />
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          disabled={accountNamesModal.deleteConfirmation !== 'delete'}
                          className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Confirm Delete
                        </button>
                        <button
                          onClick={() => setAccountNamesModal(prev => ({
                            ...prev,
                            accountToDelete: null,
                            deleteConfirmation: ''
                          }))}
                          className="px-3 py-1 border rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={handleUpdateAccountNames}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Journal Entry Modal */}
      {journalEntryModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
          <div className="bg-white p-6 rounded-lg w-[800px] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add Journal Entry</h2>
              <button
                onClick={() => setJournalEntryModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={journalEntryModal.date}
                    onChange={(e) => setJournalEntryModal(prev => ({
                      ...prev,
                      date: e.target.value
                    }))}
                    className="w-full border px-2 py-1 rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={journalEntryModal.description}
                    onChange={(e) => setJournalEntryModal(prev => ({
                      ...prev,
                      description: e.target.value
                    }))}
                    className="w-full border px-2 py-1 rounded"
                    placeholder="Enter description"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Journal Entries</h3>
                  <button
                    onClick={addJournalEntryLine}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Type</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Amount</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {journalEntryModal.entries.map((entry, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2">
                            <select
                              value={entry.account_id}
                              onChange={(e) => {
                                const newEntries = [...journalEntryModal.entries];
                                newEntries[index].account_id = e.target.value;
                                setJournalEntryModal(prev => ({
                                  ...prev,
                                  entries: newEntries
                                }));
                              }}
                              className="w-full border px-2 py-1 rounded"
                            >
                              <option value="">Select Account</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={entry.type}
                              onChange={(e) => {
                                const newEntries = [...journalEntryModal.entries];
                                newEntries[index].type = e.target.value as 'debit' | 'credit';
                                setJournalEntryModal(prev => ({
                                  ...prev,
                                  entries: newEntries
                                }));
                              }}
                              className="w-full border px-2 py-1 rounded"
                            >
                              <option value="debit">Debit</option>
                              <option value="credit">Credit</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={entry.amount}
                              onChange={(e) => {
                                const newEntries = [...journalEntryModal.entries];
                                newEntries[index].amount = parseFloat(e.target.value) || 0;
                                setJournalEntryModal(prev => ({
                                  ...prev,
                                  entries: newEntries
                                }));
                              }}
                              className="w-full border px-2 py-1 rounded text-right"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => removeJournalEntryLine(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={2} className="px-4 py-2 text-sm font-medium text-gray-900">
                          Total Debits: ${journalEntryModal.entries
                            .filter(e => e.type === 'debit')
                            .reduce((sum, e) => sum + e.amount, 0)
                            .toFixed(2)}
                        </td>
                        <td colSpan={2} className="px-4 py-2 text-sm font-medium text-gray-900 text-right">
                          Total Credits: ${journalEntryModal.entries
                            .filter(e => e.type === 'credit')
                            .reduce((sum, e) => sum + e.amount, 0)
                            .toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6 gap-2">
              <button
                onClick={() => {
                  fetchPastJournalEntries();
                  setPastJournalEntriesModal(prev => ({ ...prev, isOpen: true }));
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                View Past Entries
              </button>
              <button
                onClick={() => setJournalEntryModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveJournalEntry}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                disabled={!journalEntryModal.description.trim() || journalEntryModal.entries.length === 0}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Past Journal Entries Modal */}
      {pastJournalEntriesModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
          <div className="bg-white p-6 rounded-lg w-[800px] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Past Journal Entries</h2>
              <button
                onClick={() => setPastJournalEntriesModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4">
              <input
                type="text"
                placeholder="Search by date, description, account, or amount..."
                value={pastJournalEntriesSearch}
                onChange={(e) => setPastJournalEntriesSearch(e.target.value)}
                className="w-full border px-3 py-2 rounded"
              />
            </div>

            <div className="space-y-6">
              {filteredPastJournalEntries.map((entry, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <span className="font-medium">{entry.date}</span>
                      <span className="mx-2">-</span>
                      <span>{entry.description}</span>
                    </div>
                    <button
                      onClick={() => setEditJournalEntryModal({ isOpen: true, entry })}
                      className="text-blue-600 hover:text-blue-800 px-2 py-1"
                    >
                      Edit
                    </button>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Account</th>
                        <th className="text-center py-2">Type</th>
                        <th className="text-right py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.transactions.map((tx, txIndex) => (
                        <tr key={txIndex} className="border-b">
                          <td className="py-2">{tx.account_name}</td>
                          <td className="text-center py-2 capitalize">{tx.type}</td>
                          <td className="text-right py-2">${typeof tx.amount === 'number' ? tx.amount.toFixed(2) : '0.00'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              {filteredPastJournalEntries.length === 0 && (
                <div className="text-center text-gray-500 py-4">
                  {pastJournalEntriesSearch ? 'No matching journal entries found.' : 'No journal entries found.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Journal Entry Modal */}
      {editJournalEntryModal.isOpen && editJournalEntryModal.entry && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
          <div className="bg-white p-6 rounded-lg w-[800px] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Journal Entry</h2>
              <button
                onClick={() => setEditJournalEntryModal({ isOpen: false, entry: null })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={editJournalEntryModal.entry.date}
                    onChange={(e) => setEditJournalEntryModal(prev => ({
                      ...prev,
                      entry: prev.entry ? {
                        ...prev.entry,
                        date: e.target.value
                      } : null
                    }))}
                    className="w-full border px-2 py-1 rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={editJournalEntryModal.entry.description}
                    onChange={(e) => setEditJournalEntryModal(prev => ({
                      ...prev,
                      entry: prev.entry ? {
                        ...prev.entry,
                        description: e.target.value
                      } : null
                    }))}
                    className="w-full border px-2 py-1 rounded"
                    placeholder="Enter description"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">Journal Entries</h3>
                  <button
                    onClick={addEditTransaction}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    + Add Line
                  </button>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Type</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Amount</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {editJournalEntryModal.entry.transactions.map((tx, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2">
                            <select
                              value={tx.account_id}
                              onChange={(e) => {
                                const newTransactions = [...editJournalEntryModal.entry!.transactions];
                                newTransactions[index].account_id = e.target.value;
                                newTransactions[index].account_name = categories.find(c => c.id === e.target.value)?.name || '';
                                setEditJournalEntryModal(prev => ({
                                  ...prev,
                                  entry: prev.entry ? {
                                    ...prev.entry,
                                    transactions: newTransactions
                                  } : null
                                }));
                              }}
                              className="w-full border px-2 py-1 rounded"
                            >
                              <option value="">Select Account</option>
                              {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <select
                              value={tx.type}
                              onChange={(e) => {
                                const newTransactions = [...editJournalEntryModal.entry!.transactions];
                                newTransactions[index].type = e.target.value as 'debit' | 'credit';
                                setEditJournalEntryModal(prev => ({
                                  ...prev,
                                  entry: prev.entry ? {
                                    ...prev.entry,
                                    transactions: newTransactions
                                  } : null
                                }));
                              }}
                              className="w-full border px-2 py-1 rounded"
                            >
                              <option value="debit">Debit</option>
                              <option value="credit">Credit</option>
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={tx.amount}
                              onChange={(e) => {
                                const newTransactions = [...editJournalEntryModal.entry!.transactions];
                                newTransactions[index].amount = parseFloat(e.target.value) || 0;
                                setEditJournalEntryModal(prev => ({
                                  ...prev,
                                  entry: prev.entry ? {
                                    ...prev.entry,
                                    transactions: newTransactions
                                  } : null
                                }));
                              }}
                              className="w-full border px-2 py-1 rounded text-right"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => removeEditTransaction(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={2} className="px-4 py-2 text-sm font-medium text-gray-900">
                          Total Debits: ${editJournalEntryModal.entry.transactions
                            .filter(tx => tx.type === 'debit')
                            .reduce((sum, tx) => sum + tx.amount, 0)
                            .toFixed(2)}
                        </td>
                        <td colSpan={2} className="px-4 py-2 text-sm font-medium text-gray-900 text-right">
                          Total Credits: ${editJournalEntryModal.entry.transactions
                            .filter(tx => tx.type === 'credit')
                            .reduce((sum, tx) => sum + tx.amount, 0)
                            .toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6 gap-2">
              <button
                onClick={() => setEditJournalEntryModal({ isOpen: false, entry: null })}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditJournalEntry}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                disabled={!editJournalEntryModal.entry.description.trim() || editJournalEntryModal.entry.transactions.length === 0}
              >
                Save Changes
              </button>
              <button
                onClick={async () => {
                  if (!editJournalEntryModal.entry) return;
                  if (!window.confirm('Are you sure you want to delete this journal entry? This cannot be undone.')) return;
                  await supabase
                    .from('transactions')
                    .delete()
                    .eq('plaid_account_id', 'MANUAL_ENTRY')
                    .eq('date', editJournalEntryModal.entry.date)
                    .eq('description', editJournalEntryModal.entry.description);
                  setEditJournalEntryModal({ isOpen: false, entry: null });
                  fetchPastJournalEntries();
                  refreshAll();
                }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('toAdd')}
            className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'toAdd'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            To Add
            {imported.length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                {imported.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('added')}
            className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'added'
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Added
            {confirmed.length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                {confirmed.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'toAdd' && (
          <div className="space-y-2">
            <h2 className="font-semibold text-base mb-1 flex items-center">
              To Add
              {(() => {
                const selected = accounts.find(a => a.plaid_account_id === selectedAccountId);
                if (!selected || selected.is_manual) return null;
                return (
                  <span className="ml-4 text-gray-500 text-sm font-normal">
                    (Current Balance: ${currentBalance.toFixed(2)})
                  </span>
                );
              })()}
            </h2>
            <input
              type="text"
              placeholder="Search transactions..."
              value={toAddSearchQuery}
              onChange={e => setToAddSearchQuery(e.target.value)}
              className="border px-2 py-1 w-full text-xs mb-2"
            />
            <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-1 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={imported.length > 0 && selectedToAdd.size === imported.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedToAdd(new Set(imported.map(tx => tx.id)))
                        } else {
                          setSelectedToAdd(new Set())
                        }
                      }}
                      className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                  </th>
                  <th 
                    className="border p-1 w-8 text-center cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('date', 'toAdd')}
                  >
                    Date {toAddSortConfig.key === 'date' && (toAddSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="border p-1 w-8 text-center cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('description', 'toAdd')}
                  >
                    Description {toAddSortConfig.key === 'description' && (toAddSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="border p-1 w-8 text-center">Spent</th>
                  <th className="border p-1 w-8 text-center">Received</th>
                  <th className="border p-1 w-8 text-center">Payee</th>
                  <th className="border p-1 w-8 text-center">Category</th>
                  <th className="border p-1 w-8 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {imported.map(tx => {
                  const category = categories.find(c => c.id === selectedCategories[tx.id]);
                  return (
                    <tr key={tx.id}>
                      <td className="border p-1 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={selectedToAdd.has(tx.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedToAdd)
                            if (e.target.checked) {
                              newSelected.add(tx.id)
                            } else {
                              newSelected.delete(tx.id)
                            }
                            setSelectedToAdd(newSelected)
                          }}
                          className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                      </td>
                      <td className="border p-1 w-8 text-center text-xs">{formatDate(tx.date)}</td>
                      <td className="border p-1 w-8 text-center text-xs" style={{ minWidth: 250 }}>{tx.description}</td>
                      <td className="border p-1 w-8 text-center">{tx.spent ? `$${tx.spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}</td>
                      <td className="border p-1 w-8 text-center">{tx.received ? `$${tx.received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}</td>
                      <td className="border p-1 w-8 text-center" style={{ minWidth: 150 }}>
                        <Select
                          options={payeeOptions}
                          value={payeeOptions.find(opt => opt.value === selectedPayees[tx.id]) || payeeOptions[0]}
                          onChange={(selectedOption) => {
                            const option = selectedOption as SelectOption | null;
                            if (option?.value === 'add_new') {
                              setNewPayeeModal({ 
                                isOpen: true, 
                                name: '', 
                                transactionId: tx.id 
                              });
                            } else if (option?.value) {
                              setSelectedPayees(prev => ({
                                ...prev,
                                [tx.id]: option.value
                              }));
                            }
                          }}
                          isSearchable
                          styles={{ 
                            control: (base) => ({ 
                              ...base, 
                              minHeight: '30px', 
                              fontSize: '0.875rem'
                            }) 
                          }}
                        />
                      </td>
                      <td className="border p-1 w-8 text-center" style={{ minWidth: 150 }}>
                        <Select
                          options={categoryOptions}
                          value={categoryOptions.find(opt => opt.value === selectedCategories[tx.id]) || categoryOptions[0]}
                          onChange={(selectedOption) => {
                            const option = selectedOption as SelectOption | null;
                            if (option?.value === 'add_new') {
                              setNewCategoryModal({ 
                                isOpen: true, 
                                name: '', 
                                type: 'Expense', 
                                parent_id: null, 
                                transactionId: tx.id 
                              });
                            } else if (option?.value) {
                              setSelectedCategories(prev => ({
                                ...prev,
                                [tx.id]: option.value
                              }));
                            }
                          }}
                          isSearchable
                          styles={{ 
                            control: (base) => ({ 
                              ...base, 
                              minHeight: '30px', 
                              fontSize: '0.875rem'
                            }) 
                          }}
                        />
                      </td>
                      <td className="border p-1 w-8 text-center">
                        <button
                          onClick={async () => {
                            if (selectedCategories[tx.id]) {
                              await addTransaction(tx, selectedCategories[tx.id], selectedPayees[tx.id]);
                              setSelectedCategories(prev => {
                                const copy = { ...prev };
                                delete copy[tx.id];
                                return copy;
                              });
                              setSelectedPayees(prev => {
                                const copy = { ...prev };
                                delete copy[tx.id];
                                return copy;
                              });
                              setSelectedToAdd(prev => {
                                const next = new Set(prev)
                                next.delete(tx.id)
                                return next
                              })
                            }
                          }}
                          className="border px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                          disabled={!selectedCategories[tx.id]}
                        >
                          Add
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {selectedToAdd.size > 0 && (() => {
              const selectedTransactions = imported.filter(tx => selectedToAdd.has(tx.id));
              return (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={async () => {
                      for (const tx of selectedTransactions) {
                        if (selectedCategories[tx.id]) {
                          await addTransaction(tx, selectedCategories[tx.id], selectedPayees[tx.id]);
                        }
                      }
                      setSelectedCategories(prev => {
                        const copy = { ...prev };
                        selectedTransactions.forEach(tx => delete copy[tx.id]);
                        return copy;
                      });
                      setSelectedPayees(prev => {
                        const copy = { ...prev };
                        selectedTransactions.forEach(tx => delete copy[tx.id]);
                        return copy;
                      });
                      setSelectedToAdd(new Set());
                    }}
                    className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    disabled={!selectedTransactions.every(tx => selectedCategories[tx.id])}
                  >
                    Add Selected ({selectedToAdd.size})
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'added' && (
          <div className="space-y-2">
            <h2 className="font-semibold text-base mb-1 flex items-center">
              Added
            </h2>
            <input
              type="text"
              placeholder="Search transactions..."
              value={addedSearchQuery}
              onChange={e => setAddedSearchQuery(e.target.value)}
              className="border px-2 py-1 w-full text-xs mb-2"
            />
            <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-1 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={confirmed.length > 0 && selectedAdded.size === confirmed.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAdded(new Set(confirmed.map(tx => tx.id)))
                        } else {
                          setSelectedAdded(new Set())
                        }
                      }}
                      className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                  </th>
                  <th 
                    className="border p-1 w-8 text-center cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('date', 'added')}
                  >
                    Date {addedSortConfig.key === 'date' && (addedSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="border p-1 w-8 text-center cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('description', 'added')}
                  >
                    Description {addedSortConfig.key === 'description' && (addedSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="border p-1 w-8 text-center">Spent</th>
                  <th className="border p-1 w-8 text-center">Received</th>
                  <th className="border p-1 w-8 text-center">Payee</th>
                  <th className="border p-1 w-8 text-center">Category</th>
                  <th className="border p-1 w-8 text-center">Undo</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map(tx => {
                  const category = categories.find(c => c.id === tx.selected_category_id);
                  return (
                    <tr 
                      key={tx.id}
                      onClick={(e) => {
                        // Only open modal if click is not in the first column
                        if ((e.target as HTMLElement).closest('td:first-child')) return;
                        setEditModal({ isOpen: true, transaction: tx });
                      }}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="border p-1 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={selectedAdded.has(tx.id)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedAdded)
                            if (e.target.checked) {
                              newSelected.add(tx.id)
                            } else {
                              newSelected.delete(tx.id)
                            }
                            setSelectedAdded(newSelected)
                          }}
                          className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        />
                      </td>
                      <td className="border p-1 w-8 text-center text-xs">{formatDate(tx.date)}</td>
                      <td className="border p-1 w-8 text-center text-xs" style={{ minWidth: 250 }}>{tx.description}</td>
                      <td className="border p-1 w-8 text-center">{tx.spent ? `$${tx.spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}</td>
                      <td className="border p-1 w-8 text-center">{tx.received ? `$${tx.received.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}</td>
                      <td className="border p-1 w-8 text-center" style={{ minWidth: 150 }}>
                        {(() => {
                          const payee = payees.find(p => p.id === tx.payee_id);
                          return payee ? payee.name : '';
                        })()}
                      </td>
                      <td className="border p-1 w-8 text-center" style={{ minWidth: 150 }}>{category ? category.name : 'Uncategorized'}</td>
                      <td className="border p-1 w-8 text-center">
                        <button
                          onClick={e => { e.stopPropagation(); undoTransaction(tx); }}
                          className="border px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                        >
                          Undo
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {selectedAdded.size > 0 && (() => {
              const selectedConfirmed = confirmed.filter(tx => selectedAdded.has(tx.id));
              return (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={async () => {
                      for (const tx of selectedConfirmed) {
                        await undoTransaction(tx);
                      }
                      setSelectedAdded(new Set());
                    }}
                    className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
                  >
                    Undo Selected ({selectedAdded.size})
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Account Selection Modal */}
      {accountSelectionModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
          <div className="bg-white rounded-lg p-6 w-[600px] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Link Accounts</h2>
              <button
                onClick={() => setAccountSelectionModal({ isOpen: false, accounts: [] })}
                className="text-gray-500 hover:text-gray-700 text-xl"
                disabled={importProgress.isImporting}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Select the accounts you want to link and choose a start date for importing transactions.
            </p>

            {!importProgress.isImporting ? (
              <>
                <div className="space-y-4">
                  {accountSelectionModal.accounts.map((account, index) => (
                    <div key={account.id} className="space-y-2 p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id={`account-${account.id}`}
                          checked={account.selected}
                          onChange={(e) => {
                            const newAccounts = [...accountSelectionModal.accounts];
                            newAccounts[index].selected = e.target.checked;
                            setAccountSelectionModal(prev => ({
                              ...prev,
                              accounts: newAccounts
                            }));
                          }}
                          className="h-4 w-4 text-gray-900 focus:ring-gray-900 border-gray-300 rounded"
                        />
                        <label
                          htmlFor={`account-${account.id}`}
                          className="flex-1 text-sm font-medium text-gray-900 cursor-pointer"
                        >
                          {account.name}
                        </label>
                      </div>
                      <div className="ml-7">
                        <label className="block text-sm text-gray-600 mb-1">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={account.startDate}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => {
                            const newAccounts = [...accountSelectionModal.accounts];
                            newAccounts[index].startDate = e.target.value;
                            setAccountSelectionModal(prev => ({
                              ...prev,
                              accounts: newAccounts
                            }));
                          }}
                          className="w-full border px-2 py-1 rounded text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setAccountSelectionModal({ isOpen: false, accounts: [] })}
                    className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAccountAndDateSelection}
                    disabled={!accountSelectionModal.accounts.some(acc => acc.selected)}
                    className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Link Now
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>{importProgress.currentStep}</span>
                    <span>{importProgress.progress} of {importProgress.totalSteps}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-gray-900 h-2.5 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(importProgress.progress / importProgress.totalSteps) * 100}%` 
                      }}
                    />
                  </div>
                </div>
                <p className="text-sm text-gray-500 italic">
                  Please wait while we link your accounts and import transactions...
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
