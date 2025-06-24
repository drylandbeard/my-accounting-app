import { create } from 'zustand';
import { api } from '@/lib/api';
import { FinancialAmount } from '@/lib/financial';

// Types
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

export interface TransactionRequest {
  transaction: Transaction;
  selectedCategoryId: string;
  selectedPayeeId?: string;
}

export interface Automation {
  id: string;
  automation_type: 'payee' | 'category';
  condition_type: string;
  condition_value: string;
  action_value: string;
  auto_add?: boolean;
  enabled: boolean;
  company_id: string;
}

// Store interface
interface TransactionsState {
  // Core data
  importedTransactions: Transaction[];
  confirmedTransactions: Transaction[];
  accounts: Account[];
  
  // UI state for transaction selections
  selectedCategories: { [txId: string]: string };
  selectedPayees: { [txId: string]: string };
  selectedAccountId: string | null;
  
  // Loading states
  isLoading: boolean;
  isAddingTransactions: boolean;
  isUndoingTransactions: boolean;
  processingTransactions: Set<string>;
  
  // Error state
  error: string | null;
  
  // Highlighting for real-time updates
  highlightedTransactionIds: Set<string>;
  lastActionTransactionId: string | null;
  
  // Automation state
  isAutoAddRunning: boolean;
  autoAddedTransactions: Set<string>;
  
  // Actions - Data fetching
  refreshImportedTransactions: () => Promise<void>;
  refreshConfirmedTransactions: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  refreshAll: () => Promise<void>;
  
  // Actions - Transaction operations
  addTransaction: (tx: Transaction, selectedCategoryId: string, selectedPayeeId?: string) => Promise<boolean>;
  addTransactions: (requests: TransactionRequest[]) => Promise<boolean>;
  undoTransaction: (tx: Transaction) => Promise<boolean>;
  undoTransactions: (transactions: Transaction[]) => Promise<boolean>;
  
  // Actions - Category and payee selections
  setSelectedCategory: (txId: string, categoryId: string) => void;
  setSelectedPayee: (txId: string, payeeId: string) => void;
  clearSelections: (txIds: string[]) => void;
  bulkSetSelectedCategories: (selections: { [txId: string]: string }) => void;
  bulkSetSelectedPayees: (selections: { [txId: string]: string }) => void;
  
  // Actions - Account management
  setSelectedAccount: (accountId: string | null) => void;
  
  // Actions - Automation
  applyAutomationsToTransactions: () => Promise<void>;
  markTransactionAsAutoAdded: (transaction: Transaction) => void;
  clearAutoAddedTracking: () => void;
  
  // Actions - Utility
  highlightTransaction: (transactionId: string) => void;
  clearError: () => void;
  
