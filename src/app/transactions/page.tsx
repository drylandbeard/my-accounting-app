'use client'

import { useEffect, useState, useRef } from 'react'
import { usePlaidLink } from 'react-plaid-link'


import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'
import { X, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/zustand/authStore'
import { useTransactionsStore, Transaction as StoreTransaction, SplitData as StoreSplitData } from '@/zustand/transactionsStore'
import { useCategoriesStore } from '@/zustand/categoriesStore'
import { usePayeesStore } from '@/zustand/payeesStore'
import { api } from '@/lib/api'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Select } from '@/components/ui/select'
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination'
import { 
  FinancialAmount, 
  formatAmount, 
  toFinancialAmount, 
  calculateNetAmount, 
  sumAmounts, 
  subtractAmounts,
  isZeroAmount,
  isPositiveAmount,
  compareAmounts 
} from '@/lib/financial'

// @dnd-kit imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Use Transaction type from store
type Transaction = StoreTransaction

type SplitItem = {
  id: string
  date: string
  description: string
  spent?: FinancialAmount
  received?: FinancialAmount
  payee_id?: string
  selected_category_id?: string
}

// Type guard function to check if split_data has the expected structure
const isSplitData = (data: unknown): data is StoreSplitData => {
  return typeof data === 'object' && 
         data !== null && 
         'splits' in data && 
         Array.isArray((data as StoreSplitData).splits);
}

// Category and Payee types now come from stores

type Account = {
  plaid_account_id: string | null
  name: string // Database column is 'name'
  starting_balance: FinancialAmount | null
  current_balance: FinancialAmount | null
  last_synced: string | null
  is_manual?: boolean
  plaid_account_name?: string // Add missing property
  institution_name?: string
  type?: string
  created_at?: string
  subtype?: string
  display_order?: number // Add display order for sorting
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
  key: 'date' | 'description' | 'amount' | 'spent' | 'received' | null;
  direction: 'asc' | 'desc';
}

type SelectOption = {
  value: string;
  label: string;
};

