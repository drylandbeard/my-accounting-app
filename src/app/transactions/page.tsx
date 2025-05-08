'use client'

import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { supabase } from '../../lib/supabaseClient'
import dynamic from 'next/dynamic'
import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'

type Transaction = {
  id: string
  date: string
  description: string
  amount: number
  plaid_account_id: string | null
  plaid_account_name: string | null
  debit_account_id?: string
  credit_account_id?: string
}

type Category = {
  id: string
  name: string
  type: string
  subtype?: string
  plaid_account_id?: string | null
}

type Account = {
  plaid_account_id: string | null
  plaid_account_name: string
  starting_balance: number | null
  current_balance: number | null
  last_synced: string | null
  is_manual?: boolean
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
  Amount: string
  Description: string
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

const Select = dynamic(() => import('react-select'), { ssr: false })

export default function Page() {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [importedTransactions, setImportedTransactions] = useState<Transaction[]>([])
  const [confirmedTransactions, setConfirmedTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  // Manual transaction state (single set, not per row!)
  const [manualDate, setManualDate] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualCategoryId, setManualCategoryId] = useState('')

  const [selectedCategories, setSelectedCategories] = useState<{ [txId: string]: string }>({});

  // Search state
  const [searchToAdd, setSearchToAdd] = useState('');
  const [searchAdded, setSearchAdded] = useState('');

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'success' | 'error' | null>(null);

  const [importModal, setImportModal] = useState<ImportModalState>({
    isOpen: false,
    step: 'upload',
    selectedAccount: null,
    csvData: [],
    isLoading: false,
    error: null,
    selectedTransactions: new Set()
  })

  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set())
  const [selectedAdded, setSelectedAdded] = useState<Set<string>>(new Set())

  const [toAddSortConfig, setToAddSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [addedSortConfig, setAddedSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });

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

  // Add new state for manual account creation modal
  const [manualAccountModal, setManualAccountModal] = useState<{
    isOpen: boolean;
    name: string;
    type: string;
  }>({
    isOpen: false,
    name: '',
    type: 'Asset'
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

  // 1️⃣ Plaid Link Token
  useEffect(() => {
    const createLinkToken = async () => {
      const res = await fetch('/api/create-link-token')
      const data = await res.json()
      setLinkToken(data.link_token)
    }
    createLinkToken()
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken || '',
    onSuccess: async (public_token) => {
      const res = await fetch('/api/exchange-public-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      });

      const data = await res.json();

      // Send BOTH access_token and item_id to the sync endpoint
      await fetch('/api/get-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: data.access_token,
          item_id: data.item_id,
        }),
      });

      refreshAll();
    },
  })

  // 2️⃣ Supabase Fetching
  const fetchImportedTransactions = async () => {
    const { data } = await supabase
      .from('imported_transactions')
      .select('*')
      .neq('plaid_account_name', null)
    setImportedTransactions(data || [])
  }

  const fetchConfirmedTransactions = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .neq('plaid_account_name', null)
    setConfirmedTransactions(data || [])
  }

  const fetchCategories = async () => {
    const { data } = await supabase.from('chart_of_accounts').select('*')
    setCategories(data || [])
  }

  const fetchAccounts = async () => {
    const { data } = await supabase.from('accounts').select('*')
    setAccounts(data || [])
    if (data && data.length > 0 && !selectedAccountId) {
      setSelectedAccountId(data[0].plaid_account_id)
    }
  }

  const refreshAll = () => {
    fetchImportedTransactions()
    fetchConfirmedTransactions()
    fetchCategories()
    fetchAccounts()
  }

  useEffect(() => {
    refreshAll()
  }, [])

  // 3️⃣ Actions
  const addTransaction = async (tx: Transaction, selectedCategoryId: string) => {
    const category = categories.find(c => c.id === selectedCategoryId);
    if (!category) {
      alert('Selected category not found. Please try again.');
      return;
    }

    // Find the selected account in chart_of_accounts by plaid_account_id (can be Asset or Liability)
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
      alert(`Account not found in chart of accounts. Please ensure the account "${accounts.find(a => a.plaid_account_id === selectedAccountId)?.plaid_account_name}" is properly set up in your chart of accounts.`);
      return;
    }

    const selectedAccountIdInCOA = selectedAccount.id;
    const selectedAccountType = selectedAccount.type;

    let debit_account_id, credit_account_id;
    if (selectedAccountType === 'Asset') {
      // Bank account logic (Asset)
      if (category.type === 'Expense') {
        debit_account_id = selectedCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      } else if (category.type === 'Revenue') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = selectedCategoryId;
      } else if (category.type === 'Equity') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = selectedCategoryId;
      } else {
        debit_account_id = selectedCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      }
    } else if (selectedAccountType === 'Liability') {
      // Credit card logic (Liability)
      if (category.type === 'Expense') {
        debit_account_id = selectedCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      } else if (category.type === 'Revenue') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = selectedCategoryId;
      } else if (category.type === 'Equity') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = selectedCategoryId;
      } else {
        debit_account_id = selectedCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      }
    } else {
      // Fallback: treat as asset
      if (category.type === 'Expense') {
        debit_account_id = selectedCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      } else if (category.type === 'Revenue') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = selectedCategoryId;
      } else if (category.type === 'Equity') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = selectedCategoryId;
      } else {
        debit_account_id = selectedCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      }
    }

    await supabase.from('transactions').insert([{
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      debit_account_id,
      credit_account_id,
      plaid_account_id: tx.plaid_account_id,
      plaid_account_name: tx.plaid_account_name,
    }]);

    await supabase.from('imported_transactions').delete().eq('id', tx.id);
    refreshAll();
  };

  const undoTransaction = async (tx: any) => {
    // Insert back into imported_transactions with the correct fields
    await supabase.from('imported_transactions').insert([{
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      plaid_account_id: tx.plaid_account_id,
      plaid_account_name: tx.plaid_account_name,
    }]);

    // Remove from transactions
    await supabase.from('transactions').delete().eq('id', tx.id);
    refreshAll();
  };

  const addManualTransaction = async () => {
    if (!manualDate || !manualDescription || !manualAmount || !selectedAccountId || !manualCategoryId) return;

    const category = categories.find(c => c.id === manualCategoryId);
    if (!category) return;

    // Find the selected account in chart_of_accounts by plaid_account_id (can be Asset or Liability)
    const selectedAccount = categories.find(
      c => c.plaid_account_id === selectedAccountId
    );
    const selectedAccountIdInCOA = selectedAccount?.id;
    const selectedAccountType = selectedAccount?.type;
    if (!selectedAccountIdInCOA) {
      alert('Account not found in chart of accounts.');
      return;
    }

    let debit_account_id, credit_account_id;
    if (selectedAccountType === 'Asset') {
      if (category.type === 'Expense') {
        debit_account_id = manualCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      } else if (category.type === 'Revenue') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = manualCategoryId;
      } else if (category.type === 'Equity') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = manualCategoryId;
      } else {
        debit_account_id = manualCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      }
    } else if (selectedAccountType === 'Liability') {
      if (category.type === 'Expense') {
        debit_account_id = manualCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      } else if (category.type === 'Revenue') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = manualCategoryId;
      } else if (category.type === 'Equity') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = manualCategoryId;
      } else {
        debit_account_id = manualCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      }
    } else {
      if (category.type === 'Expense') {
        debit_account_id = manualCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      } else if (category.type === 'Revenue') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = manualCategoryId;
      } else if (category.type === 'Equity') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = manualCategoryId;
      } else {
        debit_account_id = manualCategoryId;
        credit_account_id = selectedAccountIdInCOA;
      }
    }

    await supabase.from('transactions').insert([{
      date: manualDate,
      description: manualDescription,
      amount: parseFloat(manualAmount),
      debit_account_id,
      credit_account_id,
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
  const categoryOptions = [
    { value: '', label: 'Select' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
    { value: 'add_new', label: '+ Add new category' }
  ]

  const formatDate = (dateString: string) => {
    // Parse the date string and create a UTC date
    const [year, month, day] = dateString.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`
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
        return sortConfig.direction === 'asc'
          ? a.amount - b.amount
          : b.amount - a.amount;
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

  // Find the selected account in chart_of_accounts by plaid_account_id (can be Asset or Liability)
  const selectedAccount = categories.find(
    c => c.plaid_account_id === selectedAccountId
  );
  const selectedAccountIdInCOA = selectedAccount?.id;

  // Update the imported transactions to use sorting
  const imported = sortTransactions(
    importedTransactions
      .filter(tx => tx.plaid_account_id === selectedAccountId)
      .filter(tx =>
        searchToAdd === '' ||
        tx.description.toLowerCase().includes(searchToAdd.toLowerCase()) ||
        tx.date.includes(searchToAdd) ||
        String(tx.amount).includes(searchToAdd)
      ),
    toAddSortConfig
  );

  // Update the confirmed transactions to use sorting
  const confirmed = sortTransactions(
    confirmedTransactions
      .filter(tx => {
        // Include transactions from the selected account OR manual entries that involve the selected account
        if (tx.plaid_account_id === selectedAccountId) return true;
        if (tx.plaid_account_id === 'MANUAL_ENTRY') {
          // For manual entries, check if the selected account is involved in either debit or credit
          return tx.debit_account_id === selectedAccountIdInCOA || tx.credit_account_id === selectedAccountIdInCOA;
        }
        return false;
      })
      .filter(tx => {
        if (searchAdded === '') return true;
        
        // Get the category name for this transaction
        const isAccountDebit = tx.debit_account_id === selectedAccountIdInCOA;
        const categoryId = isAccountDebit ? tx.credit_account_id : tx.debit_account_id;
        const category = categories.find(c => c.id === categoryId);
        const categoryName = category ? category.name : '';

        return (
          tx.description.toLowerCase().includes(searchAdded.toLowerCase()) ||
          tx.date.includes(searchAdded) ||
          String(tx.amount).includes(searchAdded) ||
          categoryName.toLowerCase().includes(searchAdded.toLowerCase())
        );
      }),
    addedSortConfig
  );

  const accountName = accounts.find(a => a.plaid_account_id === selectedAccountId)?.plaid_account_name || ''
  const currentBalance = accounts.find(a => a.plaid_account_id === selectedAccountId)?.current_balance || 0

  // Calculate the Switch (Accounting) Balance for the selected account
  const switchBalance =
    confirmedTransactions
      .filter(tx => tx.debit_account_id === selectedAccountIdInCOA)
      .reduce((sum, tx) => sum + Number(tx.amount), 0)
    -
    confirmedTransactions
      .filter(tx => tx.credit_account_id === selectedAccountIdInCOA)
      .reduce((sum, tx) => sum + Number(tx.amount), 0);

  // Helper to get the display amount for a transaction
  function getDisplayAmount(tx: Transaction, category: Category | undefined) {
    if (!category) return Number(tx.amount);
    if (category.type === 'Revenue') {
      return Math.abs(Number(tx.amount)); // Show income as positive
    }
    if (category.type === 'Expense' || category.type === 'COGS') {
      return -Math.abs(Number(tx.amount)); // Show expenses as negative
    }
    return Number(tx.amount); // Default for other types
  }

  const downloadTemplate = () => {
    const headers = ['Date', 'Amount', 'Description']
    const exampleData = [
      ['5/1/25', '1000.00', 'Client Payment - Revenue'],
      ['5/1/25', '-500.00', 'Office Supplies - Expense']
    ]
    const csvContent = [
      headers.join(','),
      ...exampleData.map(row => row.join(','))
    ].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transaction_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const validateCSV = (data: Papa.ParseResult<CSVRow>) => {
    if (!data.data || data.data.length === 0) {
      return 'CSV file is empty'
    }

    const requiredColumns = ['Date', 'Amount', 'Description']
    const headers = Object.keys(data.data[0])
    
    const missingColumns = requiredColumns.filter(col => !headers.includes(col))
    if (missingColumns.length > 0) {
      return `Missing required columns: ${missingColumns.join(', ')}`
    }

    // Filter out empty rows before validation
    const nonEmptyRows = data.data.filter(row => 
      row.Date && row.Amount && row.Description
    )

    // Validate each non-empty row
    for (let i = 0; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i]
      
      // Validate date format (M/D/YY, MM/DD/YY, M/D/YYYY, MM/DD/YYYY, or with dashes)
      const dateParts = row.Date.split(/[\/\-]/)
      if (dateParts.length !== 3) {
        return `Invalid date format in row ${i + 1}. Please use M/D/YY, MM/DD/YY, M/D/YYYY, or MM/DD/YYYY format (with / or - as separator).`
      }

      const monthNum = parseInt(dateParts[0])
      const dayNum = parseInt(dateParts[1])
      const yearStr = dateParts[2]
      const yearNum = parseInt(yearStr)
      
      // Handle two-digit years
      const fullYear = yearNum < 100 ? 2000 + yearNum : yearNum
      
      const date = new Date(Date.UTC(fullYear, monthNum - 1, dayNum))
      if (isNaN(date.getTime()) || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
        return `Invalid date in row ${i + 1}. Please check month (1-12) and day (1-31) values.`
      }

      // Validate amount
      const amount = parseFloat(row.Amount)
      if (isNaN(amount)) {
        return `Invalid amount in row ${i + 1}`
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
      skipEmptyLines: true, // Add this to skip empty lines
      complete: (results) => {
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
          .filter((row: CSVRow) => row.Date && row.Amount && row.Description)
          .map((row: CSVRow) => {
            // Parse date in any supported format (with / or - as separator)
            const dateParts = row.Date.split(/[\/\-]/)
            const monthNum = parseInt(dateParts[0])
            const dayNum = parseInt(dateParts[1])
            const yearStr = dateParts[2]
            const yearNum = parseInt(yearStr)
            
            // Handle two-digit years
            const fullYear = yearNum < 100 ? 2000 + yearNum : yearNum
            
            // Create date in UTC to prevent timezone shifts
            const date = new Date(Date.UTC(fullYear, monthNum - 1, dayNum))
            
            return {
              id: uuidv4(),
              date: date.toISOString().split('T')[0], // Store as YYYY-MM-DD
              description: row.Description,
              amount: parseFloat(row.Amount),
              plaid_account_id: importModal.selectedAccount?.plaid_account_id || null,
              plaid_account_name: importModal.selectedAccount?.plaid_account_name || null
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleFileUpload(e)
  }

  const handleEditTransaction = async (updatedTransaction: Transaction) => {
    if (!editModal.transaction) return;

    // Find the category based on the selected category ID
    const category = categories.find(c => c.id === updatedTransaction.debit_account_id || c.id === updatedTransaction.credit_account_id);
    if (!category) return;

    // Find the selected account in chart_of_accounts
    const selectedAccount = categories.find(c => c.plaid_account_id === selectedAccountId);
    if (!selectedAccount) return;

    const selectedAccountIdInCOA = selectedAccount.id;
    const selectedAccountType = selectedAccount.type;

    let debit_account_id, credit_account_id;
    if (selectedAccountType === 'Asset') {
      if (category.type === 'Expense') {
        debit_account_id = category.id;
        credit_account_id = selectedAccountIdInCOA;
      } else if (category.type === 'Revenue') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = category.id;
      } else if (category.type === 'Equity') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = category.id;
      } else {
        debit_account_id = category.id;
        credit_account_id = selectedAccountIdInCOA;
      }
    } else if (selectedAccountType === 'Liability') {
      if (category.type === 'Expense') {
        debit_account_id = category.id;
        credit_account_id = selectedAccountIdInCOA;
      } else if (category.type === 'Revenue') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = category.id;
      } else if (category.type === 'Equity') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = category.id;
      } else {
        debit_account_id = category.id;
        credit_account_id = selectedAccountIdInCOA;
      }
    } else {
      if (category.type === 'Expense') {
        debit_account_id = category.id;
        credit_account_id = selectedAccountIdInCOA;
      } else if (category.type === 'Revenue') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = category.id;
      } else if (category.type === 'Equity') {
        debit_account_id = selectedAccountIdInCOA;
        credit_account_id = category.id;
      } else {
        debit_account_id = category.id;
        credit_account_id = selectedAccountIdInCOA;
      }
    }

    await supabase
      .from('transactions')
      .update({
        date: updatedTransaction.date,
        description: updatedTransaction.description,
        amount: updatedTransaction.amount,
        debit_account_id,
        credit_account_id
      })
      .eq('id', editModal.transaction.id);

    setEditModal({ isOpen: false, transaction: null });
    refreshAll();
  };

  // Add handler for updating account name
  const handleUpdateAccountName = async () => {
    if (!accountEditModal.account || !accountEditModal.newName.trim()) return;

    await supabase
      .from('accounts')
      .update({ plaid_account_name: accountEditModal.newName.trim() })
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
        parent_id: newCategoryModal.parent_id
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      return;
    }

    // After creating the category, set it as selected for the current transaction
    setSelectedCategories(prev => ({
      ...prev,
      [newCategoryModal.transactionId]: data.id
    }));

    setNewCategoryModal({ isOpen: false, name: '', type: 'Expense', parent_id: null, transactionId: null });
    refreshAll();
  };

  // Add function to create manual account
  const createManualAccount = async () => {
    if (!manualAccountModal.name.trim()) return;

    const manualAccountId = uuidv4(); // Generate a unique ID for the manual account

    // Insert into accounts table
    const { error: accountError } = await supabase.from('accounts').insert({
      plaid_account_id: manualAccountId,
      plaid_account_name: manualAccountModal.name.trim(),
      starting_balance: parseFloat(manualAccountModal.startingBalance) || 0,
      current_balance: parseFloat(manualAccountModal.startingBalance) || 0,
      last_synced: new Date().toISOString(),
      is_manual: true
    });

    if (accountError) {
      console.error('Error creating manual account:', accountError);
      return;
    }

    // Insert into chart_of_accounts table
    const { error: coaError } = await supabase.from('chart_of_accounts').insert({
      name: manualAccountModal.name.trim(),
      type: manualAccountModal.type,
      plaid_account_id: manualAccountId
    });

    if (coaError) {
      console.error('Error creating chart of accounts entry:', coaError);
      return;
    }

    setManualAccountModal({
      isOpen: false,
      name: '',
      type: 'Asset'
    });

    // Set the newly created account as selected
    setSelectedAccountId(manualAccountId);
    refreshAll();
  };

  // Add function to handle account name updates
  const handleUpdateAccountNames = async () => {
    for (const account of accountNamesModal.accounts) {
      if (account.id) {  // Only update if id exists
        await supabase
          .from('accounts')
          .update({ plaid_account_name: account.name })
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

    // Create a transaction for each entry
    for (const entry of journalEntryModal.entries) {
      await supabase.from('transactions').insert([{
        date: journalEntryModal.date,
        description: journalEntryModal.description,
        amount: entry.amount,
        debit_account_id: entry.type === 'debit' ? entry.account_id : null,
        credit_account_id: entry.type === 'credit' ? entry.account_id : null,
        plaid_account_id: 'MANUAL_ENTRY',  // Special identifier for manual entries
        plaid_account_name: 'Manual Journal Entry'  // Special identifier for manual entries
      }]);
    }

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
      const groupedEntries = transactions.reduce((acc: any, tx) => {
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
        const account = categories.find(c => c.id === (tx.debit_account_id || tx.credit_account_id));
        
        acc[key].transactions.push({
          account_id: tx.debit_account_id || tx.credit_account_id,
          account_name: account?.name || 'Unknown Account',
          amount: tx.amount,
          type: tx.debit_account_id ? 'debit' : 'credit'
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

  return (
    <div className="p-4 bg-white text-gray-900 font-sans text-sm space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Transactions5000</h1>
        <div className="space-x-2">
          <button
            onClick={() => open()}
            disabled={!ready || !linkToken}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
          >
            Connect Account
          </button>
          <button
            onClick={() => setImportModal(prev => ({ ...prev, isOpen: true }))}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
          >
            Import CSV
          </button>
          <button
            onClick={() => setManualAccountModal({ isOpen: true, name: '', type: 'Asset' })}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
          >
            Add Manual Account
          </button>
          <button
            onClick={() => setAccountNamesModal({
              isOpen: true,
              accounts: accounts
                .filter(acc => acc.plaid_account_id)  // Only include accounts with valid IDs
                .map(acc => ({
                  id: acc.plaid_account_id,
                  name: acc.plaid_account_name
                })),
              accountToDelete: null,
              deleteConfirmation: ''
            })}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
          >
            Edit Accounts
          </button>
          <button
            onClick={() => setJournalEntryModal(prev => ({ ...prev, isOpen: true }))}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 ml-2"
          >
            Add JE
          </button>
        </div>
      </div>

      {/* Mini-nav for accounts */}
      <div className="space-x-2 mb-4">
        {accounts.map(acc => (
          <button
            key={acc.plaid_account_id}
            onClick={() => setSelectedAccountId(acc.plaid_account_id)}
            className={`border px-3 py-1 rounded ${acc.plaid_account_id === selectedAccountId ? 'bg-gray-200 font-semibold' : 'bg-gray-100 hover:bg-gray-200'}`}
          >
            {acc.plaid_account_name}
          </button>
        ))}
      </div>

      {/* Import Modal */}
      {importModal.isOpen && (
        <div className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[560px] max-h-[80vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Import Transactions</h2>
              <button
                onClick={() => setImportModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
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
              <div className="space-y-4">
                {importModal.step === 'upload' && (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Select Account
                        </label>
                        <Select
                          options={accounts.map(acc => ({
                            value: acc.plaid_account_id,
                            label: acc.plaid_account_name
                          }))}
                          value={importModal.selectedAccount ? {
                            value: importModal.selectedAccount.plaid_account_id,
                            label: importModal.selectedAccount.plaid_account_name
                          } : null}
                          onChange={(option) => {
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
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700">Upload CSV File</h3>
                        <button
                          onClick={downloadTemplate}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          Download Template
                        </button>
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
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8 text-center">
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
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8 text-center">Date</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8 text-center">Description</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-8 text-center">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {importModal.csvData.map((tx) => (
                              <tr key={tx.id}>
                                <td className="px-4 py-2 whitespace-nowrap w-8 text-center">
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
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 w-8 text-center">
                                  {formatDate(tx.date)}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900 w-8 text-center" style={{ minWidth: 250 }}>
                                  {tx.description}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900 text-right w-8 text-center">
                                  ${tx.amount.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td colSpan={3} className="px-4 py-2 text-sm font-medium text-gray-900 w-8 text-center">
                                {importModal.selectedTransactions.size > 0 && (
                                  <span className="text-gray-600">
                                    {importModal.selectedTransactions.size} selected
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right w-8 text-center">
                                ${importModal.csvData.reduce((sum, tx) => sum + tx.amount, 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
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
                            // Insert all transactions into imported_transactions
                            const { data, error } = await supabase
                              .from('imported_transactions')
                              .insert(importModal.csvData)
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
                              error: null
                            }))

                            // Refresh the transactions list
                            refreshAll()
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
          className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50"
          onClick={() => setEditModal({ isOpen: false, transaction: null })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] max-h-[80vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Transaction</h2>
              <button
                onClick={() => setEditModal({ isOpen: false, transaction: null })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
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
                  Amount
                </label>
                <input
                  type="number"
                  value={editModal.transaction.amount}
                  onChange={(e) => setEditModal(prev => ({
                    ...prev,
                    transaction: prev.transaction ? {
                      ...prev.transaction,
                      amount: parseFloat(e.target.value)
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
                    const isAccountDebit = editModal.transaction?.debit_account_id === selectedAccountIdInCOA;
                    const categoryId = isAccountDebit ? editModal.transaction?.credit_account_id : editModal.transaction?.debit_account_id;
                    return opt.value === categoryId;
                  })}
                  onChange={(selectedOption) => {
                    if (selectedOption && editModal.transaction) {
                      const updatedTransaction = { ...editModal.transaction };
                      const isAccountDebit = updatedTransaction.debit_account_id === selectedAccountIdInCOA;
                      if (isAccountDebit) {
                        updatedTransaction.credit_account_id = selectedOption.value;
                      } else {
                        updatedTransaction.debit_account_id = selectedOption.value;
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
          className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50"
          onClick={() => setAccountEditModal({ isOpen: false, account: null, newName: '' })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Account Name</h2>
              <button
                onClick={() => setAccountEditModal({ isOpen: false, account: null, newName: '' })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
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
          className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50"
          onClick={() => setNewCategoryModal({ isOpen: false, name: '', type: 'Expense', parent_id: null, transactionId: null })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] max-h-[80vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add New Category</h2>
              <button
                onClick={() => setNewCategoryModal({ isOpen: false, name: '', type: 'Expense', parent_id: null, transactionId: null })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
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
                  onChange={(selectedOption) => setNewCategoryModal(prev => ({
                    ...prev,
                    parent_id: selectedOption?.value || null
                  }))}
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

      {/* Manual Account Modal */}
      {manualAccountModal.isOpen && (
        <div 
          className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50"
          onClick={() => setManualAccountModal({ isOpen: false, name: '', type: 'Asset' })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] max-h-[80vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add New Manual Account</h2>
              <button
                onClick={() => setManualAccountModal({ isOpen: false, name: '', type: 'Asset' })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
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
                </select>
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
          className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50"
          onClick={() => setAccountNamesModal({ isOpen: false, accounts: [], accountToDelete: null, deleteConfirmation: '' })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Accounts</h2>
              <button
                onClick={() => setAccountNamesModal({ isOpen: false, accounts: [], accountToDelete: null, deleteConfirmation: '' })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
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
                        Type "delete" to confirm.
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
        <div className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[800px] max-h-[80vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add Journal Entry</h2>
              <button
                onClick={() => setJournalEntryModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
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
        <div className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[800px] max-h-[80vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Past Journal Entries</h2>
              <button
                onClick={() => setPastJournalEntriesModal(prev => ({ ...prev, isOpen: false }))}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
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
                          <td className="text-right py-2">${tx.amount.toFixed(2)}</td>
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
        <div className="fixed inset-0 backdrop-blur-sm bg-white/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[800px] max-h-[80vh] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Journal Entry</h2>
              <button
                onClick={() => setEditJournalEntryModal({ isOpen: false, entry: null })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
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

      <div className="flex gap-8">
        {/* To Add */}
        <div className="w-1/2 space-y-2">
          <h2 className="font-semibold text-lg mb-1 flex items-center">
            To Add
            {(() => {
              const selected = accounts.find(a => a.plaid_account_id === selectedAccountId);
              if (!selected || selected.is_manual) return null;
              return (
                <span className="ml-4 text-gray-500 text-base font-normal">
                  (Current Balance: ${currentBalance.toFixed(2)})
                </span>
              );
            })()}
          </h2>
          <input
            type="text"
            placeholder="Search To Add..."
            value={searchToAdd}
            onChange={e => setSearchToAdd(e.target.value)}
            className="border px-2 py-1 mb-2 w-full"
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
                  onClick={() => handleSort('amount', 'toAdd')}
                >
                  Amount {toAddSortConfig.key === 'amount' && (toAddSortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="border p-1 w-8 text-center">Category</th>
                <th className="border p-1 w-8 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {imported.map(tx => (
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
                  <td className="border p-1 w-8 text-center">{formatDate(tx.date)}</td>
                  <td className="border p-1 w-8 text-center" style={{ minWidth: 250 }}>{tx.description}</td>
                  <td className="border p-1 w-8 text-center">{tx.amount}</td>
                  <td className="border p-1 w-8 text-center" style={{ minWidth: 150 }}>
                    <Select
                      options={categoryOptions}
                      value={categoryOptions.find(opt => opt.value === selectedCategories[tx.id]) || categoryOptions[0]}
                      onChange={(selectedOption) => {
                        if (selectedOption?.value === 'add_new') {
                          setNewCategoryModal({ 
                            isOpen: true, 
                            name: '', 
                            type: 'Expense', 
                            parent_id: null,
                            transactionId: tx.id 
                          });
                          return;
                        }
                        if (selectedToAdd.has(tx.id) && selectedToAdd.size > 1) {
                          setSelectedCategories(prev => {
                            const updated = { ...prev };
                            selectedToAdd.forEach(id => {
                              updated[id] = selectedOption?.value || '';
                            });
                            return updated;
                          });
                        } else {
                          setSelectedCategories(prev => ({
                            ...prev,
                            [tx.id]: selectedOption?.value || ''
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
                          await addTransaction(tx, selectedCategories[tx.id]);
                          setSelectedCategories(prev => {
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
              ))}
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
                        await addTransaction(tx, selectedCategories[tx.id]);
                      }
                    }
                    setSelectedCategories(prev => {
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

        {/* Added */}
        <div className="w-1/2 space-y-2">
          <h2 className="font-semibold text-lg mb-1 flex items-center">
            Added
            <span className="ml-4 text-gray-500 text-base font-normal">
              (Switch Balance: ${switchBalance.toFixed(2)})
            </span>
          </h2>
          <input
            type="text"
            placeholder="Search Added..."
            value={searchAdded}
            onChange={e => setSearchAdded(e.target.value)}
            className="border px-2 py-1 mb-2 w-full"
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
                  onClick={() => handleSort('amount', 'added')}
                >
                  Amount {addedSortConfig.key === 'amount' && (addedSortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
                <th className="border p-1 w-8 text-center">Category</th>
                <th className="border p-1 w-8 text-center">Undo</th>
              </tr>
            </thead>
            <tbody>
              {confirmed.map(tx => {
                const isAccountDebit = tx.debit_account_id === selectedAccountIdInCOA;
                const categoryId = isAccountDebit ? tx.credit_account_id : tx.debit_account_id;
                const category = categories.find(c => c.id === categoryId);
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
                    <td className="border p-1 w-8 text-center">{formatDate(tx.date)}</td>
                    <td className="border p-1 w-8 text-center" style={{ minWidth: 250 }}>{tx.description}</td>
                    <td className="border p-1 w-8 text-center">{getDisplayAmount(tx, category)}</td>
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

          {/* Manual transaction form */}
          <div className="border rounded p-2 space-x-2 mt-2 bg-gray-50 flex flex-wrap items-center gap-2">
            <div className="relative">
              <input 
                type="date" 
                value={manualDate} 
                onChange={(e) => setManualDate(e.target.value)} 
                className="border px-2 py-1 w-[32px] h-[32px] appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'%3E%3C/rect%3E%3Cline x1='16' y1='2' x2='16' y2='6'%3E%3C/line%3E%3Cline x1='8' y1='2' x2='8' y2='6'%3E%3C/line%3E%3Cline x1='3' y1='10' x2='21' y2='10'%3E%3C/line%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  backgroundSize: '16px',
                  color: 'transparent'
                }}
              />
            </div>
            <input type="text" placeholder="Description" value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} className="border px-2 py-1" />
            <input type="number" placeholder="Amount" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} className="border px-2 py-1" />
            <Select
              options={categoryOptions}
              value={categoryOptions.find(opt => opt.value === manualCategoryId) || categoryOptions[0]}
              onChange={selectedOption => setManualCategoryId(selectedOption?.value || '')}
              isSearchable
              styles={{ control: (base) => ({ ...base, minHeight: '30px', fontSize: '0.875rem' }) }}
              className="inline-block"
            />
            <button
              onClick={addManualTransaction}
              className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
              disabled={!manualDate || !manualDescription || !manualAmount || !manualCategoryId}
            >
              Add Manual
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
