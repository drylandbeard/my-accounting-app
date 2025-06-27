import { create } from 'zustand';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { FinancialAmount } from '@/lib/financial';

// Enhanced error handling types
export interface StoreError {
  code: string;
  message: string;
  details?: unknown;
  timestamp: Date;
}

export interface StoreResult<T = void> {
  success: boolean;
  data?: T;
  error?: StoreError;
}

// Add automation types
export interface Automation {
  id: string;
  automation_type: 'payee' | 'category';
  condition_type: 'contains' | 'is_exactly';
  condition_value: string;
  action_value: string;
  auto_add?: boolean;
  enabled: boolean;
  name: string;
}

export interface AutomationResult {
  appliedCategories: { [txId: string]: string };
  appliedPayees: { [txId: string]: string };
  autoAddTransactions: string[];
}

// Error handling utility for store operations
const handleStoreOperation = async <T>(
  operation: () => Promise<T>,
  errorContext: string
): Promise<StoreResult<T>> => {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const storeError: StoreError = {
      code: errorContext.toUpperCase().replace(/\s/g, '_'),
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      details: error,
      timestamp: new Date()
    };
    
    console.error(`Store Error [${errorContext}]:`, storeError);
    return { success: false, error: storeError };
  }
};

// Types
export interface Account {
  plaid_account_id: string | null;
  name: string;
  starting_balance: FinancialAmount | null;
  current_balance: FinancialAmount | null;
  last_synced: string | null;
  is_manual?: boolean;
  plaid_account_name?: string;
  institution_name?: string;
  type?: string;
  created_at?: string;
  subtype?: string;
  display_order?: number;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount?: FinancialAmount;
  plaid_account_id: string | null;
  plaid_account_name: string | null;
  selected_category_id?: string;
  corresponding_category_id?: string;
  spent?: FinancialAmount;
  received?: FinancialAmount;
  payee_id?: string;
  company_id?: string;
  split_data?: SplitData;
  has_split?: boolean; // Added to track if transaction has multiple journal entries
}

export interface BulkTransactionRequest {
  transaction: Transaction;
  selectedCategoryId: string;
  selectedPayeeId?: string;
}

// Plaid metadata types
export interface PlaidAccount {
  id: string;
  name?: string;
}

export interface PlaidMetadata {
  accounts: PlaidAccount[];
}

// Journal entry types
export interface JournalTransaction {
  account_id: string;
  account_name: string;
  amount: number;
  type: 'debit' | 'credit';
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  transactions: JournalTransaction[];
}

export interface SplitData {
  splits: {
    id?: string;
    date?: string;
    description?: string;
    spent?: string;
    received?: string;
    payee_id?: string;
    selected_category_id?: string;
  }[];
}

export interface SplitItem {
  id: string;
  date: string;
  description: string;
  spent?: string;
  received?: string;
  payee_id?: string;
  selected_category_id?: string;
}

// Journal entry types for table display
export interface JournalTableEntry {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  transaction_id: string;
  chart_account_id: string;
  company_id: string;
  split_data?: SplitData; // Added to track split data at journal level
  transactions?: {
    payee_id?: string;
    split_data?: SplitData;
    description?: string;
  };
  // Fields for split items displayed as journal entries
  is_split_item?: boolean;
  split_item_data?: SplitItem;
  [key: string]: unknown; // Allow dynamic property access for additional columns
}

// Store interface
interface TransactionsState {
  // Core data states
  linkToken: string | null;
  selectedAccountId: string | null;
  accounts: Account[];
  importedTransactions: Transaction[];
  transactions: Transaction[];
  journalEntries: JournalTableEntry[];
  
  // Loading states for main operations
  isLoading: boolean;
  isSyncing: boolean;
  isAddingTransactions: boolean;
  isUndoingTransactions: boolean;
  
  // Error handling
  error: string | null;
  notification: { type: 'success' | 'error'; message: string } | null;
  
  // Real-time subscriptions state
  subscriptions: ReturnType<typeof supabase.channel>[];
  
  // Actions
  setLinkToken: (token: string | null) => void;
  setSelectedAccountId: (accountId: string | null) => void;
  setNotification: (notification: { type: 'success' | 'error'; message: string } | null) => void;
  clearError: () => void;
  
