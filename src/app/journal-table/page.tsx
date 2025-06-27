'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/zustand/authStore';
import { useTransactionsStore } from '@/zustand/transactionsStore';
import { useCategoriesStore, type Category } from '@/zustand/categoriesStore';
import { usePayeesStore } from '@/zustand/payeesStore';
import { X } from 'lucide-react';
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';

// Define types specific to the journal table

type SplitItem = {
  id: string;
  date: string;
  description: string;
  spent?: string;
  received?: string;
  payee_id?: string;
  selected_category_id?: string;
};

type SplitData = {
  splits: SplitItem[];
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
    split_data?: SplitData;
  };
  // Fields for split items displayed as journal entries
  is_split_item?: boolean;
  split_item_data?: SplitItem;
  [key: string]: unknown; // Allow dynamic property access for additional columns
};

type SortConfig = {
  key: 'date' | 'description' | 'type' | 'payee' | 'debit' | 'credit' | 'category' | null;
  direction: 'asc' | 'desc';
};

type NewJournalEntry = {
  date: string;
  description: string;
  amount: string;
  type: 'debit' | 'credit';
  categoryId: string;
};

export default function JournalTablePage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!(currentCompany);
  
  // Store hooks
  const { saveJournalEntry } = useTransactionsStore();
  const { categories, refreshCategories } = useCategoriesStore();
  const { payees, refreshPayees } = usePayeesStore();
  
  // Process journal entries to insert split items between debit/credit pairs
  const processEntriesWithSplits = (entries: JournalEntry[]): JournalEntry[] => {
    const processedEntries: JournalEntry[] = [];
    
    // Group entries by transaction_id to find debit/credit pairs
    const transactionGroups = new Map<string, JournalEntry[]>();
    
    entries.forEach(entry => {
      const txId = entry.transaction_id;
      if (!transactionGroups.has(txId)) {
        transactionGroups.set(txId, []);
      }
      transactionGroups.get(txId)!.push(entry);
    });
    
    // Process each transaction group
    transactionGroups.forEach(txEntries => {
      if (txEntries.length === 0) return;
      
      // Sort entries within transaction: debit first, then credit
      const sortedEntries = txEntries.sort((a, b) => {
        if (a.debit > 0 && b.credit > 0) return -1; // debit before credit
        if (a.credit > 0 && b.debit > 0) return 1;  // credit after debit
        return 0;
      });
      
      const firstEntry = sortedEntries[0];
      const splitData = firstEntry.transactions?.split_data;
      
      // Add the first entry (usually debit)
      processedEntries.push(firstEntry);
      
      // Add split items if they exist
      if (splitData?.splits && splitData.splits.length > 0) {
        splitData.splits.forEach((split, index) => {
          const splitEntry: JournalEntry = {
            id: `${firstEntry.id}-split-${index}`,
            date: split.date || firstEntry.date,
            description: `  ↳ ${split.description}`, // Indent split items
            debit: 0,
            credit: 0,
            transaction_id: firstEntry.transaction_id,
            chart_account_id: split.selected_category_id || '',
            company_id: firstEntry.company_id,
            is_split_item: true,
            split_item_data: split,
            transactions: {
              payee_id: split.payee_id
            }
          };
          processedEntries.push(splitEntry);
        });
      }
      
      // Add remaining entries (usually credit)
      sortedEntries.slice(1).forEach(entry => {
        processedEntries.push(entry);
      });
    });
    
    return processedEntries;
  };
  
  // Local state
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState<NewJournalEntry>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    type: 'debit',
    categoryId: ''
  });
  const [saving, setSaving] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Fixed items per page

  useEffect(() => {
    if (hasCompanyContext) {
      fetchJournalEntries();
      refreshCategories();
      refreshPayees();
    }
  }, [currentCompany?.id, hasCompanyContext, refreshCategories, refreshPayees]);

  // Reset to first page when search term or date filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate]);

  const fetchJournalEntries = async () => {
    if (!hasCompanyContext) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const { supabase } = await import('@/lib/supabase');
      
      // Fetch journal entries with transaction data including split_data
      const { data, error } = await supabase
        .from('journal')
        .select(`
          *,
          transactions!inner(payee_id, split_data)
        `)
        .eq('company_id', currentCompany?.id)
        .order('date', { ascending: false });
        
      if (error) throw error;
      
      // Process entries to insert split items between debit/credit pairs
      const processedEntries = processEntriesWithSplits(data || []);
      setEntries(processedEntries);
    } catch {
      setError('Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    // Parse the date string and create a UTC date
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const formattedMonth = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const formattedDay = date.getUTCDate().toString().padStart(2, '0');
    return `${formattedMonth}-${formattedDay}-${date.getUTCFullYear()}`;
  };

  const formatAmount = (amount: number) => {
    return amount ? `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
  };

  function getAccountName(id: string) {
    const account = categories.find((a: Category) => a.id === id);
    return account ? account.name : id;
  }

  function getAccountType(id: string) {
    const account = categories.find((a: Category) => a.id === id);
    return account ? account.type || '' : '';
  }

  function getPayeeName(id: string) {
    if (!id) return '';
    const payee = payees.find(p => p.id === id);
    return payee ? payee.name : '';
  }

  const sortEntries = (entries: JournalEntry[], sortConfig: SortConfig) => {
    if (!sortConfig.key) return entries;

    return [...entries].sort((a, b) => {
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
      if (sortConfig.key === 'type') {
        const aType = getAccountType(a.chart_account_id);
        const bType = getAccountType(b.chart_account_id);
        return sortConfig.direction === 'asc'
          ? aType.localeCompare(bType)
          : bType.localeCompare(aType);
      }
      if (sortConfig.key === 'payee') {
        const aPayee = getPayeeName(a.transactions?.payee_id || '');
        const bPayee = getPayeeName(b.transactions?.payee_id || '');
        return sortConfig.direction === 'asc'
          ? aPayee.localeCompare(bPayee)
          : bPayee.localeCompare(aPayee);
      }
      if (sortConfig.key === 'debit') {
        const aDebit = a.is_split_item && a.split_item_data?.spent ? 
          parseFloat(a.split_item_data.spent) : (a.debit ?? 0);
        const bDebit = b.is_split_item && b.split_item_data?.spent ? 
          parseFloat(b.split_item_data.spent) : (b.debit ?? 0);
        return sortConfig.direction === 'asc'
          ? aDebit - bDebit
          : bDebit - aDebit;
      }
      if (sortConfig.key === 'credit') {
        const aCredit = a.is_split_item && a.split_item_data?.received ? 
          parseFloat(a.split_item_data.received) : (a.credit ?? 0);
        const bCredit = b.is_split_item && b.split_item_data?.received ? 
          parseFloat(b.split_item_data.received) : (b.credit ?? 0);
        return sortConfig.direction === 'asc'
          ? aCredit - bCredit
          : bCredit - aCredit;
      }
      if (sortConfig.key === 'category') {
        const aCategory = getAccountName(a.chart_account_id);
        const bCategory = getAccountName(b.chart_account_id);
        return sortConfig.direction === 'asc'
          ? aCategory.localeCompare(bCategory)
          : bCategory.localeCompare(aCategory);
      }
      return 0;
    });
  };

  const handleSort = (key: 'date' | 'description' | 'type' | 'payee' | 'debit' | 'credit' | 'category') => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const formatColumnLabel = (columnName: string) => {
    // Convert snake_case to proper Title Case
    return columnName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Define specific column order for the journal table
  const orderedColumns = [
    { key: 'date', label: 'Date', sortable: true },
    { key: 'description', label: 'Description', sortable: true },
    { key: 'type', label: 'Type', isCustom: true, sortable: true },
    { key: 'debit', label: 'Debit', sortable: true },
    { key: 'credit', label: 'Credit', sortable: true },
    { key: 'payee', label: 'Payee', isCustom: true, sortable: true }
  ];

  // Get all available columns from entries to include any additional fields
  const availableColumns = Array.from(
    entries.reduce((cols, entry) => {
      Object.keys(entry).forEach((k) => cols.add(k));
      return cols;
    }, new Set<string>())
  ).filter((col): col is string => 
    col !== 'id' && 
    col !== 'transaction_id' && 
    col !== 'company_id' && 
    col !== 'chart_account_id' && 
    col !== 'payee_id' && 
    col !== 'transactions' &&
    col !== 'is_split_item' &&
    col !== 'split_item_data'
  );

  // Combine ordered columns with any additional columns not in our predefined list, then add category at the end
  const finalColumns = [
    ...orderedColumns,
    ...availableColumns
      .filter(col => !orderedColumns.some(ordCol => ordCol.key === col))
      .map(col => ({ key: col, label: formatColumnLabel(col), sortable: false })),
    { key: 'category', label: 'Category', isCustom: true, sortable: true }
  ];

  const filterEntries = (entries: JournalEntry[], searchTerm: string, startDate: string, endDate: string) => {
    let filteredEntries = entries;

    // Filter by date range
    if (startDate || endDate) {
      filteredEntries = filteredEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        
        if (start && entryDate < start) return false;
        if (end && entryDate > end) return false;
        
        return true;
      });
    }

    // Filter by search term
    if (!searchTerm.trim()) return filteredEntries;
    
    const lowercaseSearch = searchTerm.toLowerCase();
    
    return filteredEntries.filter(entry => {
      // Search in date (formatted)
      const formattedDate = formatDate(entry.date);
      if (formattedDate.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in description
      if (entry.description.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in type
      const accountType = getAccountType(entry.chart_account_id);
      if (accountType.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in payee name
      const payeeName = getPayeeName(entry.transactions?.payee_id || '');
      if (payeeName.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in debit amount (formatted) - handle split items
      const debitAmount = entry.is_split_item && entry.split_item_data?.spent ? 
        formatAmount(parseFloat(entry.split_item_data.spent)) : 
        formatAmount(entry.debit);
      if (debitAmount.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in credit amount (formatted) - handle split items
      const creditAmount = entry.is_split_item && entry.split_item_data?.received ? 
        formatAmount(parseFloat(entry.split_item_data.received)) : 
        formatAmount(entry.credit);
      if (creditAmount.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in category name
      const categoryName = getAccountName(entry.chart_account_id);
      if (categoryName.toLowerCase().includes(lowercaseSearch)) return true;
      
      return false;
    });
  };

  // Pagination utility function
  const getPaginatedData = <T,>(data: T[], currentPage: number, itemsPerPage: number) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      paginatedData: data.slice(startIndex, endIndex),
      totalPages: Math.ceil(data.length / itemsPerPage),
      totalItems: data.length,
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, data.length)
    };
  };

  // Custom Pagination Component
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

  // Filter entries based on search term and date range, then sort
  const filteredEntries = filterEntries(entries, searchTerm, startDate, endDate);
  const sortedAndFilteredEntries = sortEntries(filteredEntries, sortConfig);
  
  // Get paginated data
  const paginationData = getPaginatedData(sortedAndFilteredEntries, currentPage, itemsPerPage);
  const { paginatedData: displayedEntries, totalPages, totalItems } = paginationData;

  const handleAddEntry = async () => {
    if (!currentCompany?.id) return;
    
    // Validation
    const amount = parseFloat(newEntry.amount || '0');
    
    if (!newEntry.date || !newEntry.description) {
      alert('Please fill in date and description');
      return;
    }
    
    if (amount === 0) {
      alert('Please enter a non-zero amount');
      return;
    }

    if (!newEntry.categoryId) {
      alert('Please select a category');
      return;
    }

    try {
      setSaving(true);
      
      // Create journal entry using the store function
      const entryData = {
        date: newEntry.date,
        description: newEntry.description,
        entries: [{
          account_id: newEntry.categoryId,
          amount: amount,
          type: newEntry.type
        }]
      };

      const success = await saveJournalEntry(entryData, currentCompany.id);

      if (!success) {
        throw new Error('Failed to save journal entry');
      }

      // Reset form and close modal
      setNewEntry({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        type: 'debit',
        categoryId: ''
      });
      setShowAddModal(false);
      
      // Refresh the entries
      await fetchJournalEntries();
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      alert(`Failed to add journal entry: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

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
        <div className="space-y-4">
          <div className="flex gap-2 items-center mb-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
            >
              Add
            </button>
            <input
              type="text"
              placeholder="Search journal entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border px-2 py-1 flex-1 text-xs"
            />
            <div className="flex gap-2 items-center">
              <label className="text-xs whitespace-nowrap">Start Date:</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border px-2 py-1 text-xs"
              />
              <label className="text-xs whitespace-nowrap">End Date:</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border px-2 py-1 text-xs"
              />
            </div>
          </div>

          <div className="overflow-auto max-h-[calc(100vh-170px)] border border-gray-300 rounded">
            <table className="w-full border-collapse">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  {finalColumns.map((col) => (
                    <th 
                      key={col.key} 
                      className={`border p-2 text-center text-xs font-medium tracking-wider whitespace-nowrap ${
                        col.sortable ? 'cursor-pointer hover:bg-gray-200' : ''
                      }`}
                      onClick={col.sortable ? () => handleSort(col.key as 'date' | 'description' | 'type' | 'payee' | 'debit' | 'credit' | 'category') : undefined}
                    >
                      {col.label}
                      {col.sortable && sortConfig.key === col.key && (
                        <span className="ml-1">
                          {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedEntries.map((entry) => (
                  <tr key={String(entry.id)} className={`hover:bg-gray-50 ${entry.is_split_item ? 'bg-gray-50' : ''}`}>
                    {finalColumns.map((col) => (
                      <td key={col.key} className="border p-2 text-center text-xs whitespace-nowrap">
                        {col.key === 'date' ? (
                          formatDate(entry.date)
                        ) : col.key === 'debit' ? (
                          entry.is_split_item && entry.split_item_data?.spent ? 
                            formatAmount(parseFloat(entry.split_item_data.spent)) : 
                            formatAmount(entry.debit)
                        ) : col.key === 'credit' ? (
                          entry.is_split_item && entry.split_item_data?.received ? 
                            formatAmount(parseFloat(entry.split_item_data.received)) : 
                            formatAmount(entry.credit)
                        ) : col.key === 'type' ? (
                          getAccountType(entry.chart_account_id)
                        ) : col.key === 'payee' ? (
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

          <div className="flex justify-between items-center">
            {/* Pagination for Journal table */}
            <div className="mt-2 flex items-center justify-start gap-3">
              <span className="text-xs text-gray-600 whitespace-nowrap">
                {`${displayedEntries.length} of ${totalItems}`}
              </span>
              <CustomPagination 
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* Add Journal Entry Modal */}
      {showAddModal && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setShowAddModal(false)}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[600px] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add Journal Entry</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full border px-2 py-1 rounded text-xs"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newEntry.description}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border px-2 py-1 rounded text-xs"
                  placeholder="Enter description"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={newEntry.amount}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full border px-2 py-1 rounded text-xs"
                  placeholder="0.00"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newEntry.type}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, type: e.target.value as 'debit' | 'credit' }))}
                  className="w-full border px-2 py-1 rounded text-xs"
                >
                  <option value="debit">Debit</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
            </div>
            
            <div className="mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={newEntry.categoryId}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full border px-2 py-1 rounded text-xs"
                >
                  <option value="">Select category...</option>
                  {categories.map((account: Category) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <button
                onClick={handleAddEntry}
                disabled={saving}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 