  // Helper functions
  getTransactionContentHash: (tx: Transaction) => string;
  getFilteredImportedTransactions: (accountId?: string | null) => Transaction[];
  getFilteredConfirmedTransactions: (accountId?: string | null, selectedAccountIdInCOA?: string) => Transaction[];
}

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  // Initial state
  importedTransactions: [],
  confirmedTransactions: [],
  accounts: [],
  selectedCategories: {},
  selectedPayees: {},
  selectedAccountId: null,
  isLoading: false,
  isAddingTransactions: false,
  isUndoingTransactions: false,
  processingTransactions: new Set(),
  error: null,
  highlightedTransactionIds: new Set(),
  lastActionTransactionId: null,
  isAutoAddRunning: false,
  autoAddedTransactions: new Set(),
  
  // Data fetching actions
  refreshImportedTransactions: async () => {
    try {
      const response = await api.get('/api/transactions/imported');
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error refreshing imported transactions:', errorData.error);
        set({ error: errorData.error || 'Failed to refresh imported transactions' });
        return;
      }
      
      const result = await response.json();
      const transactions = result.transactions || [];
      
      // Clear auto-added tracking when imported transactions change
      // Only keep content hashes that still exist in the imported list
      const { autoAddedTransactions, getTransactionContentHash } = get();
      const importedContentHashes = new Set(transactions.map((tx: Transaction) => getTransactionContentHash(tx)));
      const newAutoAddedSet = new Set<string>();
      autoAddedTransactions.forEach(contentHash => {
        if (importedContentHashes.has(contentHash)) {
          newAutoAddedSet.add(contentHash);
        }
      });
      
      set({ 
        importedTransactions: transactions,
        autoAddedTransactions: newAutoAddedSet,
        error: null 
      });
    } catch (err) {
      console.error('Error in refreshImportedTransactions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh imported transactions';
      set({ error: errorMessage });
    }
  },
  
  refreshConfirmedTransactions: async () => {
    try {
      const response = await api.get('/api/transactions/confirmed');
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error refreshing confirmed transactions:', errorData.error);
        set({ error: errorData.error || 'Failed to refresh confirmed transactions' });
        return;
      }
      
      const result = await response.json();
      set({ 
        confirmedTransactions: result.transactions || [],
        error: null 
      });
    } catch (err) {
      console.error('Error in refreshConfirmedTransactions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh confirmed transactions';
      set({ error: errorMessage });
    }
  },
  
  refreshAccounts: async () => {
    try {
      const response = await api.get('/api/accounts');
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error refreshing accounts:', errorData.error);
        set({ error: errorData.error || 'Failed to refresh accounts' });
        return;
      }
      
      const result = await response.json();
      const accounts = result.accounts || [];
      
      // Auto-select first account if none selected
      const { selectedAccountId } = get();
      if (accounts.length > 0 && !selectedAccountId) {
        set({ selectedAccountId: accounts[0].plaid_account_id });
      }
      
      set({ 
        accounts,
        error: null 
      });
    } catch (err) {
      console.error('Error in refreshAccounts:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh accounts';
      set({ error: errorMessage });
    }
  },
  
  refreshAll: async () => {
    set({ isLoading: true });
    try {
      await Promise.all([
        get().refreshImportedTransactions(),
        get().refreshConfirmedTransactions(),
        get().refreshAccounts()
      ]);
    } finally {
      set({ isLoading: false });
    }
  },
  
  // Transaction operations
  addTransaction: async (tx: Transaction, selectedCategoryId: string, selectedPayeeId?: string) => {
    return get().addTransactions([{
      transaction: tx,
      selectedCategoryId,
      selectedPayeeId
    }]);
  },
  
  addTransactions: async (requests: TransactionRequest[]) => {
    if (requests.length === 0) return true;
    
    set({ isAddingTransactions: true });
    
    // Mark transactions as processing
    const processingIds = new Set(requests.map(req => req.transaction.id));
    set(state => ({
      processingTransactions: new Set([...state.processingTransactions, ...processingIds])
    }));
    
    try {
      // Prepare bulk request
      const bulkRequest = {
        transactions: requests.map(req => ({
          imported_transaction_id: req.transaction.id,
          selected_category_id: req.selectedCategoryId,
          corresponding_category_id: req.selectedCategoryId, // This should be set properly based on account
          payee_id: req.selectedPayeeId
        }))
      };
      
      const response = await api.post('/api/transactions/move-to-added', bulkRequest);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to move transactions');
      }
      
      // Refresh data after successful operation
      await get().refreshAll();
      
      // Highlight the first transaction that was moved
      if (requests.length > 0) {
        get().highlightTransaction(requests[0].transaction.id);
      }
      
      return true;
    } catch (err) {
      console.error('Error in addTransactions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to add transactions';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isAddingTransactions: false });
      
      // Remove transactions from processing set
      set(state => {
        const newSet = new Set(state.processingTransactions);
        processingIds.forEach(id => newSet.delete(id));
        return { processingTransactions: newSet };
      });
    }
  },
  
  undoTransaction: async (tx: Transaction) => {
    return get().undoTransactions([tx]);
  },
  
  undoTransactions: async (transactions: Transaction[]) => {
    if (transactions.length === 0) return true;
    
    set({ isUndoingTransactions: true });
    
    // Mark transactions as processing
    const processingIds = new Set(transactions.map(tx => tx.id));
    set(state => ({
      processingTransactions: new Set([...state.processingTransactions, ...processingIds])
    }));
    
    try {
      // Validate all transactions have IDs
      for (const tx of transactions) {
        if (!tx || !tx.id) {
          throw new Error('Invalid transaction: missing ID');
        }
      }
      
      const response = await api.post('/api/transactions/undo-added', {
        transaction_ids: transactions.map(tx => tx.id)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to undo transactions');
      }
      
      // Refresh data after successful operation
      await get().refreshAll();
      
      // Highlight the first transaction that was undone
      if (transactions.length > 0) {
        get().highlightTransaction(transactions[0].id);
      }
      
      return true;
    } catch (err) {
      console.error('Error in undoTransactions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to undo transactions';
      set({ error: errorMessage });
      return false;
    } finally {
      set({ isUndoingTransactions: false });
      
      // Remove transactions from processing set
      set(state => {
        const newSet = new Set(state.processingTransactions);
        processingIds.forEach(id => newSet.delete(id));
        return { processingTransactions: newSet };
      });
    }
  },
  
  // Category and payee selection actions
  setSelectedCategory: (txId: string, categoryId: string) => {
    set(state => ({
      selectedCategories: {
        ...state.selectedCategories,
        [txId]: categoryId
      }
    }));
  },
  
  setSelectedPayee: (txId: string, payeeId: string) => {
    set(state => ({
      selectedPayees: {
        ...state.selectedPayees,
        [txId]: payeeId
      }
    }));
  },
  
  clearSelections: (txIds: string[]) => {
    set(state => {
      const newSelectedCategories = { ...state.selectedCategories };
      const newSelectedPayees = { ...state.selectedPayees };
      
      txIds.forEach(txId => {
        delete newSelectedCategories[txId];
        delete newSelectedPayees[txId];
      });
      
      return {
        selectedCategories: newSelectedCategories,
        selectedPayees: newSelectedPayees
      };
    });
  },
  
  bulkSetSelectedCategories: (selections: { [txId: string]: string }) => {
    set(state => ({
      selectedCategories: {
        ...state.selectedCategories,
        ...selections
      }
    }));
  },
  
  bulkSetSelectedPayees: (selections: { [txId: string]: string }) => {
    set(state => ({
      selectedPayees: {
        ...state.selectedPayees,
        ...selections
      }
    }));
  },
  
  // Account management
  setSelectedAccount: (accountId: string | null) => {
    set({ selectedAccountId: accountId });
  },
  
  // Automation
  applyAutomationsToTransactions: async () => {
    const { 
      isAutoAddRunning, 
      selectedAccountId, 
      importedTransactions,
      selectedCategories,
      selectedPayees,
      autoAddedTransactions,
      getTransactionContentHash
    } = get();
    
    // Prevent concurrent executions
    if (isAutoAddRunning) return;
    
    set({ isAutoAddRunning: true });
    
    try {
      // Fetch automations - this would need to be implemented
      const response = await api.get('/api/automations');
      
      if (!response.ok) {
        console.error('Failed to fetch automations');
        return;
      }
      
      const result = await response.json();
      const automations = result.automations || [];
      
             // Separate automations by type
       const payeeAutomations = automations.filter((a: Automation) => a.automation_type === 'payee');
       const categoryAutomations = automations.filter((a: Automation) => a.automation_type === 'category');
       
       if (payeeAutomations.length === 0 && categoryAutomations.length === 0) {
         return;
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
       
       const newSelectedCategories: { [txId: string]: string } = {};
       const newSelectedPayees: { [txId: string]: string } = {};
       const transactionsToAutoAdd: string[] = [];
       
       // Apply automations to each imported transaction
       const transactionsToProcess = importedTransactions
         .filter(tx => tx.plaid_account_id === selectedAccountId);
       
       for (const transaction of transactionsToProcess) {
         // Skip if already has manual selections
         if (selectedCategories[transaction.id] || selectedPayees[transaction.id]) {
           continue;
         }
         
        // Check payee automations first
        for (const payeeAutomation of payeeAutomations) {
          if (doesDescriptionMatch(
            transaction.description,
            payeeAutomation.condition_type,
            payeeAutomation.condition_value
          )) {
            // Find the payee ID by name - would need payees from payeesStore
            // This would need to be implemented to access payees store
            // For now, we'll skip this part
            break;
          }
        }
        
        // Check category automations
        for (const categoryAutomation of categoryAutomations) {
          if (doesDescriptionMatch(
            transaction.description,
            categoryAutomation.condition_type,
            categoryAutomation.condition_value
          )) {
            // Find the category ID by name - would need categories from categoriesStore
            // This would need to be implemented to access categories store
            // For now, we'll skip this part
            break;
          }
        }
        
        // TODO: Check if category is set and category automation has auto_add enabled
        // This will be implemented when automation logic is complete
        // if (newSelectedCategories[transaction.id] && appliedCategoryAutomation?.auto_add === true) {
        //   transactionsToAutoAdd.push(transaction.id);
        // }
      }
      
      // Update state with automation-applied values
      if (Object.keys(newSelectedCategories).length > 0) {
        get().bulkSetSelectedCategories(newSelectedCategories);
      }
      
      if (Object.keys(newSelectedPayees).length > 0) {
        get().bulkSetSelectedPayees(newSelectedPayees);
      }
      
      // Auto-add transactions that meet the criteria (only if not already auto-added)
      const transactionsToActuallyAutoAdd = transactionsToAutoAdd.filter(txId => {
        const transaction = transactionsToProcess.find(tx => tx.id === txId);
        if (!transaction) return false;
        const contentHash = getTransactionContentHash(transaction);
        return !autoAddedTransactions.has(contentHash);
      });
      
      if (transactionsToActuallyAutoAdd.length > 0) {
        // Mark these transactions as being auto-added to prevent duplicates
        const newAutoAddedHashes = new Set(autoAddedTransactions);
        transactionsToActuallyAutoAdd.forEach(txId => {
          const transaction = transactionsToProcess.find(tx => tx.id === txId);
          if (transaction) {
            const contentHash = getTransactionContentHash(transaction);
            newAutoAddedHashes.add(contentHash);
          }
        });
        set({ autoAddedTransactions: newAutoAddedHashes });
        
        // Process auto-add transactions
        const transactionRequests = transactionsToActuallyAutoAdd
          .map(transactionId => {
            const transaction = transactionsToProcess.find(tx => tx.id === transactionId);
            if (transaction && newSelectedCategories[transactionId]) {
              return {
                transaction,
                selectedCategoryId: newSelectedCategories[transactionId],
                selectedPayeeId: newSelectedPayees[transactionId]
              };
            }
            return null;
          })
          .filter(req => req !== null) as TransactionRequest[];
        
        if (transactionRequests.length > 0) {
          try {
            await get().addTransactions(transactionRequests);
            
            // Clean up state for auto-added transactions
            const txIds = transactionRequests.map(req => req.transaction.id);
            get().clearSelections(txIds);
          } catch (error) {
            console.error('Error auto-adding transactions:', error);
            // Remove from auto-added set if there was an error so they can be retried
            const revertedHashes = new Set(autoAddedTransactions);
            transactionRequests.forEach(req => {
              const contentHash = getTransactionContentHash(req.transaction);
              revertedHashes.delete(contentHash);
            });
            set({ autoAddedTransactions: revertedHashes });
          }
        }
      }
      
    } catch (error) {
      console.error('Error applying automations to transactions:', error);
    } finally {
      set({ isAutoAddRunning: false });
    }
  },
  
  markTransactionAsAutoAdded: (transaction: Transaction) => {
    const { autoAddedTransactions, getTransactionContentHash } = get();
    const contentHash = getTransactionContentHash(transaction);
    const newSet = new Set(autoAddedTransactions);
    newSet.add(contentHash);
    set({ autoAddedTransactions: newSet });
  },
  
  clearAutoAddedTracking: () => {
    set({ autoAddedTransactions: new Set() });
  },
  
  // Utility actions
  highlightTransaction: (transactionId: string) => {
    const { highlightedTransactionIds } = get();
    const newHighlightedIds = new Set(highlightedTransactionIds);
    newHighlightedIds.add(transactionId);
    
    set({ 
      highlightedTransactionIds: newHighlightedIds,
      lastActionTransactionId: transactionId 
    });
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      const currentState = get();
      const updatedIds = new Set(currentState.highlightedTransactionIds);
      updatedIds.delete(transactionId);
      
      set({
        highlightedTransactionIds: updatedIds,
        lastActionTransactionId: currentState.lastActionTransactionId === transactionId ? null : currentState.lastActionTransactionId
      });
    }, 3000);
  },
  
  clearError: () => {
    set({ error: null });
  },
  
  // Helper functions
  getTransactionContentHash: (tx: Transaction) => {
    return `${tx.date}_${tx.description}_${tx.spent || '0'}_${tx.received || '0'}_${tx.plaid_account_id}`;
  },
  
  getFilteredImportedTransactions: (accountId?: string | null) => {
    const { importedTransactions, selectedAccountId } = get();
    const filterAccountId = accountId !== undefined ? accountId : selectedAccountId;
    return importedTransactions.filter(tx => tx.plaid_account_id === filterAccountId);
  },
  
  getFilteredConfirmedTransactions: (accountId?: string | null, selectedAccountIdInCOA?: string) => {
    const { confirmedTransactions, selectedAccountId } = get();
    const filterAccountId = accountId !== undefined ? accountId : selectedAccountId;
    
    return confirmedTransactions.filter(tx => {
      if (tx.plaid_account_id === filterAccountId) return true;
      if (tx.plaid_account_id === 'MANUAL_ENTRY') {
        return tx.selected_category_id === selectedAccountIdInCOA || tx.corresponding_category_id === selectedAccountIdInCOA;
      }
      return false;
    });
  },
}));