  // Data fetching
  createLinkToken: () => Promise<void>;
  fetchAccounts: (companyId: string) => Promise<void>;
  fetchImportedTransactions: (companyId: string) => Promise<void>;
  fetchConfirmedTransactions: (companyId: string) => Promise<void>;
  fetchJournalEntries: (companyId: string) => Promise<void>;
  refreshAll: (companyId: string) => Promise<void>;
  
  // Transaction operations
  addTransactions: (transactionRequests: BulkTransactionRequest[], correspondingCategoryId: string, companyId: string) => Promise<boolean>;
  undoTransactions: (transactionIds: string[], companyId: string) => Promise<boolean>;
  updateTransaction: (transactionId: string, updates: Partial<Transaction>, companyId: string) => Promise<boolean>;
  syncTransactions: (companyId: string) => Promise<{ success: boolean; newTransactions?: number }>;
  
  // Plaid operations
  handlePlaidSuccess: (publicToken: string, metadata: PlaidMetadata) => Promise<{ success: boolean; accounts?: PlaidAccount[] }>;
  linkAccountsWithDates: (accountSelections: { id: string; name: string; selected: boolean; access_token: string; item_id: string; startDate: string }[]) => Promise<boolean>;
  
  // Account management
  updateAccountName: (accountId: string, newName: string, companyId: string) => Promise<boolean>;
  createManualAccount: (accountData: { name: string; type: string; startingBalance: string }, companyId: string) => Promise<{ success: boolean; accountId?: string; error?: string }>;
  updateAccountNames: (accounts: { id: string; name: string; order?: number }[], companyId: string) => Promise<boolean>;
  deleteAccount: (accountId: string, companyId: string) => Promise<boolean>;
  
  // Journal operations
  saveJournalEntry: (entryData: { date: string; description: string; entries: { account_id: string; amount: number; type: 'debit' | 'credit' }[] }, companyId: string) => Promise<boolean>;
  fetchPastJournalEntries: (companyId: string) => Promise<JournalEntry[]>;
  updateJournalEntry: (entryData: { id: string; date: string; description: string; transactions: { account_id: string; account_name: string; amount: number; type: 'debit' | 'credit' }[] }, companyId: string) => Promise<boolean>;
  deleteJournalEntry: (entryData: { id?: string; date: string; description: string }, companyId: string) => Promise<boolean>;
  
  // CSV Import
  importTransactionsFromCSV: (transactions: Transaction[], companyId: string) => Promise<{ success: boolean; count?: number; error?: string }>;
  
  // Real-time subscriptions
  subscribeToTransactions: (companyId: string) => () => void;
  unsubscribeFromTransactions: () => void;
  
  // Enhanced AI-friendly methods that return StoreResult
  createLinkTokenSafe: () => Promise<StoreResult<void>>;
  addTransactionsSafe: (transactionRequests: BulkTransactionRequest[], correspondingCategoryId: string, companyId: string) => Promise<StoreResult<boolean>>;
  undoTransactionsSafe: (transactionIds: string[], companyId: string) => Promise<StoreResult<boolean>>;
  syncTransactionsSafe: (companyId: string) => Promise<StoreResult<{ success: boolean; newTransactions?: number }>>;
  
  // Additional AI helper methods
  getTransactionsSafe: (companyId: string) => Promise<StoreResult<Transaction[]>>;
  getAccountsSafe: (companyId: string) => Promise<StoreResult<Account[]>>;
  
