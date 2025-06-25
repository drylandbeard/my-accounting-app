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

// Store interface
interface TransactionsState {
  // Core data states
  linkToken: string | null;
  selectedAccountId: string | null;
  accounts: Account[];
  importedTransactions: Transaction[];
  transactions: Transaction[];
  
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
  deleteJournalEntry: (entryData: { date: string; description: string }, companyId: string) => Promise<boolean>;
  
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
}

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  // Initial state
  linkToken: null,
  selectedAccountId: null,
  accounts: [],
  importedTransactions: [],
  transactions: [],
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
        .select('id, date, description, spent, received, plaid_account_id, plaid_account_name, selected_category_id, payee_id, company_id')
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
        .select('id, date, description, spent, received, plaid_account_id, plaid_account_name, selected_category_id, corresponding_category_id, payee_id, company_id')
        .eq('company_id', companyId)
        .neq('plaid_account_name', null);
      
      set({ transactions: data || [] });
    } catch (error) {
      console.error('Error fetching confirmed transactions:', error);
      set({ error: 'Failed to fetch confirmed transactions' });
    }
  },
  
  // Refresh all data
  refreshAll: async (companyId: string) => {
    await Promise.all([
      get().fetchAccounts(companyId),
      get().fetchImportedTransactions(companyId),
      get().fetchConfirmedTransactions(companyId)
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
  updateTransaction: async (transactionId: string, updates: Partial<Transaction>, companyId: string) => {
    try {
      set({ isLoading: true, error: null });
      
      const response = await api.post('/api/transactions/update', {
        transactionId,
        companyId,
        ...updates
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update transaction');
      }
      
      // Sync journal after successful update
      await api.post('/api/journal/sync', {});
      
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
      let totalNewTransactions = 0;
      
      // Get all connected Plaid accounts for current company
      const { data: plaidItems } = await supabase
        .from('plaid_items')
        .select('access_token, item_id')
        .eq('company_id', companyId);

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
          .eq('company_id', companyId);

        if (!itemAccounts || itemAccounts.length === 0) {
          console.log(`No accounts found for item ${item.item_id}`);
          continue;
        }

        const accountIds = itemAccounts.map(acc => acc.plaid_account_id);

        // Find the latest transaction date for this item's accounts
        const { data: latestTransaction } = await supabase
          .from('imported_transactions')
          .select('date')
          .eq('company_id', companyId)
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

        const response = await api.post('/api/transactions/sync', {
          access_token: item.access_token,
          item_id: item.item_id,
          start_date: startDate,
          selected_account_ids: accountIds
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to sync transactions');
        }

        const data = await response.json();
        if (data.newTransactions) {
          totalNewTransactions += data.newTransactions;
        }
      }

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

      const manualAccountId = crypto.randomUUID();
      const startingBalance = accountData.startingBalance || '0';
      const startingBalanceNum = parseFloat(startingBalance);

      // Insert into accounts table
      const { error: accountError } = await supabase.from('accounts').insert({
        plaid_account_id: manualAccountId,
        name: accountData.name.trim(),
        type: accountData.type,
        starting_balance: startingBalance,
        current_balance: startingBalance,
        last_synced: new Date().toISOString(),
        plaid_item_id: 'MANUAL_ENTRY',
        is_manual: true,
        company_id: companyId
      });

      if (accountError) {
        throw new Error(accountError.message);
      }

      // Insert into chart_of_accounts table
      const { error: coaError } = await supabase.from('chart_of_accounts').insert({
        name: accountData.name.trim(),
        type: accountData.type,
        plaid_account_id: manualAccountId,
        company_id: companyId
      });

      if (coaError) {
        throw new Error(coaError.message);
      }

      // Create starting balance transaction if starting balance is not zero
      if (startingBalanceNum !== 0) {
        const spent = startingBalanceNum < 0 ? Math.abs(startingBalanceNum) : 0;
        const received = startingBalanceNum > 0 ? startingBalanceNum : 0;

        await supabase.from('imported_transactions').insert({
          date: new Date().toISOString().split('T')[0],
          description: 'Starting Balance',
          plaid_account_id: manualAccountId,
          plaid_account_name: accountData.name.trim(),
          item_id: 'MANUAL_ENTRY',
          company_id: companyId,
          spent: spent.toFixed(4),
          received: received.toFixed(4)
        });
      }

      // Refresh accounts data
      await get().fetchAccounts(companyId);
      
      // Set as selected account
      set({ selectedAccountId: manualAccountId });

      set({ 
        notification: { 
          type: 'success', 
          message: `Manual account created successfully${startingBalanceNum !== 0 ? ' with starting balance transaction!' : '!'}` 
        } 
      });

      return { success: true, accountId: manualAccountId };
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

      for (const account of accounts) {
        if (account.id) {
          // Update accounts table - update both name and display_order
          await supabase
            .from('accounts')
            .update({ 
              name: account.name,
              display_order: account.order || 0
            })
            .eq('plaid_account_id', account.id)
            .eq('company_id', companyId);

          // Update chart_of_accounts table
          await supabase
            .from('chart_of_accounts')
            .update({ name: account.name })
            .eq('plaid_account_id', account.id)
            .eq('company_id', companyId);
        }
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

      // Delete from accounts table
      await supabase
        .from('accounts')
        .delete()
        .eq('plaid_account_id', accountId)
        .eq('company_id', companyId);

      // Delete from chart_of_accounts table
      await supabase
        .from('chart_of_accounts')
        .delete()
        .eq('plaid_account_id', accountId)
        .eq('company_id', companyId);

      // Delete related transactions
      await supabase
        .from('transactions')
        .delete()
        .eq('plaid_account_id', accountId)
        .eq('company_id', companyId);

      // Delete related imported transactions
      await supabase
        .from('imported_transactions')
        .delete()
        .eq('plaid_account_id', accountId)
        .eq('company_id', companyId);

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

      // Insert transactions
      for (const entry of entryData.entries) {
        await supabase.from('transactions').insert([{
          date: entryData.date,
          description: entryData.description,
          spent: entry.type === 'debit' ? entry.amount.toFixed(4) : '0.0000',
          received: entry.type === 'credit' ? entry.amount.toFixed(4) : '0.0000',
          selected_category_id: entry.account_id,
          corresponding_category_id: null,
          plaid_account_id: 'MANUAL_ENTRY',
          plaid_account_name: 'Manual Journal Entry',
          company_id: companyId
        }]);
      }

      // Automatically sync the journal after saving
      await api.post('/api/journal/sync', {});

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
      const { data: transactions } = await supabase
        .from('transactions')
        .select('*')
        .eq('plaid_account_id', 'MANUAL_ENTRY')
        .eq('company_id', companyId)
        .order('date', { ascending: false });

      if (transactions) {
        // Group transactions by description and date to form journal entries
        const groupedEntries = transactions.reduce((acc: Record<string, JournalEntry>, tx) => {
          const key = `${tx.date}_${tx.description}`;
          if (!acc[key]) {
            acc[key] = {
              id: tx.id,
              date: tx.date,
              description: tx.description,
              transactions: []
            };
          }
          
          acc[key].transactions.push({
            account_id: tx.selected_category_id || tx.corresponding_category_id,
            account_name: 'Unknown Account', // Will be populated by caller if needed
            amount: typeof tx.amount === 'number' ? tx.amount : (tx.spent ?? tx.received ?? 0),
            type: tx.selected_category_id ? 'debit' : 'credit'
          });
          
          return acc;
        }, {});

        return Object.values(groupedEntries);
      }

      return [];
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

      // Delete existing transactions
      await supabase
        .from('transactions')
        .delete()
        .eq('plaid_account_id', 'MANUAL_ENTRY')
        .eq('date', entryData.date)
        .eq('description', entryData.description)
        .eq('company_id', companyId);

      // Create new transactions
      for (const tx of entryData.transactions) {
        await supabase.from('transactions').insert([{
          date: entryData.date,
          description: entryData.description,
          spent: tx.type === 'debit' ? tx.amount.toFixed(4) : '0.0000',
          received: tx.type === 'credit' ? tx.amount.toFixed(4) : '0.0000',
          selected_category_id: tx.account_id,
          corresponding_category_id: null,
          plaid_account_id: 'MANUAL_ENTRY',
          plaid_account_name: 'Manual Journal Entry',
          company_id: companyId
        }]);
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

  deleteJournalEntry: async (entryData, companyId: string) => {
    try {
      set({ isLoading: true, error: null });

      await supabase
        .from('transactions')
        .delete()
        .eq('plaid_account_id', 'MANUAL_ENTRY')
        .eq('date', entryData.date)
        .eq('description', entryData.description)
        .eq('company_id', companyId);

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

      // Insert selected transactions into imported_transactions
      const { data, error } = await supabase
        .from('imported_transactions')
        .insert(transactionsToInsert)
        .select();

      if (error) {
        throw new Error(error.message);
      }

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
  }, 'getAccountsSafe')
}));