// Sortable Account Item Component
function SortableAccountItem({ account, onNameChange, onDelete, deleteConfirmation, onDeleteConfirmationChange, accountToDelete }: {
  account: { id: string; name: string; order?: number };
  index?: number;
  onNameChange: (value: string) => void;
  onDelete: () => void;
  deleteConfirmation: string;
  onDeleteConfirmationChange: (value: string) => void;
  accountToDelete: string | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`space-y-2 p-2 border rounded transition-colors ${
        isDragging ? 'bg-gray-100 shadow-lg' : 'bg-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="text-gray-400 text-sm cursor-grab active:cursor-grabbing hover:text-gray-600"
        >
          ⋮⋮
        </button>
        <input
          type="text"
          value={account.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="flex-1 border px-2 py-1 rounded"
        />
        <button
          onClick={onDelete}
          className="text-red-600 hover:text-red-800 px-2 py-1"
        >
          Delete
        </button>
      </div>
      {accountToDelete === account.id && (
        <div className="bg-red-50 p-3 rounded border border-red-200">
          <p className="text-sm text-red-700 mb-2">
            Warning: This will permanently delete the account and all its transactions.
            Type &quot;delete&quot; to confirm.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => onDeleteConfirmationChange(e.target.value)}
              placeholder="Type 'delete' to confirm"
              className="flex-1 border px-2 py-1 rounded"
            />
            <button
              onClick={() => {
                if (deleteConfirmation === 'delete') {
                  // Call a deletion handler that will be passed from parent
                  onDelete();
                }
              }}
              disabled={deleteConfirmation !== 'delete'}
              className="px-3 py-1 bg-red-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm Delete
            </button>
            <button
              onClick={() => {
                onDeleteConfirmationChange('');
              }}
              className="px-3 py-1 border rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!(currentCompany);
  
  // Use stores for core data
  const {
    linkToken,
    selectedAccountId,
    accounts,
    importedTransactions,
    transactions,
    isSyncing,
    isAddingTransactions,
    isUndoingTransactions,
    notification,
    setSelectedAccountId,
    setNotification,
    createLinkToken,
    refreshAll,
    addTransactions,
    undoTransactions,
    syncTransactions: storeSyncTransactions,
    createManualAccount,
    saveJournalEntry,
    fetchPastJournalEntries,
    applyAutomationsToTransactions,
    subscribeToTransactions,
    updateTransaction,
    updateAccountName,
    updateAccountNames,
    linkAccountsWithDates,
    deleteAccount,
    updateJournalEntry,
    deleteJournalEntry,
    importTransactionsFromCSV
  } = useTransactionsStore();
  
  const { 
    categories, 
    refreshCategories,
    createCategoryForTransaction,
    subscribeToCategories
  } = useCategoriesStore();
  
  const { 
    payees, 
    refreshPayees,
    createPayeeForTransaction,
    subscribeToPayees
  } = usePayeesStore();
  
  // Removed unused searchQuery state
  const [toAddSearchQuery, setToAddSearchQuery] = useState('')
  const [addedSearchQuery, setAddedSearchQuery] = useState('')

  // Add selected categories state
  const [selectedCategories, setSelectedCategories] = useState<{ [txId: string]: string }>({});
  
  // Add selected payees state  
  const [selectedPayees, setSelectedPayees] = useState<{ [txId: string]: string }>({});

  // Add state for tracking react-select input values
  const [payeeInputValues, setPayeeInputValues] = useState<{ [txId: string]: string }>({});
  const [categoryInputValues, setCategoryInputValues] = useState<{ [txId: string]: string }>({});

  // Add state to track which transactions have been auto-added to prevent duplicates
  // Track by content hash instead of ID to handle undo scenarios
  const [autoAddedTransactions, setAutoAddedTransactions] = useState<Set<string>>(new Set());

  // Add ref to prevent concurrent automation executions
  const isAutomationRunning = useRef(false);
  
  // Add state for UI indicator
  const [isAutoAddRunning, setIsAutoAddRunning] = useState(false);

  // Helper function to create a unique content hash for a transaction
  const getTransactionContentHash = (tx: Transaction) => {
    return `${tx.date}_${tx.description}_${tx.spent || '0'}_${tx.received || '0'}_${tx.plaid_account_id}`;
  };

  // Add missing state for multi-select checkboxes
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [selectedAdded, setSelectedAdded] = useState<Set<string>>(new Set());

  // Processing transactions state for individual transaction loading (UI only)
  const [processingTransactions] = useState<Set<string>>(new Set());

  // Add sorting state
  const [toAddSortConfig, setToAddSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [addedSortConfig, setAddedSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });

  // Add pagination state
  const ITEMS_PER_PAGE = 100;
  const [toAddCurrentPage, setToAddCurrentPage] = useState(1);
  const [addedCurrentPage, setAddedCurrentPage] = useState(1);

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
    splits: SplitItem[];
    isSplitMode: boolean;
    isUpdating: boolean;
    validationError: string | null;
  }>({
    isOpen: false,
    transaction: null,
    splits: [],
    isSplitMode: false,
    isUpdating: false,
    validationError: null
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
    accounts: { id: string; name: string; order?: number }[];
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

  const formatLastSyncTime = (lastSynced: string | null | undefined) => {
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

  const formatCreatedAt = (createdAt: string | null | undefined) => {
    if (!createdAt) return 'Unknown';
    const date = new Date(createdAt);
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${month}-${day}-${year}`
  };

  const getTooltipContent = (acc: Account) => (
    <div className="text-left">
      <div className="font-semibold mb-1">{acc.name}</div>
      <div className="space-y-1">
        <div><span className="text-gray-300">Institution:</span> {acc.institution_name || 'Manual Account'}</div>
        <div><span className="text-gray-300">Last Updated:</span> {formatLastSyncTime(acc.last_synced)}</div>
        <div><span className="text-gray-300">Linked On:</span> {formatCreatedAt(acc.created_at)}</div>
      </div>
    </div>
  );

  // Sync function now uses store
  const syncTransactions = async () => {
    if (!hasCompanyContext) return;
    
    await storeSyncTransactions(currentCompany!.id);
    
    // Clear notification after 4 seconds
    setTimeout(() => setNotification(null), 4000);
  };

  // 1️⃣ Plaid Link Token - now handled by store
  useEffect(() => {
    if (hasCompanyContext) {
      createLinkToken();
    }
  }, [hasCompanyContext, createLinkToken])

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
        const res = await api.post('/api/2-exchange-public-token', { public_token });

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
    if (!hasCompanyContext) return;

    setImportProgress({
      isImporting: true,
      currentStep: 'Starting import...',
      progress: 0,
      totalSteps: 3
    });

    try {
      const success = await linkAccountsWithDates(accountSelectionModal.accounts);
      
      if (success) {
        setAccountSelectionModal({ isOpen: false, accounts: [] });
      }
    } catch (error) {
      console.error('Error linking accounts:', error);
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

  // Data fetching now handled by stores

  // Apply automations automatically when transactions or related data changes (UI state only)
  const runAutomationsWithStateUpdate = async () => {
    if (!hasCompanyContext || !currentCompany?.id) return;
    
    // Prevent concurrent executions
    if (isAutomationRunning.current) {
      return;
    }
    
    isAutomationRunning.current = true;
    setIsAutoAddRunning(true);

    try {
      const result = await applyAutomationsToTransactions(
        currentCompany.id,
        selectedAccountId,
        categories,
        payees
      );

      if (result.success && result.data) {
        const { appliedCategories, appliedPayees, autoAddTransactions } = result.data;

        // Update local state with automation-applied values
        if (Object.keys(appliedCategories).length > 0) {
          setSelectedCategories(prev => ({
            ...prev,
            ...appliedCategories
          }));
        }

        if (Object.keys(appliedPayees).length > 0) {
          setSelectedPayees(prev => ({
            ...prev,
            ...appliedPayees
          }));
        }

        // Handle auto-add transactions
        if (autoAddTransactions.length > 0) {
          const transactionsToProcess = importedTransactions
            .filter(tx => tx.plaid_account_id === selectedAccountId);

          // Filter by content hash to prevent duplicates
          const transactionsToActuallyAutoAdd = autoAddTransactions.filter(txId => {
            const transaction = transactionsToProcess.find(tx => tx.id === txId);
            if (!transaction) return false;
            const contentHash = getTransactionContentHash(transaction);
            return !autoAddedTransactions.has(contentHash);
          });

          if (transactionsToActuallyAutoAdd.length > 0) {
            // Mark as auto-added
            setAutoAddedTransactions(prev => {
              const newSet = new Set(prev);
              transactionsToActuallyAutoAdd.forEach(txId => {
                const transaction = transactionsToProcess.find(tx => tx.id === txId);
                if (transaction) {
                  const contentHash = getTransactionContentHash(transaction);
                  newSet.add(contentHash);
                }
              });
              return newSet;
            });

            // Process auto-add
            const transactionRequests = transactionsToActuallyAutoAdd
              .map(transactionId => {
                const transaction = transactionsToProcess.find(tx => tx.id === transactionId);
                if (transaction && appliedCategories[transactionId]) {
                  return {
                    transaction,
                    selectedCategoryId: appliedCategories[transactionId],
                    selectedPayeeId: appliedPayees[transactionId]
                  };
                }
                return null;
              })
              .filter(req => req !== null) as {
                transaction: Transaction;
                selectedCategoryId: string;
                selectedPayeeId?: string;
              }[];

            if (transactionRequests.length > 0 && selectedAccountIdInCOA) {
              try {
                await addTransactions(transactionRequests, selectedAccountIdInCOA, currentCompany.id);
                
                // Clean up state for auto-added transactions
                setSelectedCategories(prev => {
                  const copy = { ...prev };
                  transactionRequests.forEach(req => delete copy[req.transaction.id]);
                  return copy;
                });
                setSelectedPayees(prev => {
                  const copy = { ...prev };
                  transactionRequests.forEach(req => delete copy[req.transaction.id]);
                  return copy;
                });
              } catch (error) {
                console.error('Error auto-adding transactions:', error);
                // Remove from auto-added set if there was an error
                setAutoAddedTransactions(prev => {
                  const newSet = new Set(prev);
                  transactionRequests.forEach(req => {
                    const contentHash = getTransactionContentHash(req.transaction);
                    newSet.delete(contentHash);
                  });
                  return newSet;
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error applying automations:', error);
    } finally {
      isAutomationRunning.current = false;
      setIsAutoAddRunning(false);
    }
  };

  useEffect(() => {
    if (hasCompanyContext && currentCompany?.id) {
      refreshAll(currentCompany.id);
      refreshCategories();
      refreshPayees();
    }
  }, [currentCompany?.id, hasCompanyContext, refreshAll, refreshCategories, refreshPayees]) // Refresh when company changes

  // Real-time subscriptions managed by stores
  useEffect(() => {
    if (!hasCompanyContext || !currentCompany?.id) return;

    // Set up all real-time subscriptions through stores
    const unsubscribeTransactions = subscribeToTransactions(currentCompany.id);
    const unsubscribeCategories = subscribeToCategories(currentCompany.id);
    const unsubscribePayees = subscribeToPayees(currentCompany.id);

    // Cleanup function
    return () => {
      unsubscribeTransactions();
      unsubscribeCategories();
      unsubscribePayees();
    };
  }, [currentCompany?.id, hasCompanyContext, subscribeToTransactions, subscribeToCategories, subscribeToPayees]);

  // Apply automations automatically when transactions or related data changes (UI state only)
  useEffect(() => {
    if (importedTransactions.length > 0 && categories.length > 0 && payees.length > 0 && hasCompanyContext) {
      // Apply automations immediately when data is available
      runAutomationsWithStateUpdate();
    }
  }, [importedTransactions, categories, payees, hasCompanyContext]);

  // Also apply automations when switching to the selected account
  useEffect(() => {
    if (selectedAccountId && importedTransactions.length > 0 && categories.length > 0 && payees.length > 0 && hasCompanyContext) {
      // Apply automations when account selection changes
      runAutomationsWithStateUpdate();
    }
  }, [selectedAccountId, importedTransactions, categories, payees, hasCompanyContext]);

  // Reset pagination when search queries change
  useEffect(() => {
    setToAddCurrentPage(1);
  }, [toAddSearchQuery, selectedAccountId, toAddSortConfig]);

  useEffect(() => {
    setAddedCurrentPage(1);
  }, [addedSearchQuery, selectedAccountId, addedSortConfig]);

  // 3️⃣ Actions - now use store functions
  const addTransaction = async (tx: Transaction, selectedCategoryId: string, selectedPayeeId?: string) => {
    if (!hasCompanyContext) return;
    
    // Find the selected account in chart_of_accounts by plaid_account_id
    const selectedAccount = categories.find(
      c => c.plaid_account_id === selectedAccountId
    );

    if (!selectedAccount) {
      alert(`Account not found in chart of accounts. Please ensure the account "${accounts.find(a => a.plaid_account_id === selectedAccountId)?.name}" is properly set up in your chart of accounts.`);
      return;
    }

    const selectedAccountIdInCOA = selectedAccount.id;
    
    // For single transactions, use bulk operation with array of one
    await addTransactions([{
      transaction: tx,
      selectedCategoryId,
      selectedPayeeId
    }], selectedAccountIdInCOA, currentCompany!.id);
  };

  const undoTransaction = async (tx: Transaction) => {
    if (!hasCompanyContext) return;
    
    // For single transactions, use bulk operation with array of one
    await undoTransactions([tx.id], currentCompany!.id);
  };

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
        const aAmount = a.amount ?? calculateNetAmount(a.spent, a.received);
        const bAmount = b.amount ?? calculateNetAmount(b.spent, b.received);
        const comparison = compareAmounts(aAmount, bAmount);
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }
      if (sortConfig.key === 'spent') {
        const aSpent = a.spent ?? '0.00';
        const bSpent = b.spent ?? '0.00';
        const comparison = compareAmounts(aSpent, bSpent);
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }
      if (sortConfig.key === 'received') {
        const aReceived = a.received ?? '0.00';
        const bReceived = b.received ?? '0.00';
        const comparison = compareAmounts(aReceived, bReceived);
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }
      return 0;
    });
  };

  const handleSort = (key: 'date' | 'description' | 'amount' | 'spent' | 'received', section: 'toAdd' | 'added') => {
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

  // Helper function for pagination
  const getPaginatedData = <T,>(data: T[], currentPage: number, itemsPerPage: number) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      paginatedData: data.slice(startIndex, endIndex),
      totalPages: Math.ceil(data.length / itemsPerPage),
      totalItems: data.length
    };
  };

  // Update the imported transactions to use sorting and pagination
  const importedFiltered = sortTransactions(
    importedTransactions
      .filter(tx => tx.plaid_account_id === selectedAccountId)
      .filter(tx => {
        if (!toAddSearchQuery) return true;
        const q = toAddSearchQuery.toLowerCase();
        const desc = tx.description?.toLowerCase() || '';
        const date = formatDate(tx.date).toLowerCase();
        const spent = tx.spent || '';
        const received = tx.received || '';
        const amount = tx.amount || '';
        // Also search formatted amounts (what user sees in display)
        const spentFormatted = tx.spent ? formatAmount(tx.spent, { showCurrency: false }) : '';
        const receivedFormatted = tx.received ? formatAmount(tx.received, { showCurrency: false }) : '';
        const amountFormatted = tx.amount ? formatAmount(tx.amount, { showCurrency: false }) : '';
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

  const { paginatedData: imported, totalPages: toAddTotalPages } = getPaginatedData(
    importedFiltered,
    toAddCurrentPage,
    ITEMS_PER_PAGE
  );

  // Update the confirmed transactions to use sorting and pagination
  const confirmedFiltered = sortTransactions(
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
        const spent = tx.spent || '';
        const received = tx.received || '';
        const amount = tx.amount || '';
        // Also search formatted amounts (what user sees in display)
        const spentFormatted = tx.spent ? formatAmount(tx.spent, { showCurrency: false }) : '';
        const receivedFormatted = tx.received ? formatAmount(tx.received, { showCurrency: false }) : '';
        const amountFormatted = tx.amount ? formatAmount(tx.amount, { showCurrency: false }) : '';
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

  const { paginatedData: confirmed, totalPages: addedTotalPages } = getPaginatedData(
    confirmedFiltered,
    addedCurrentPage,
    ITEMS_PER_PAGE
  );

  const currentBalance = toFinancialAmount(accounts.find(a => a.plaid_account_id === selectedAccountId)?.current_balance || '0.00')

  // Calculate the Switch Balance for the selected account (only for Added tab)
  // Only sum confirmed transactions - starting balance is included as a "Starting Balance" transaction
  const confirmedAccountTransactions = confirmed.filter(tx => tx.plaid_account_id === selectedAccountId);
  
  const switchBalance = sumAmounts(
    confirmedAccountTransactions.map(tx => calculateNetAmount(tx.spent, tx.received))
  );

  const downloadTemplate = () => {
    const headers = ['Date', 'Description', 'Amount']
    const exampleData = [
      ['01-15-2025', 'Client Payment - Invoice #1001', '1000.00'],
      ['01-16-2025', 'Office Supplies - Staples', '150.75'],
      ['01-17-2025', 'Bank Interest Received', '25.50'],
      ['01-18-2025', 'Monthly Software Subscription', '99.99'],
      ['01-19-2025', 'Customer Refund', '200.00']
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
              amount: toFinancialAmount(amount), // Convert to FinancialAmount string
              spent: amount < 0 ? toFinancialAmount(Math.abs(amount)) : toFinancialAmount(0), // Negative amounts become spent
              received: amount > 0 ? toFinancialAmount(amount) : toFinancialAmount(0), // Positive amounts become received
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

  const handleCsvDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleCsvDrop = (e: React.DragEvent<HTMLDivElement>) => {
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
    if (!editModal.transaction || !hasCompanyContext) return;

    try {
      // Clear previous validation errors and set loading state
      setEditModal(prev => ({ ...prev, isUpdating: true, validationError: null }));

      // If in split mode, handle split transaction validation and updates
      if (editModal.isSplitMode && editModal.splits.length > 0) {
        // Validate each split item
        for (const split of editModal.splits) {
          const splitSpent = split.spent ?? '0.00';
          const splitReceived = split.received ?? '0.00';
          
          // Allow both spent and received to be zero, but at least one split must have a value
          if (isZeroAmount(splitSpent) && isZeroAmount(splitReceived)) {
            setEditModal(prev => ({ ...prev, isUpdating: false, validationError: 'Each split item must have either a spent or received amount.' }));
            return;
          }

          if (!split.selected_category_id) {
            setEditModal(prev => ({ ...prev, isUpdating: false, validationError: 'Each split item must have a category selected.' }));
            return;
          }
        }

        // Calculate net amounts for validation using financial.ts functions
        const originalNetAmount = calculateNetAmount(editModal.transaction.spent, editModal.transaction.received);
        
        // Calculate split net amount: sum of received - sum of spent
        const splitSpentTotal = sumAmounts(editModal.splits.map(s => s.spent ?? '0.00'));
        const splitReceivedTotal = sumAmounts(editModal.splits.map(s => s.received ?? '0.00'));
        const splitNetAmount = subtractAmounts(splitReceivedTotal, splitSpentTotal);
        
        // Compare net amounts with precision handling
        if (compareAmounts(splitNetAmount, originalNetAmount) !== 0) {
          setEditModal(prev => ({ 
            ...prev, 
            isUpdating: false, 
            validationError: `Split net amount (${formatAmount(splitNetAmount)}) must equal the original transaction net amount (${formatAmount(originalNetAmount)})` 
          }));
          return;
        }

        // For split transactions, update with split data and then move to "Added" table
        const transactionWithSplits = {
          ...updatedTransaction,
          splits: editModal.splits
        };

        // First update the transaction with split data in the "To Add" table
        const updateSuccess = await updateTransaction(
          editModal.transaction.id,
          transactionWithSplits,
          currentCompany!.id
        );

        if (!updateSuccess) {
          setEditModal(prev => ({ ...prev, isUpdating: false, validationError: 'Failed to update transaction. Please try again.' }));
          return;
        }

        // Then move the split transaction to "Added" table
        // For split transactions, we use the first split category as the selected category
        // The move-to-added API will handle creating proper journal entries for all splits
        const firstSplitCategory = editModal.splits[0].selected_category_id;
        const correspondingCategoryId = selectedAccountIdInCOA;

        if (!correspondingCategoryId) {
          setEditModal(prev => ({ ...prev, isUpdating: false, validationError: 'No account category found for selected account' }));
          return;
        }

        const transactionRequest = {
          transaction: { ...editModal.transaction, ...transactionWithSplits },
          selectedCategoryId: firstSplitCategory,
          selectedPayeeId: updatedTransaction.payee_id
        };

        await addTransactions([transactionRequest], correspondingCategoryId, currentCompany!.id);

        setEditModal({ isOpen: false, transaction: null, splits: [], isSplitMode: false, isUpdating: false, validationError: null });
        setNotification({ type: 'success', message: 'Split transaction added successfully' });
        
        // Remove from selected to add and clear state
        if (selectedToAdd.has(editModal.transaction.id)) {
          setSelectedToAdd(prev => {
            const next = new Set(prev);
            next.delete(editModal.transaction.id);
            return next;
          });
        }
        setSelectedCategories(prev => {
          const copy = { ...prev };
          delete copy[editModal.transaction.id];
          return copy;
        });
        setSelectedPayees(prev => {
          const copy = { ...prev };
          delete copy[editModal.transaction.id];
          return copy;
        });

      } else {
        // Handle regular (non-split) transaction update
        const spent = updatedTransaction.spent ?? '0.00';
        const received = updatedTransaction.received ?? '0.00';
        
        if (isPositiveAmount(spent) && isPositiveAmount(received)) {
          setEditModal(prev => ({ ...prev, isUpdating: false, validationError: 'A transaction cannot have both spent and received amounts. Please enter only one.' }));
          return;
        }

        if (isZeroAmount(spent) && isZeroAmount(received)) {
          setEditModal(prev => ({ ...prev, isUpdating: false, validationError: 'A transaction must have either a spent or received amount.' }));
          return;
        }

        // Find the category based on the selected category ID
        const category = categories.find(c => c.id === updatedTransaction.selected_category_id);
        if (!category) {
          setEditModal(prev => ({ ...prev, isUpdating: false, validationError: 'Selected category not found' }));
          return;
        }

        // Use the store function to update the transaction
        const success = await updateTransaction(
          editModal.transaction.id,
          updatedTransaction,
          currentCompany!.id
        );

        if (success) {
          setEditModal({ isOpen: false, transaction: null, splits: [], isSplitMode: false, isUpdating: false, validationError: null });
          setNotification({ type: 'success', message: 'Transaction updated successfully' });
        } else {
          setEditModal(prev => ({ ...prev, isUpdating: false, validationError: 'Failed to update transaction. Please try again.' }));
        }
      }

    } catch (error) {
      console.error('Error updating transaction:', error);
      setEditModal(prev => ({ 
        ...prev, 
        isUpdating: false, 
        validationError: error instanceof Error ? error.message : 'Failed to update transaction' 
      }));
    }
  };

  // Add handler for updating account name
  const handleUpdateAccountName = async () => {
    if (!accountEditModal.account || !accountEditModal.newName.trim() || !hasCompanyContext) return;

    const success = await updateAccountName(
      accountEditModal.account.plaid_account_id || '',
      accountEditModal.newName.trim(),
      currentCompany!.id
    );

    if (success) {
      setAccountEditModal({ isOpen: false, account: null, newName: '' });
    }
  };

  // Handler for creating new category using store
  const handleCreateCategory = async () => {
    if (!newCategoryModal.name.trim() || !hasCompanyContext) return;

    const result = await createCategoryForTransaction({
      name: newCategoryModal.name.trim(),
      type: newCategoryModal.type,
      parent_id: newCategoryModal.parent_id || undefined
    });

    if (result.success && result.categoryId) {
      // After creating the category, set it as selected for the current transaction or all selected transactions
      if (newCategoryModal.transactionId) {
        // Check if this is for the edit modal
        if (editModal.isOpen && editModal.transaction?.id === newCategoryModal.transactionId) {
          setEditModal(prev => ({
            ...prev,
            transaction: prev.transaction ? {
              ...prev.transaction,
              selected_category_id: result.categoryId
            } : null
          }));
        }
        // Check if the transaction is part of a selection and apply to all selected
        else if (selectedToAdd.has(newCategoryModal.transactionId) && selectedToAdd.size > 1) {
          const updates: { [key: string]: string } = {};
          selectedToAdd.forEach(selectedId => {
            updates[selectedId] = result.categoryId || '';
          });
          setSelectedCategories(prev => ({
            ...prev,
            ...updates
          }));
        } else {
          setSelectedCategories(prev => ({
            ...prev,
            [newCategoryModal.transactionId!]: result.categoryId || ''
          }));
        }
      }

      setNewCategoryModal({ isOpen: false, name: '', type: 'Expense', parent_id: null, transactionId: null });
    } else {
      console.error('Error creating category:', result.error);
    }
  };

  // Handler for creating new payee using store
  const handleCreatePayee = async () => {
    if (!newPayeeModal.name.trim() || !hasCompanyContext) return;

    const result = await createPayeeForTransaction({
      name: newPayeeModal.name.trim()
    });

    if (result.success && result.payeeId) {
      // After creating the payee, set it as selected for the current transaction or all selected transactions
      if (newPayeeModal.transactionId) {
        // Check if this is for the edit modal
        if (editModal.isOpen && editModal.transaction?.id === newPayeeModal.transactionId) {
          setEditModal(prev => ({
            ...prev,
            transaction: prev.transaction ? {
              ...prev.transaction,
              payee_id: result.payeeId
            } : null
          }));
        }
        // Check if the transaction is part of a selection and apply to all selected
        else if (selectedToAdd.has(newPayeeModal.transactionId) && selectedToAdd.size > 1) {
          const updates: { [key: string]: string } = {};
          selectedToAdd.forEach(selectedId => {
            updates[selectedId] = result.payeeId || '';
          });
          setSelectedPayees(prev => ({
            ...prev,
            ...updates
          }));
        } else {
          setSelectedPayees(prev => ({
            ...prev,
            [newPayeeModal.transactionId!]: result.payeeId || ''
          }));
        }
      }

      setNewPayeeModal({ isOpen: false, name: '', transactionId: null });
      setNotification({ type: 'success', message: 'Payee created successfully' });
    } else {
      console.error('Error creating payee:', result.error);
      setNotification({ type: 'error', message: result.error || 'Failed to create payee' });
    }
  };

  // createManualAccount now handled by transactionsStore

  // Add function to handle account name updates
  const handleUpdateAccountNames = async () => {
    if (!hasCompanyContext) return;

    const success = await updateAccountNames(accountNamesModal.accounts, currentCompany!.id);
    
    if (success) {
      setAccountNamesModal({ isOpen: false, accounts: [], accountToDelete: null, deleteConfirmation: '' });
    }
  };

  // @dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for account reordering
  const handleAccountDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id && over) {
      const oldIndex = accountNamesModal.accounts.findIndex(account => account.id === active.id);
      const newIndex = accountNamesModal.accounts.findIndex(account => account.id === over.id);
      
      const reorderedAccounts = arrayMove(accountNamesModal.accounts, oldIndex, newIndex);
      
      // Update order values
      const accountsWithOrder = reorderedAccounts.map((account, index) => ({
        ...account,
        order: index
      }));

      setAccountNamesModal(prev => ({
        ...prev,
        accounts: accountsWithOrder
      }));
    }
  };

  // Add function to handle account deletion
  const handleDeleteAccount = async (accountId: string) => {
    if (!hasCompanyContext) return;

    try {
      const success = await deleteAccount(accountId, currentCompany!.id);
      
      if (success) {
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
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      setNotification({ type: 'error', message: 'Failed to delete account. Please try again.' });
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

  // saveJournalEntry now handled by transactionsStore

  // fetchPastJournalEntries now handled by transactionsStore

  // Add function to handle editing journal entry
  const handleEditJournalEntry = async () => {
    if (!editJournalEntryModal.entry || !hasCompanyContext) return;

    // Validate that debits equal credits
    const totalDebits = editJournalEntryModal.entry.transactions
      .filter(tx => tx.type === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const totalCredits = editJournalEntryModal.entry.transactions
      .filter(tx => tx.type === 'credit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      setNotification({ type: 'error', message: 'Total debits must equal total credits' });
      return;
    }

    try {
      const success = await updateJournalEntry(editJournalEntryModal.entry, currentCompany!.id);
      
      if (success) {
        setEditJournalEntryModal({ isOpen: false, entry: null });
        // Refresh past journal entries by fetching them again
        const entries = await fetchPastJournalEntries(currentCompany!.id);
        const entriesWithAccountNames = entries.map(entry => ({
          ...entry,
          transactions: entry.transactions.map(tx => ({
            ...tx,
            account_name: categories.find(c => c.id === tx.account_id)?.name || 'Unknown Account'
          }))
        }));
        setPastJournalEntriesModal(prev => ({ ...prev, entries: entriesWithAccountNames }));
      }
    } catch (error) {
      console.error('Error updating journal entry:', error);
      setNotification({ type: 'error', message: 'Failed to update journal entry. Please try again.' });
    }
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

  // Custom Pagination Component matching button styling
  const CustomPagination = ({ 
    currentPage, 
    totalPages, 
    onPageChange 
  }: { 
    currentPage: number; 
    totalPages: number; 
    onPageChange: (page: number) => void;
  }) => {
    if (totalPages <= 1) return null;

    const getVisiblePages = () => {
      const delta = 2;
      const range = [];
      const rangeWithDots = [];

      for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
        range.push(i);
      }

      if (currentPage - delta > 2) {
        rangeWithDots.push(1, '...');
      } else {
        rangeWithDots.push(1);
      }

      rangeWithDots.push(...range);

      if (currentPage + delta < totalPages - 1) {
        rangeWithDots.push('...', totalPages);
      } else {
        rangeWithDots.push(totalPages);
      }

      return rangeWithDots;
    };

    return (
      <Pagination className="justify-start">
        <PaginationContent className="gap-1">
          {currentPage > 1 && (
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                className="border px-3 py-1 rounded text-xs h-auto bg-gray-100 hover:bg-gray-200 cursor-pointer"
              />
            </PaginationItem>
          )}
          
          {getVisiblePages().map((page, index) => (
            <PaginationItem key={index}>
              {page === '...' ? (
                <PaginationEllipsis className="border px-3 py-1 rounded text-xs h-auto bg-gray-100" />
              ) : (
                <PaginationLink
                  onClick={() => onPageChange(page as number)}
                  isActive={page === currentPage}
                  className={`border px-3 py-1 rounded text-xs h-auto cursor-pointer ${
                    page === currentPage
                      ? 'bg-gray-200 text-gray-900 font-semibold'
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  {page}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          
          {currentPage < totalPages && (
            <PaginationItem>
              <PaginationNext 
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                className="border px-3 py-1 rounded text-xs h-auto bg-gray-100 hover:bg-gray-200 cursor-pointer"
              />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
    );
  };

  // Split management functions
  const addSplitItem = () => {
    if (!editModal.transaction || editModal.splits.length >= 30) return;
    
    const newSplit: SplitItem = {
      id: uuidv4(),
      date: editModal.transaction.date,
      description: '',
      spent: editModal.transaction.spent && isPositiveAmount(editModal.transaction.spent) ? '0.00' : undefined,
      received: editModal.transaction.received && isPositiveAmount(editModal.transaction.received) ? '0.00' : undefined,
      payee_id: undefined,
      selected_category_id: undefined
    };
    
    setEditModal(prev => ({
      ...prev,
      splits: [...prev.splits, newSplit]
    }));
  };

  const removeSplitItem = (splitId: string) => {
    setEditModal(prev => ({
      ...prev,
      splits: prev.splits.filter(split => split.id !== splitId)
    }));
  };

  const updateSplitItem = (splitId: string, updates: Partial<SplitItem>) => {
    setEditModal(prev => ({
      ...prev,
      splits: prev.splits.map(split => 
        split.id === splitId ? { ...split, ...updates } : split
      )
    }));
  };



  const enterSplitMode = () => {
    if (!editModal.transaction) return;
    
    // Create initial empty split item
    const initialSplits: SplitItem[] = [
      {
        id: uuidv4(),
        date: editModal.transaction.date,
        description: '',
        spent: editModal.transaction.spent && isPositiveAmount(editModal.transaction.spent) ? '0.00' : undefined,
        received: editModal.transaction.received && isPositiveAmount(editModal.transaction.received) ? '0.00' : undefined,
        payee_id: undefined,
        selected_category_id: undefined
      }
    ];
    
    setEditModal(prev => ({
      ...prev,
      isSplitMode: true,
      splits: initialSplits
    }));
  };



  // Add helper functions for handling Enter key on react-select
  const handlePayeeEnterKey = (inputValue: string, txId: string) => {
    if (!inputValue.trim()) return;
    
    // Check if payee already exists (case-insensitive)
    const existingPayee = payees.find(p => 
      p.name.toLowerCase() === inputValue.trim().toLowerCase()
    );
    
    if (existingPayee) {
      // Check if this transaction is selected and apply to all selected transactions
      if (selectedToAdd.has(txId) && selectedToAdd.size > 1) {
        const updates: { [key: string]: string } = {};
        selectedToAdd.forEach(selectedId => {
          updates[selectedId] = existingPayee.id;
        });
        setSelectedPayees(prev => ({
          ...prev,
          ...updates
        }));
        // Clear input values for all selected transactions
        const inputUpdates: { [key: string]: string } = {};
        selectedToAdd.forEach(selectedId => {
          inputUpdates[selectedId] = '';
        });
        setPayeeInputValues(prev => ({
          ...prev,
          ...inputUpdates
        }));
      } else {
        // Select the existing payee for single transaction
        setSelectedPayees(prev => ({
          ...prev,
          [txId]: existingPayee.id
        }));
        // Clear the input value
        setPayeeInputValues(prev => ({
          ...prev,
          [txId]: ''
        }));
      }
    } else {
      // Open modal with pre-populated name
      setNewPayeeModal({
        isOpen: true,
        name: inputValue.trim(),
        transactionId: txId
      });
      // Clear the input value
      setPayeeInputValues(prev => ({
        ...prev,
        [txId]: ''
      }));
    }
  };

  const handleCategoryEnterKey = (inputValue: string, txId: string) => {
    if (!inputValue.trim()) return;
    
    // Check if category already exists (case-insensitive)
    const existingCategory = categories.find(c => 
      c.name.toLowerCase() === inputValue.trim().toLowerCase()
    );
    
    if (existingCategory) {
      // Check if this transaction is selected and apply to all selected transactions
      if (selectedToAdd.has(txId) && selectedToAdd.size > 1) {
        const updates: { [key: string]: string } = {};
        selectedToAdd.forEach(selectedId => {
          updates[selectedId] = existingCategory.id;
        });
        setSelectedCategories(prev => ({
          ...prev,
          ...updates
        }));
        // Clear input values for all selected transactions
        const inputUpdates: { [key: string]: string } = {};
        selectedToAdd.forEach(selectedId => {
          inputUpdates[selectedId] = '';
        });
        setCategoryInputValues(prev => ({
          ...prev,
          ...inputUpdates
        }));
      } else {
        // Select the existing category for single transaction
        setSelectedCategories(prev => ({
          ...prev,
          [txId]: existingCategory.id
        }));
        // Clear the input value
        setCategoryInputValues(prev => ({
          ...prev,
          [txId]: ''
        }));
      }
    } else {
      // Find the transaction to determine default category type
      const transaction = imported.find(tx => tx.id === txId);
      const defaultType = transaction?.received && isPositiveAmount(transaction.received) ? 'Revenue' : 'Expense';
      
      // Open modal with pre-populated name and appropriate type
      setNewCategoryModal({
        isOpen: true,
        name: inputValue.trim(),
        type: defaultType,
        parent_id: null,
        transactionId: txId
      });
      // Clear the input value
      setCategoryInputValues(prev => ({
        ...prev,
        [txId]: ''
      }));
    }
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
                <span>Updating...</span>
              </div>
            ) : (
              <span>Update</span>
            )}
          </button>
          <button
            onClick={() => open()}
            disabled={!ready}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
          >
            Link
          </button>
          <button
            onClick={() => setAccountNamesModal({
              isOpen: true,
              accounts: accounts
                .filter(acc => acc.plaid_account_id)
                .map((acc, index) => ({
                  id: acc.plaid_account_id || '',
                  name: acc.plaid_account_name || acc.name || 'Unknown Account',
                  order: index
                })),
              accountToDelete: null,
              deleteConfirmation: ''
            })}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
          >
            Edit
          </button>
          <button
            onClick={() => setManualAccountModal({ isOpen: true, name: '', type: 'Asset', startingBalance: '0' })}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
          >
            Manual
          </button>
          <button
            onClick={() => setImportModal(prev => ({ ...prev, isOpen: true }))}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
          >
            Import
          </button>
        </div>
      </div>

      {/* Mini-nav for accounts */}
      <TooltipProvider>
        <div className="space-x-2 mb-4 flex flex-row">
          {accounts.map(acc => (
            <Tooltip key={acc.plaid_account_id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setSelectedAccountId(acc.plaid_account_id)}
                  className={`border px-3 py-1 rounded text-xs flex flex-col items-center ${acc.plaid_account_id === selectedAccountId ? 'bg-gray-200 font-semibold' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  <span>{acc.name}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-gray-900 text-white text-xs">
                {getTooltipContent(acc)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* Import Modal */}
      {importModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-[600px] max-h-[90vh] shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Import Transactions</h2>
              <button
                onClick={() => setImportModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
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
                            <li>• <strong>Amount:</strong> Enter positive amounts only. Use categories to determine if it&apos;s income or expense.</li>
                          </ul>
                          <p className="text-xs text-blue-600 mt-2">
                            Download the template above to see examples of proper formatting.
                          </p>
                        </div>
                      </div>
                      <div 
                        className={`border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors duration-200 ${!importModal.selectedAccount ? 'opacity-50' : 'hover:border-gray-400'}`}
                        onDragOver={handleCsvDragOver}
                        onDrop={handleCsvDrop}
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
                      <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
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
                                  {formatAmount(tx.amount ?? calculateNetAmount(tx.spent, tx.received))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td colSpan={4} className="px-4 py-2 text-sm font-medium text-gray-900 text-right w-8">
                                {formatAmount(sumAmounts(importModal.csvData.map(tx => tx.amount ?? calculateNetAmount(tx.spent, tx.received))))}
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

                              // Use the store function to import CSV transactions
                              const result = await importTransactionsFromCSV(selectedTransactions, currentCompany.id);

                              if (result.success) {
                                setImportModal(prev => ({
                                  ...prev,
                                  isOpen: false,
                                  isLoading: false,
                                  error: null,
                                  step: 'upload',
                                  csvData: [],
                                  selectedTransactions: new Set()
                                }))
                                
                                // Show success message
                                setNotification({ 
                                  type: 'success', 
                                  message: `Successfully imported ${result.count || selectedTransactions.length} transactions!` 
                                })
                              } else {
                                throw new Error(result.error || 'Failed to import transactions')
                              }
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
                          Import
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
                <X className="w-4 h-4" />
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
                <X className="w-4 h-4" />
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
                <X className="w-4 h-4" />
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
                <X className="w-4 h-4" />
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
                onClick={async () => {
                  if (!hasCompanyContext) return;
                  
                  const result = await createManualAccount({
                    name: manualAccountModal.name,
                    type: manualAccountModal.type,
                    startingBalance: manualAccountModal.startingBalance
                  }, currentCompany!.id);
                  
                  if (result.success) {
                    setManualAccountModal({
                      isOpen: false,
                      name: '',
                      type: 'Asset',
                      startingBalance: '0'
                    });
                    if (result.accountId) {
                      setSelectedAccountId(result.accountId);
                    }
                  }
                }}
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
              <div>
                <h2 className="text-lg font-semibold">Edit Accounts</h2>
                <p className="text-sm text-gray-600">Drag accounts to reorder them</p>
              </div>
              <button
                onClick={() => setAccountNamesModal({ isOpen: false, accounts: [], accountToDelete: null, deleteConfirmation: '' })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleAccountDragEnd}
            >
              <SortableContext 
                items={accountNamesModal.accounts.map(account => account.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {accountNamesModal.accounts.map((account, index) => (
                    <SortableAccountItem
                      key={account.id}
                      account={account}
                      index={index}
                      onNameChange={(value: string) => {
                        const newAccounts = [...accountNamesModal.accounts];
                        newAccounts[index] = { ...account, name: value };
                        setAccountNamesModal(prev => ({
                          ...prev,
                          accounts: newAccounts
                        }));
                      }}
                      onDelete={() => {
                        if (accountNamesModal.deleteConfirmation === 'delete' && accountNamesModal.accountToDelete === account.id) {
                          handleDeleteAccount(account.id);
                        } else {
                          setAccountNamesModal(prev => ({
                            ...prev,
                            accountToDelete: account.id
                          }));
                        }
                      }}
                      deleteConfirmation={accountNamesModal.deleteConfirmation}
                      onDeleteConfirmationChange={(value: string) => setAccountNamesModal(prev => ({
                        ...prev,
                        deleteConfirmation: value
                      }))}
                      accountToDelete={accountNamesModal.accountToDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="flex justify-end mt-6">
              <button
                onClick={handleUpdateAccountNames}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Save
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
                <X className="w-4 h-4" />
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
                                newEntries[index].amount = e.target.value ? parseFloat(e.target.value) : 0;
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
                onClick={async () => {
                  const entries = await fetchPastJournalEntries(currentCompany!.id);
                  // Populate account names for display
                  const entriesWithAccountNames = entries.map(entry => ({
                    ...entry,
                    transactions: entry.transactions.map(tx => ({
                      ...tx,
                      account_name: categories.find(c => c.id === tx.account_id)?.name || 'Unknown Account'
                    }))
                  }));
                  setPastJournalEntriesModal(prev => ({ ...prev, entries: entriesWithAccountNames, isOpen: true }));
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                View Past
              </button>
              <button
                onClick={() => setJournalEntryModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!hasCompanyContext) return;
                  
                  const success = await saveJournalEntry({
                    date: journalEntryModal.date,
                    description: journalEntryModal.description,
                    entries: journalEntryModal.entries
                  }, currentCompany!.id);
                  
                  if (success) {
                    setJournalEntryModal({
                      isOpen: false,
                      date: new Date().toISOString().split('T')[0],
                      description: '',
                      entries: []
                    });
                  }
                }}
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
                <X className="w-4 h-4" />
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
                <X className="w-4 h-4" />
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
                Save
              </button>
              <button
                onClick={async () => {
                  if (!editJournalEntryModal.entry || !hasCompanyContext) return;
                  if (!window.confirm('Are you sure you want to delete this journal entry? This cannot be undone.')) return;
                  
                  try {
                    const success = await deleteJournalEntry({
                      date: editJournalEntryModal.entry.date,
                      description: editJournalEntryModal.entry.description
                    }, currentCompany!.id);
                    
                    if (success) {
                      setEditJournalEntryModal({ isOpen: false, entry: null });
                      // Refresh past journal entries by fetching them again
                      const entries = await fetchPastJournalEntries(currentCompany!.id);
                      const entriesWithAccountNames = entries.map(entry => ({
                        ...entry,
                        transactions: entry.transactions.map(tx => ({
                          ...tx,
                          account_name: categories.find(c => c.id === tx.account_id)?.name || 'Unknown Account'
                        }))
                      }));
                      setPastJournalEntriesModal(prev => ({ ...prev, entries: entriesWithAccountNames }));
                    }
                  } catch (error) {
                    console.error('Error deleting journal entry:', error);
                    setNotification({ type: 'error', message: 'Failed to delete journal entry. Please try again.' });
                  }
                }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-add indicator */}
      {isAutoAddRunning && (
        <div className="fixed top-6 right-6 z-50 px-4 py-2 bg-blue-100 text-blue-800 border border-blue-300 rounded-lg shadow-lg flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
          <span className="text-sm font-medium">Auto-adding transactions...</span>
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
            {importedFiltered.length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                {importedFiltered.length}
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
            {confirmedFiltered.length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                {confirmedFiltered.length}
              </span>
            )}
          </button>
          {(() => {
            const selected = accounts.find(a => a.plaid_account_id === selectedAccountId);
            if (!selected || selected.is_manual) return null;
            return (
              <div className="ml-4 flex items-center gap-3 my-auto">
                <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md">
                  <span className="text-gray-700 text-xs font-medium">Account Balance:</span>
                  <span className="text-gray-900 text-xs font-semibold">{formatAmount(currentBalance)}</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded-md">
                  <span className="text-gray-700 text-xs font-medium">Switch Balance:</span>
                  <span className="text-gray-900 text-xs font-semibold">{formatAmount(switchBalance)}</span>
                </div>
              </div>
            );
          })()}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'toAdd' && (
          <div className="space-y-2">
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
                  <th 
                    className="border p-1 w-8 text-center cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('spent', 'toAdd')}
                  >
                    Spent {toAddSortConfig.key === 'spent' && (toAddSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="border p-1 w-8 text-center cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('received', 'toAdd')}
                  >
                    Received {toAddSortConfig.key === 'received' && (toAddSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="border p-1 w-8 text-center">Payee</th>
                  <th className="border p-1 w-8 text-center">Category</th>
                  <th className="border p-1 w-8 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {imported.map(tx => {
                  return (
                    <tr 
                      key={tx.id}
                      onClick={(e) => {
                        // Only open modal if click is in columns 1-4 (date, description, spent, received)
                        const clickedTd = (e.target as HTMLElement).closest('td');
                        if (!clickedTd) return;
                        
                        const tdIndex = Array.from(clickedTd.parentElement!.children).indexOf(clickedTd);
                        // Allow clicks on columns 1-4 (date, description, spent, received) - skip checkbox column (0)
                        if (tdIndex >= 1 && tdIndex <= 4) {
                          // Check if this transaction has split data
                          const hasSplitData = isSplitData(tx.split_data);
                          
                          if (hasSplitData) {
                            // Parse split data and enter split mode
                            const splitData = tx.split_data as StoreSplitData;
                            const parsedSplits: SplitItem[] = splitData.splits.map((split) => ({
                              id: split.id || uuidv4(),
                              date: split.date || tx.date,
                              description: split.description || '',
                              spent: split.spent || '0.00',
                              received: split.received || '0.00',
                              payee_id: split.payee_id || undefined,
                              selected_category_id: split.selected_category_id || undefined
                            }));
                            
                            setEditModal({ 
                              isOpen: true, 
                              transaction: tx, 
                              splits: parsedSplits, 
                              isSplitMode: true, 
                              isUpdating: false, 
                              validationError: null 
                            });
                          } else {
                            // Regular transaction
                            setEditModal({ isOpen: true, transaction: tx, splits: [], isSplitMode: false, isUpdating: false, validationError: null });
                          }
                        }
                      }}
                      className="hover:bg-gray-50"
                    >
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
                      <td className="border p-1 w-8 text-center text-xs cursor-pointer">{formatDate(tx.date)}</td>
                      <td className="border p-1 w-8 text-center text-xs cursor-pointer" style={{ minWidth: 250 }}>
                        {tx.description}
                        {isSplitData(tx.split_data) && (
                          <span className="ml-1 inline-block bg-blue-100 text-blue-800 text-xs px-1 rounded">Split</span>
                        )}
                      </td>
                      <td className="border p-1 w-8 text-center cursor-pointer">{tx.spent ? formatAmount(tx.spent) : ''}</td>
                      <td className="border p-1 w-8 text-center cursor-pointer">{tx.received ? formatAmount(tx.received) : ''}</td>
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
                              // Check if this transaction is selected and apply to all selected transactions
                              if (selectedToAdd.has(tx.id) && selectedToAdd.size > 1) {
                                const updates: { [key: string]: string } = {};
                                selectedToAdd.forEach(selectedId => {
                                  updates[selectedId] = option.value;
                                });
                                setSelectedPayees(prev => ({
                                  ...prev,
                                  ...updates
                                }));
                              } else {
                                setSelectedPayees(prev => ({
                                  ...prev,
                                  [tx.id]: option.value
                                }));
                              }
                            }
                          }}
                          onInputChange={(inputValue) => {
                            setPayeeInputValues(prev => ({
                              ...prev,
                              [tx.id]: inputValue
                            }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              const inputValue = payeeInputValues[tx.id] || '';
                              handlePayeeEnterKey(inputValue, tx.id);
                            }
                          }}
                          inputValue={payeeInputValues[tx.id] || ''}
                          isSearchable
                        />
                      </td>
                      <td className="border p-1 w-8 text-center" style={{ minWidth: 150 }}>
                        <Select
                          options={categoryOptions}
                          value={categoryOptions.find(opt => opt.value === selectedCategories[tx.id]) || categoryOptions[0]}
                          onChange={(selectedOption) => {
                            const option = selectedOption as SelectOption | null;
                            if (option?.value === 'add_new') {
                              // Determine default category type based on transaction
                              const defaultType = tx.received && isPositiveAmount(tx.received) ? 'Revenue' : 'Expense';
                              setNewCategoryModal({ 
                                isOpen: true, 
                                name: '', 
                                type: defaultType, 
                                parent_id: null, 
                                transactionId: tx.id 
                              });
                            } else if (option?.value) {
                              // Check if this transaction is selected and apply to all selected transactions
                              if (selectedToAdd.has(tx.id) && selectedToAdd.size > 1) {
                                const updates: { [key: string]: string } = {};
                                selectedToAdd.forEach(selectedId => {
                                  updates[selectedId] = option.value;
                                });
                                setSelectedCategories(prev => ({
                                  ...prev,
                                  ...updates
                                }));
                              } else {
                                setSelectedCategories(prev => ({
                                  ...prev,
                                  [tx.id]: option.value
                                }));
                              }
                            }
                          }}
                          onInputChange={(inputValue) => {
                            setCategoryInputValues(prev => ({
                              ...prev,
                              [tx.id]: inputValue
                            }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              const inputValue = categoryInputValues[tx.id] || '';
                              handleCategoryEnterKey(inputValue, tx.id);
                            }
                          }}
                          inputValue={categoryInputValues[tx.id] || ''}
                          isSearchable
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
                              });
                              // Remove from auto-added tracking since it was manually added
                              setAutoAddedTransactions(prev => {
                                const newSet = new Set(prev);
                                const contentHash = getTransactionContentHash(tx);
                                newSet.delete(contentHash);
                                return newSet;
                              });
                            }
                          }}
                          className={`border px-2 py-1 rounded w-12 flex items-center justify-center mx-auto ${
                            processingTransactions.has(tx.id) 
                              ? 'bg-gray-50 text-gray-400 cursor-not-allowed' 
                              : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                          disabled={!selectedCategories[tx.id] || processingTransactions.has(tx.id)}
                        >
                          {processingTransactions.has(tx.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Add'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            <div className="flex justify-between items-center">
              {/* Pagination for To Add table */}
              <div className="mt-2 flex items-center justify-start gap-3">
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  {`${imported.length} of ${importedFiltered.length}`}
                </span>
                <CustomPagination 
                  currentPage={toAddCurrentPage}
                  totalPages={toAddTotalPages}
                  onPageChange={setToAddCurrentPage}
                />
              </div>

              {selectedToAdd.size > 0 && (() => {
                const selectedTransactions = imported.filter(tx => selectedToAdd.has(tx.id));
                const hasValidCategories = selectedTransactions.every(tx => selectedCategories[tx.id]);
                const isProcessing = isAddingTransactions || selectedTransactions.some(tx => processingTransactions.has(tx.id));
                
                return (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={async () => {
                        const transactionRequests = selectedTransactions
                          .filter(tx => selectedCategories[tx.id])
                          .map(tx => ({
                            transaction: tx,
                            selectedCategoryId: selectedCategories[tx.id],
                            selectedPayeeId: selectedPayees[tx.id]
                          }));

                        // Get the corresponding category ID (the account category)
                        const correspondingCategoryId = selectedAccountIdInCOA;
                        if (!correspondingCategoryId) {
                          setNotification({ type: 'error', message: 'No account category found for selected account' });
                          return;
                        }
                        
                        await addTransactions(transactionRequests, correspondingCategoryId, currentCompany!.id);
                        
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
                        // Remove from auto-added tracking since they were manually added
                        setAutoAddedTransactions(prev => {
                          const newSet = new Set(prev);
                          selectedTransactions.forEach(tx => {
                            const contentHash = getTransactionContentHash(tx);
                            newSet.delete(contentHash);
                          });
                          return newSet;
                        });
                        setSelectedToAdd(new Set());
                      }}
                      className={`border px-3 py-1 rounded ${
                        isProcessing 
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed' 
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                      disabled={!hasValidCategories || isProcessing}
                    >
                      {isProcessing ? (
                        <div className="flex items-center space-x-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Adding...</span>
                        </div>
                      ) : (
                        `Add Selected (${selectedToAdd.size})`
                      )}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'added' && (
          <div className="space-y-2">
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
                  <th 
                    className="border p-1 w-8 text-center cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('spent', 'added')}
                  >
                    Spent {addedSortConfig.key === 'spent' && (addedSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th 
                    className="border p-1 w-8 text-center cursor-pointer hover:bg-gray-200"
                    onClick={() => handleSort('received', 'added')}
                  >
                    Received {addedSortConfig.key === 'received' && (addedSortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="border p-1 w-8 text-center">Payee</th>
                  <th className="border p-1 w-8 text-center">Category</th>
                  <th className="border p-1 w-8 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map(tx => {
                  const category = categories.find(c => c.id === tx.selected_category_id);
                  return (
                    <tr 
                      key={tx.id}
                      onClick={(e) => {
                        // Only open modal if click is in columns 1-6 (date, description, spent, received, payee, category)
                        const clickedTd = (e.target as HTMLElement).closest('td');
                        if (!clickedTd) return;
                        
                        const tdIndex = Array.from(clickedTd.parentElement!.children).indexOf(clickedTd);
                        // Allow clicks on columns 1-6 (date, description, spent, received, payee, category) - skip checkbox column (0) and action column (7)
                        if (tdIndex >= 1 && tdIndex <= 6) {
                          // Check if this transaction has split data
                          const hasSplitData = isSplitData(tx.split_data);
                          
                          if (hasSplitData) {
                            // Parse split data and enter split mode
                            const splitData = tx.split_data as StoreSplitData;
                            const parsedSplits: SplitItem[] = splitData.splits.map((split) => ({
                              id: split.id || uuidv4(),
                              date: split.date || tx.date,
                              description: split.description || '',
                              spent: split.spent || '0.00',
                              received: split.received || '0.00',
                              payee_id: split.payee_id || undefined,
                              selected_category_id: split.selected_category_id || undefined
                            }));
                            
                            setEditModal({ 
                              isOpen: true, 
                              transaction: tx, 
                              splits: parsedSplits, 
                              isSplitMode: true, 
                              isUpdating: false, 
                              validationError: null 
                            });
                          } else {
                            // Regular transaction
                            setEditModal({ isOpen: true, transaction: tx, splits: [], isSplitMode: false, isUpdating: false, validationError: null });
                          }
                        }
                      }}
                      className="hover:bg-gray-50"
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
                      <td className="border p-1 w-8 text-center text-xs cursor-pointer">{formatDate(tx.date)}</td>
                      <td className="border p-1 w-8 text-center text-xs cursor-pointer" style={{ minWidth: 250 }}>
                        {tx.description}
                        {isSplitData(tx.split_data) && (
                          <span className="ml-1 inline-block bg-blue-100 text-blue-800 text-xs px-1 rounded">Split</span>
                        )}
                      </td>
                      <td className="border p-1 w-8 text-center cursor-pointer">{tx.spent ? formatAmount(tx.spent) : ''}</td>
                      <td className="border p-1 w-8 text-center cursor-pointer">{tx.received ? formatAmount(tx.received) : ''}</td>
                      <td className="border p-1 w-8 text-center cursor-pointer" style={{ minWidth: 150 }}>
                        {(() => {
                          const payee = payees.find(p => p.id === tx.payee_id);
                          return payee ? payee.name : '';
                        })()}
                      </td>
                      <td className="border p-1 w-8 text-center cursor-pointer" style={{ minWidth: 150 }}>{category ? category.name : 'Uncategorized'}</td>
                      <td className="border p-1 w-8 text-center">
                        <button
                          onClick={e => { e.stopPropagation(); undoTransaction(tx); }}
                          className={`border px-2 py-1 rounded w-14 flex items-center justify-center mx-auto ${
                            processingTransactions.has(tx.id) 
                              ? 'bg-gray-50 text-gray-400 cursor-not-allowed' 
                              : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                          disabled={processingTransactions.has(tx.id)}
                        >
                          {processingTransactions.has(tx.id) ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Undo'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            <div className="flex justify-between items-center">
              {/* Pagination for Added table */}
              <div className="mt-2 flex items-center justify-start gap-3">
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  {`${confirmed.length} of ${confirmedFiltered.length}`}
                </span>
                <CustomPagination 
                  currentPage={addedCurrentPage}
                  totalPages={addedTotalPages}
                  onPageChange={setAddedCurrentPage}
                />
              </div>

              {selectedAdded.size > 0 && (() => {
                const selectedConfirmed = confirmed.filter(tx => selectedAdded.has(tx.id));
                const isProcessing = isUndoingTransactions || selectedConfirmed.some(tx => processingTransactions.has(tx.id));
                
                return (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={async () => {
                        await undoTransactions(selectedConfirmed.map(tx => tx.id), currentCompany!.id);
                        setSelectedAdded(new Set());
                      }}
                      className={`border px-3 py-1 rounded ${
                        isProcessing 
                          ? 'bg-gray-50 text-gray-400 cursor-not-allowed' 
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <div className="flex items-center space-x-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Undoing...</span>
                        </div>
                      ) : (
                        `Undo Selected (${selectedAdded.size})`
                      )}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Account Selection Modal */}
      {accountSelectionModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-[600px] max-h-[90vh] overflow-y-auto shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Link Accounts</h2>
              <button
                onClick={() => setAccountSelectionModal({ isOpen: false, accounts: [] })}
                className="text-gray-500 hover:text-gray-700 text-xl"
                disabled={importProgress.isImporting}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Select the accounts you want to link and choose a start date for importing transactions.
            </p>

            {!importProgress.isImporting ? (
              <>
                <div className="space-y-4 flex-1 overflow-y-auto">
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

                <div className="flex justify-end space-x-3 mt-6 flex-shrink-0">
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