  // Automation functions
  applyAutomationsToTransactions: (companyId: string, selectedAccountId: string | null, categories: { id: string; name: string }[], payees: { id: string; name: string }[]) => Promise<StoreResult<AutomationResult>>;
}

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  // Initial state
  linkToken: null,
  selectedAccountId: null,
  accounts: [],
  importedTransactions: [],
  transactions: [],
  journalEntries: [],
  isLoading: false,
  isSyncing: false,
  isAddingTransactions: false,
  isUndoingTransactions: false,
  error: null,
  notification: null,
  subscriptions: [],
  
  // Basic setters
  setLinkToken: (token) => set({ linkToken: token }),
  setSelectedAccountId: (accountId) => set({ selectedAccountId: accountId }),
  setNotification: (notification) => set({ notification }),
  clearError: () => set({ error: null }),
  
  // Create Plaid link token
  createLinkToken: async () => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await api.get('/api/1-create-link-token');
      const data = await response.json();
      
      if (data.linkToken) {
        set({ linkToken: data.linkToken });
      } else {
        throw new Error('No link token received');
      }
    } catch (error) {
      console.error('Failed to create link token:', error);
      set({ error: 'Failed to create link token' });
    } finally {
      set({ isLoading: false });
    }
  },
  
  // Fetch accounts
  fetchAccounts: async (companyId: string) => {
    try {
      const { data } = await supabase
        .from('accounts')
        .select('*')
        .eq('company_id', companyId)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      
      const accounts = data || [];
      set({ accounts });
      
      // Auto-select first account if none selected
      const { selectedAccountId } = get();
      if (accounts.length > 0 && !selectedAccountId) {
        set({ selectedAccountId: accounts[0].plaid_account_id });
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
      set({ error: 'Failed to fetch accounts' });
    }
  },
  
  // Fetch imported transactions
  fetchImportedTransactions: async (companyId: string) => {
    try {
      const { data } = await supabase
        .from('imported_transactions')
        .select('id, date, description, spent, received, plaid_account_id, plaid_account_name, selected_category_id, payee_id, company_id, split_data')
        .eq('company_id', companyId)
        .neq('plaid_account_name', null);
      
      set({ importedTransactions: data || [] });
    } catch (error) {
      console.error('Error fetching imported transactions:', error);
      set({ error: 'Failed to fetch imported transactions' });
    }
  },
  
  // Fetch confirmed transactions
  fetchConfirmedTransactions: async (companyId: string) => {
    try {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, description, spent, received, plaid_account_id, plaid_account_name, selected_category_id, corresponding_category_id, payee_id, company_id, split_data')
        .eq('company_id', companyId)
        .neq('plaid_account_name', null);
      
      if (data && data.length > 0) {
        // Get journal entry counts for each transaction to detect splits
        const transactionIds = data.map(tx => tx.id);
        const { data: journalCounts } = await supabase
          .from('journal')
          .select('transaction_id')
          .eq('company_id', companyId)
          .in('transaction_id', transactionIds);
        
        // Count journal entries per transaction
        const journalCountMap = new Map<string, number>();
        (journalCounts || []).forEach(entry => {
          const count = journalCountMap.get(entry.transaction_id) || 0;
          journalCountMap.set(entry.transaction_id, count + 1);
        });
        
        // Add split detection to transactions
        const transactionsWithSplitInfo = data.map(tx => ({
          ...tx,
          // A transaction is split if it has more than 2 journal entries
          has_split: (journalCountMap.get(tx.id) || 0) > 2
        }));
        
        set({ transactions: transactionsWithSplitInfo });
      } else {
        set({ transactions: [] });
      }
    } catch (error) {
      console.error('Error fetching confirmed transactions:', error);
      set({ error: 'Failed to fetch confirmed transactions' });
    }
  },

  // Fetch journal entries directly from the journal table
  fetchJournalEntries: async (companyId: string) => {
    try {
      // Fetch journal entries directly from the journal table with related data
      const { data: journalEntries, error } = await supabase
        .from('journal')
        .select(`
          *,
          transactions!inner(payee_id, split_data, corresponding_category_id)
        `)
        .eq('company_id', companyId)
        .order('date', { ascending: false });

      if (error) throw error;

      // Process the journal entries to match the expected format
      const processedEntries: JournalTableEntry[] = (journalEntries || []).map((entry: {
        id: string;
        date: string;
        description: string;
        debit: number;
        credit: number;
        transaction_id: string;
        chart_account_id: string;
        company_id: string;
        transactions: {
          payee_id?: string;
          split_data?: SplitData;
          corresponding_category_id: string;
        };
      }) => {
        // Check if this journal entry is part of a split transaction
        const hasSplitData = entry.transactions?.split_data?.splits && entry.transactions.split_data.splits.length > 0;
        
        if (hasSplitData) {
          // Find the matching split item for this journal entry
          const matchingSplit = entry.transactions.split_data!.splits.find((split) => 
            // Match by category for expense/income journal entries, or by being the bank account entry
            split.selected_category_id === entry.chart_account_id ||
            entry.chart_account_id === entry.transactions.corresponding_category_id
          );

          if (matchingSplit && entry.chart_account_id !== entry.transactions.corresponding_category_id) {
            // This is a split item (not the bank account entry)
            return {
              ...entry,
              is_split_item: true,
              split_item_data: {
                id: matchingSplit.id || entry.id,
                date: matchingSplit.date || entry.date,
                description: matchingSplit.description || entry.description,
                spent: matchingSplit.spent,
                received: matchingSplit.received,
                payee_id: matchingSplit.payee_id,
                selected_category_id: matchingSplit.selected_category_id
              }
            };
          }
        }

        // Regular journal entry (no split or bank account entry)
        return {
          ...entry,
          is_split_item: false
        };
      });
      
      set({ journalEntries: processedEntries });
    } catch (error) {
      console.error('Error fetching journal entries:', error);
      set({ error: 'Failed to fetch journal entries' });
    }
  },
  
  // Refresh all data
  refreshAll: async (companyId: string) => {
    await Promise.all([
      get().fetchAccounts(companyId),
      get().fetchImportedTransactions(companyId),
      get().fetchConfirmedTransactions(companyId),
      get().fetchJournalEntries(companyId)
    ]);
  },
  
  // Add transactions (bulk operation)
  addTransactions: async (transactionRequests: BulkTransactionRequest[], correspondingCategoryId: string, companyId: string) => {
    if (transactionRequests.length === 0) return false;
    
    try {
      set({ isAddingTransactions: true, error: null });
      
      // Prepare bulk request
      const bulkRequest = {
        transactions: transactionRequests.map(req => ({
          imported_transaction_id: req.transaction.id,
          selected_category_id: req.selectedCategoryId,
          corresponding_category_id: correspondingCategoryId, // Account category ID
          payee_id: req.selectedPayeeId
        }))
      };
      
      const response = await api.post('/api/transactions/move-to-added', bulkRequest);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to move transactions');
      }
      
      // Refresh data after successful operation
      await get().refreshAll(companyId);
      
      set({ 
        notification: { 
          type: 'success', 
          message: `Successfully added ${transactionRequests.length} transactions!` 
        } 
      });
      
      return true;
    } catch (error) {
      console.error('Error adding transactions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add transactions';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isAddingTransactions: false });
    }
  },
  
  // Undo transactions (bulk operation)
  undoTransactions: async (transactionIds: string[], companyId: string) => {
    if (transactionIds.length === 0) return false;
    
    try {
      set({ isUndoingTransactions: true, error: null });
      
      const response = await api.post('/api/transactions/undo-added', {
        transaction_ids: transactionIds
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to undo transactions');
      }
      
      // Refresh data after successful operation
      await get().refreshAll(companyId);
      
      set({ 
        notification: { 
          type: 'success', 
          message: `Successfully undid ${transactionIds.length} transactions!` 
        } 
      });
      
      return true;
    } catch (error) {
      console.error('Error undoing transactions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to undo transactions';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isUndoingTransactions: false });
    }
  },
  
  // Update single transaction
  updateTransaction: async (transactionId: string, updates: Partial<Transaction & { splits?: SplitItem[] }>, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      // The API will determine which table to update based on where the transaction exists
      const requestData: {
        transactionId: string;
        companyId: string;
        date?: string;
        description?: string;
        spent?: string;
        received?: string;
        payeeId?: string;
        selectedCategoryId?: string;
        correspondingCategoryId?: string;
        isSplitTransaction?: boolean;
        splits?: SplitItem[];
      } = {
        transactionId,
        companyId,
        date: updates.date,
        description: updates.description,
        spent: updates.spent,
        received: updates.received,
        payeeId: updates.payee_id,
        selectedCategoryId: updates.selected_category_id, // Fix: use correct field name
        correspondingCategoryId: updates.corresponding_category_id
      };

      // Add split data if present
      if (updates.splits && updates.splits.length > 0) {
        requestData.isSplitTransaction = true;
        requestData.splits = updates.splits;
      }
      
      const response = await api.post('/api/transactions/update', requestData);
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update transaction');
      }
      
      // Refresh data
      await get().refreshAll(companyId);
      
      set({ 
        notification: { 
          type: 'success', 
          message: 'Transaction updated successfully!' 
        } 
      });
      
      return true;
    } catch (error) {
      console.error('Error updating transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update transaction';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },
  
  // Sync transactions with Plaid
  syncTransactions: async (companyId: string) => {
    try {
      set({ isSyncing: true, error: null });
      
      // Use the API route to sync all transactions for the company
      const response = await api.post('/api/transactions/sync', {
        companyId: companyId
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync transactions');
      }

      const data = await response.json();
      const totalNewTransactions = data.newTransactions || 0;

      // Refresh all data
      await get().refreshAll(companyId);
      
      const message = totalNewTransactions > 0 
        ? `Sync complete! Found ${totalNewTransactions} new transactions.`
        : 'Sync complete! No new transactions found.';
        
      set({ 
        notification: { type: 'success', message } 
      });
      
      return { success: true, newTransactions: totalNewTransactions };
    } catch (error) {
      console.error('Error syncing transactions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync transactions';
      set({ error: errorMessage });
      return { success: false };
    } finally {
      set({ isSyncing: false });
    }
  },
  
  // Handle Plaid success (exchange public token)
  handlePlaidSuccess: async (publicToken: string, metadata: PlaidMetadata) => {
    try {
      set({ isLoading: true, error: null });
      
      // First, get the access token
      const response = await api.post('/api/2-exchange-public-token', { public_token: publicToken });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to exchange public token');
      }
      
      // Return account selection data for the UI to handle
      return {
        success: true,
        accounts: metadata.accounts.map((account: PlaidAccount) => ({
          id: account.id,
          name: account.name || 'new account',
          selected: true,
          access_token: data.access_token,
          item_id: data.item_id,
          startDate: new Date().toISOString().split('T')[0]
        }))
      };
    } catch (error) {
      console.error('Error in Plaid success handler:', error);
      set({ error: 'Failed to connect accounts. Please try again.' });
      return { success: false };
    } finally {
      set({ isLoading: false });
    }
  },
  
  // Link accounts with specific dates
  linkAccountsWithDates: async (accountSelections: { id: string; name: string; selected: boolean; access_token: string; item_id: string; startDate: string }[]) => {
    try {
      set({ isLoading: true, error: null });
      
      const selectedAccounts = accountSelections.filter(acc => acc.selected);
      
      if (selectedAccounts.length === 0) {
        throw new Error('Please select at least one account');
      }
      
      // Validate dates aren't in the future
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      
      for (const account of selectedAccounts) {
        const [year, month, day] = account.startDate.split('-').map(Number);
        const selectedDate = new Date(year, month - 1, day);
        if (selectedDate > today) {
          throw new Error('Start date cannot be in the future');
        }
      }
      
      const { access_token, item_id } = selectedAccounts[0];
      const selectedAccountIds = selectedAccounts.map(acc => acc.id);
      
      // Step 3: Store accounts in database
      const accountsResponse = await api.post('/api/3-store-plaid-accounts-as-accounts', { 
        accessToken: access_token, 
        itemId: item_id,
        selectedAccountIds: selectedAccountIds
      });
      
      if (!accountsResponse.ok) {
        const error = await accountsResponse.json();
        throw new Error(error.error || 'Failed to store accounts');
      }
      
      // Step 4: Create chart of accounts entries
      const coaResponse = await api.post('/api/4-store-plaid-accounts-as-categories', { 
        accessToken: access_token, 
        itemId: item_id,
        selectedAccountIds: selectedAccountIds
      });
      
      if (!coaResponse.ok) {
        const error = await coaResponse.json();
        throw new Error(error.error || 'Failed to create chart of accounts entries');
      }
      
      // Step 5: Import transactions
      const accountDateMap = selectedAccounts.reduce((map, account) => {
        map[account.id] = account.startDate;
        return map;
      }, {} as Record<string, string>);
      
      const transactionsResponse = await api.post('/api/5-import-transactions-to-categorize', {
        accessToken: access_token,
        itemId: item_id,
        accountDateMap: accountDateMap,
        selectedAccountIds: selectedAccountIds
      });
      
      if (!transactionsResponse.ok) {
        const error = await transactionsResponse.json();
        throw new Error(error.error || 'Failed to import transactions');
      }
      
      const accountsResult = await accountsResponse.json();
      const transactionsResult = await transactionsResponse.json();
      
      const totalAccounts = accountsResult.count || 0;
      const totalTransactions = transactionsResult.count || 0;
      
      set({ 
        notification: { 
          type: 'success', 
          message: `Successfully linked ${totalAccounts} accounts and imported ${totalTransactions} transactions!` 
        } 
      });
      
      return true;
    } catch (error) {
      console.error('Error linking accounts:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to link accounts';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // Account management functions
  updateAccountName: async (accountId: string, newName: string, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      await supabase
        .from('accounts')
        .update({ name: newName.trim() })
        .eq('plaid_account_id', accountId)
        .eq('company_id', companyId);

      await supabase
        .from('chart_of_accounts')
        .update({ name: newName.trim() })
        .eq('plaid_account_id', accountId)
        .eq('company_id', companyId);

      // Refresh accounts data
      await get().fetchAccounts(companyId);
      
      set({ 
        notification: { type: 'success', message: 'Account name updated successfully!' } 
      });

      return true;
    } catch (error) {
      console.error('Error updating account name:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update account name';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  createManualAccount: async (accountData, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      const response = await api.post('/api/accounts/create-manual', {
        name: accountData.name.trim(),
        type: accountData.type,
        startingBalance: accountData.startingBalance || '0'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create manual account');
      }

      const data = await response.json();

      // Refresh accounts data
      await get().fetchAccounts(companyId);
      
      // Set as selected account
      set({ selectedAccountId: data.accountId });

      set({ 
        notification: { 
          type: 'success', 
          message: data.message || 'Manual account created successfully!' 
        } 
      });

      return { success: true, accountId: data.accountId };
    } catch (error) {
      console.error('Error creating manual account:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create manual account';
      set({ error: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      set({ isLoading: false });
    }
  },

  updateAccountNames: async (accounts, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      const response = await api.put('/api/accounts/update-names', {
        accounts: accounts.map(account => ({
          id: account.id,
          name: account.name,
          order: account.order || 0
        }))
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update account names');
      }

      // Refresh accounts data
      await get().fetchAccounts(companyId);
      
      set({ 
        notification: { type: 'success', message: 'Account names updated successfully!' } 
      });

      return true;
    } catch (error) {
      console.error('Error updating account names:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update account names';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteAccount: async (accountId: string, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      const response = await api.delete('/api/accounts/delete', {
        body: JSON.stringify({ accountId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete account');
      }

      // Refresh accounts data
      await get().fetchAccounts(companyId);
      
      // If the deleted account was selected, select the first remaining account
      const { selectedAccountId, accounts } = get();
      if (selectedAccountId === accountId && accounts.length > 0) {
        set({ selectedAccountId: accounts[0].plaid_account_id });
      }

      set({ 
        notification: { type: 'success', message: 'Account deleted successfully!' } 
      });

      return true;
    } catch (error) {
      console.error('Error deleting account:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete account';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // Journal operations
  saveJournalEntry: async (entryData, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      // Validate that debits equal credits
      const totalDebits = entryData.entries
        .filter(e => e.type === 'debit')
        .reduce((sum, e) => sum + e.amount, 0);
      const totalCredits = entryData.entries
        .filter(e => e.type === 'credit')
        .reduce((sum, e) => sum + e.amount, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error('Total debits must equal total credits');
      }

      // Validate that both lines have account_id and nonzero amount
      for (const entry of entryData.entries) {
        if (!entry.account_id || !entry.amount || entry.amount <= 0) {
          throw new Error('Each line must have an account and a nonzero amount.');
        }
      }

      // Get the selected account ID for the journal entry
      const { selectedAccountId } = get();
      if (!selectedAccountId) {
        throw new Error('No account selected for journal entry');
      }

      // Save journal entry via API
      const response = await api.post('/api/journal/create', {
        date: entryData.date,
        description: entryData.description,
        entries: entryData.entries,
        selectedAccountId: selectedAccountId
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save journal entry');
      }

      // Refresh data
      await get().refreshAll(companyId);

      set({ 
        notification: { type: 'success', message: 'Journal entry saved successfully!' } 
      });

      return true;
    } catch (error) {
      console.error('Error saving journal entry:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save journal entry';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  fetchPastJournalEntries: async (companyId: string) => {
    try {
      const response = await api.get(`/api/journal/entries?companyId=${companyId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch journal entries');
      }

      const data = await response.json();
      return data.entries || [];
    } catch (error) {
      console.error('Error fetching past journal entries:', error);
      set({ error: 'Failed to fetch journal entries' });
      return [];
    }
  },

  updateJournalEntry: async (entryData, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      // Validate that debits equal credits
      const totalDebits = entryData.transactions
        .filter(tx => tx.type === 'debit')
        .reduce((sum, tx) => sum + tx.amount, 0);
      const totalCredits = entryData.transactions
        .filter(tx => tx.type === 'credit')
        .reduce((sum, tx) => sum + tx.amount, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error('Total debits must equal total credits');
      }

      // Update journal entry via API
      const response = await api.put('/api/journal/update', {
        id: entryData.id,
        date: entryData.date,
        description: entryData.description,
        transactions: entryData.transactions
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update journal entry');
      }

      // Refresh data
      await get().refreshAll(companyId);

      set({ 
        notification: { type: 'success', message: 'Journal entry updated successfully!' } 
      });

      return true;
    } catch (error) {
      console.error('Error updating journal entry:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update journal entry';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteJournalEntry: async (entryData: { id?: string; date: string; description: string }, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      const response = await api.delete('/api/journal/delete', {
        body: JSON.stringify({
          id: entryData.id,
          date: entryData.date,
          description: entryData.description
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete journal entry');
      }

      // Refresh data
      await get().refreshAll(companyId);

      set({ 
        notification: { type: 'success', message: 'Journal entry deleted successfully!' } 
      });

      return true;
    } catch (error) {
      console.error('Error deleting journal entry:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete journal entry';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // CSV Import
  importTransactionsFromCSV: async (transactions, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      if (transactions.length === 0) {
        throw new Error('No transactions selected for import.');
      }

      // Prepare data for insertion - ensure all required fields are present
      const transactionsToInsert = transactions.map(tx => ({
        date: tx.date,
        description: tx.description,
        spent: tx.spent || '0.0000',
        received: tx.received || '0.0000',
        plaid_account_id: tx.plaid_account_id,
        plaid_account_name: tx.plaid_account_name,
        company_id: companyId
      }));

      // Import transactions via API
      const response = await api.post('/api/transactions/import-csv', {
        transactions: transactionsToInsert
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import transactions');
      }

      const data = await response.json();

      if (!data) {
        throw new Error('No data returned from insert');
      }

      // Refresh the transactions list
      await get().refreshAll(companyId);

      set({ 
        notification: { 
          type: 'success', 
          message: `Successfully imported ${transactions.length} transactions!` 
        } 
      });

      return { success: true, count: transactions.length };
    } catch (error) {
      console.error('CSV Import error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to import transactions. Please try again.';
      set({ error: errorMessage });
      return { success: false, error: errorMessage };
    } finally {
      set({ isLoading: false });
    }
  },

  // Real-time subscription functions
  subscribeToTransactions: (companyId: string) => {
    // Clean up existing subscriptions first
    get().unsubscribeFromTransactions();

    const subscriptions: ReturnType<typeof supabase.channel>[] = [];

    // Subscribe to imported transactions changes
    const importedTxSubscription = supabase
      .channel('imported_transactions_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'imported_transactions',
        filter: `company_id=eq.${companyId}`
      }, (payload) => {
        console.log('Imported transactions changed:', payload.eventType);
        get().fetchImportedTransactions(companyId);
      })
      .subscribe();

    // Subscribe to confirmed transactions changes
    const confirmedTxSubscription = supabase
      .channel('transactions_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `company_id=eq.${companyId}`
      }, (payload) => {
        console.log('Transactions changed:', payload.eventType);
        get().fetchConfirmedTransactions(companyId);
      })
      .subscribe();

    subscriptions.push(importedTxSubscription, confirmedTxSubscription);
    set({ subscriptions });

    // Return cleanup function
    return () => {
      subscriptions.forEach(subscription => {
        supabase.removeChannel(subscription);
      });
      set({ subscriptions: [] });
    };
  },

  unsubscribeFromTransactions: () => {
    const { subscriptions } = get();
    subscriptions.forEach(subscription => {
      supabase.removeChannel(subscription);
    });
    set({ subscriptions: [] });
  },
  
  // Enhanced AI-friendly methods that return StoreResult
  createLinkTokenSafe: () => handleStoreOperation(() => get().createLinkToken(), 'createLinkTokenSafe'),
  addTransactionsSafe: (transactionRequests: BulkTransactionRequest[], correspondingCategoryId: string, companyId: string) => handleStoreOperation(() => get().addTransactions(transactionRequests, correspondingCategoryId, companyId), 'addTransactionsSafe'),
  undoTransactionsSafe: (transactionIds: string[], companyId: string) => handleStoreOperation(() => get().undoTransactions(transactionIds, companyId), 'undoTransactionsSafe'),
  syncTransactionsSafe: (companyId: string) => handleStoreOperation(() => get().syncTransactions(companyId), 'syncTransactionsSafe'),
  
  // Additional AI helper methods
  getTransactionsSafe: (companyId: string) => handleStoreOperation(async () => {
    await get().fetchImportedTransactions(companyId);
    return get().importedTransactions;
  }, 'getTransactionsSafe'),
  getAccountsSafe: (companyId: string) => handleStoreOperation(async () => {
    await get().fetchAccounts(companyId);
    return get().accounts;
  }, 'getAccountsSafe'),
  
  // Automation functions
  applyAutomationsToTransactions: async (companyId: string, selectedAccountId: string | null, categories: { id: string; name: string }[], payees: { id: string; name: string }[]) => {
    return handleStoreOperation(async () => {
      if (!selectedAccountId) {
        throw new Error('No account selected for automation');
      }

      // Fetch automations
      const { data: automations, error: automationsError } = await supabase
        .from('automations')
        .select('*')
        .eq('company_id', companyId)
        .eq('enabled', true)
        .order('name');

      if (automationsError || !automations) {
        throw new Error('Failed to fetch automations');
      }

      // Separate automations by type
      const payeeAutomations = automations.filter((a: Automation) => a.automation_type === 'payee');
      const categoryAutomations = automations.filter((a: Automation) => a.automation_type === 'category');

      if (payeeAutomations.length === 0 && categoryAutomations.length === 0) {
        return {
          appliedCategories: {},
          appliedPayees: {},
          autoAddTransactions: []
        };
      }

      // Helper function to check if description matches automation condition
      const doesDescriptionMatch = (description: string, conditionType: string, conditionValue: string): boolean => {
        const desc = description.toLowerCase();
        const condition = conditionValue.toLowerCase();

        switch (conditionType) {
          case 'contains':
            return desc.includes(condition);
          case 'is_exactly':
            return desc === condition;
          default:
            return false;
        }
      };

      const appliedCategories: { [txId: string]: string } = {};
      const appliedPayees: { [txId: string]: string } = {};
      const autoAddTransactions: string[] = [];

      // Apply automations to each imported transaction
      const transactionsToProcess = get().importedTransactions
        .filter(tx => tx.plaid_account_id === selectedAccountId);

      for (const transaction of transactionsToProcess) {
        let appliedCategoryAutomation: Automation | null = null;

        // Check payee automations first
        for (const payeeAutomation of payeeAutomations) {
          if (doesDescriptionMatch(
            transaction.description,
            payeeAutomation.condition_type,
            payeeAutomation.condition_value
          )) {
            // Find the payee ID by name
            const payee = payees.find(p => 
              p.name.toLowerCase() === payeeAutomation.action_value.toLowerCase()
            );
            if (payee) {
              appliedPayees[transaction.id] = payee.id;
              break; // Take first matching automation
            }
          }
        }

        // Check category automations
        for (const categoryAutomation of categoryAutomations) {
          if (doesDescriptionMatch(
            transaction.description,
            categoryAutomation.condition_type,
            categoryAutomation.condition_value
          )) {
            // Find the category ID by name
            const category = categories.find(c => 
              c.name.toLowerCase() === categoryAutomation.action_value.toLowerCase()
            );
            if (category) {
              appliedCategories[transaction.id] = category.id;
              appliedCategoryAutomation = categoryAutomation;
              break; // Take first matching automation
            }
          }
        }

        // Check if category is set and category automation has auto_add enabled
        if (appliedCategories[transaction.id] && appliedCategoryAutomation?.auto_add === true) {
          autoAddTransactions.push(transaction.id);
        }
      }

      return {
        appliedCategories,
        appliedPayees,
        autoAddTransactions
      };
    }, 'applyAutomationsToTransactions');
  }
}));
