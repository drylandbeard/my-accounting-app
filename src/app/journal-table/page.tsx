'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/zustand/authStore';
import { useTransactionsStore, type JournalTableEntry } from '@/zustand/transactionsStore';
import { useCategoriesStore, type Category } from '@/zustand/categoriesStore';
import { usePayeesStore } from '@/zustand/payeesStore';
import { X } from 'lucide-react';
import Select from 'react-select';
import { 
  parseAmount, 
  toFinancialAmount, 
  addAmounts, 
  subtractAmounts, 
  isZeroAmount
} from '@/lib/financial';
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

type SortConfig = {
  key: 'date' | 'description' | 'type' | 'payee' | 'debit' | 'credit' | 'category' | null;
  direction: 'asc' | 'desc';
};

type SelectOption = {
  value: string;
  label: string;
};

type JournalEntryLine = {
  id: string;
  description: string;
  categoryId: string;
  debit: string;
  credit: string;
};

type NewJournalEntry = {
  date: string;
  lines: JournalEntryLine[];
};

export default function JournalTablePage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!(currentCompany);
  
  // Store hooks
  const { saveJournalEntry, accounts, selectedAccountId, setSelectedAccountId, fetchAccounts, journalEntries, fetchJournalEntries, isLoading, error } = useTransactionsStore();
  const { categories, refreshCategories, createCategoryForTransaction } = useCategoriesStore();
  const { payees, refreshPayees } = usePayeesStore();
  

  
  // Local state
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEntry, setNewEntry] = useState<NewJournalEntry>({
    date: new Date().toISOString().split('T')[0],
    lines: [
      {
        id: '1',
        description: '',
        categoryId: '',
        debit: '0.00',
        credit: '0.00'
      },
      {
        id: '2',
        description: '',
        categoryId: '',
        debit: '0.00',
        credit: '0.00'
      }
    ]
  });
  const [saving, setSaving] = useState(false);
  
  // New category modal state
  const [newCategoryModal, setNewCategoryModal] = useState<{
    isOpen: boolean;
    name: string;
    type: string;
    parent_id: string | null;
    lineId: string | null;
  }>({
    isOpen: false,
    name: '',
    type: 'Expense',
    parent_id: null,
    lineId: null
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Fixed items per page

  // Category dropdown options
  const categoryOptions: SelectOption[] = [
    { value: '', label: 'Select category...' },
    { value: 'add_new', label: '+ Add new category' },
    ...categories.map(c => ({ value: c.id, label: c.name })),
  ];

  useEffect(() => {
    if (hasCompanyContext) {
      fetchJournalEntries(currentCompany!.id);
      refreshCategories();
      refreshPayees();
      fetchAccounts(currentCompany!.id);
    }
  }, [currentCompany?.id, hasCompanyContext, refreshCategories, refreshPayees, fetchAccounts, fetchJournalEntries]);

  // Reset to first page when search term or date filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate]);



  const formatDate = (dateString: string) => {
    // Parse the date string and create a UTC date
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const formattedMonth = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const formattedDay = date.getUTCDate().toString().padStart(2, '0');
    return `${formattedMonth}-${formattedDay}-${date.getUTCFullYear()}`;
  };

  const formatAmountLocal = (amount: number) => {
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

  const sortEntries = (entries: JournalTableEntry[], sortConfig: SortConfig) => {
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

  // Get all available columns from journalEntries to include any additional fields
  const availableColumns = Array.from(
    journalEntries.reduce((cols, entry) => {
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

  const filterEntries = (entries: JournalTableEntry[], searchTerm: string, startDate: string, endDate: string) => {
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
        formatAmountLocal(parseFloat(entry.split_item_data.spent)) : 
        formatAmountLocal(entry.debit);
      if (debitAmount.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in credit amount (formatted) - handle split items
      const creditAmount = entry.is_split_item && entry.split_item_data?.received ? 
        formatAmountLocal(parseFloat(entry.split_item_data.received)) : 
        formatAmountLocal(entry.credit);
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
  const filteredEntries = filterEntries(journalEntries, searchTerm, startDate, endDate);
  const sortedAndFilteredEntries = sortEntries(filteredEntries, sortConfig);
  
  // Get paginated data
  const paginationData = getPaginatedData(sortedAndFilteredEntries, currentPage, itemsPerPage);
  const { paginatedData: displayedEntries, totalPages, totalItems } = paginationData;

  const addJournalLine = () => {
    const newLineId = (newEntry.lines.length + 1).toString();
    setNewEntry(prev => ({
      ...prev,
      lines: [...prev.lines, {
        id: newLineId,
        description: '',
        categoryId: '',
        debit: '0.00',
        credit: '0.00'
      }]
    }));
  };

  const removeJournalLine = (lineId: string) => {
    if (newEntry.lines.length <= 2) return; // Minimum 2 lines
    setNewEntry(prev => ({
      ...prev,
      lines: prev.lines.filter(line => line.id !== lineId)
    }));
  };

  const updateJournalLine = (lineId: string, field: keyof JournalEntryLine, value: string) => {
    setNewEntry(prev => ({
      ...prev,
      lines: prev.lines.map(line =>
        line.id === lineId ? { ...line, [field]: value } : line
      )
    }));
  };

  const handleAmountChange = (lineId: string, field: 'debit' | 'credit', value: string) => {
    const inputValue = value;
    updateJournalLine(lineId, field, inputValue || '0.00');
    
    // Clear the opposite field when entering an amount
    if (inputValue) {
      const oppositeField = field === 'debit' ? 'credit' : 'debit';
      updateJournalLine(lineId, oppositeField, '0.00');
    }
  };



  const handleCreateCategory = async () => {
    if (!newCategoryModal.name.trim() || !hasCompanyContext) return;

    const result = await createCategoryForTransaction({
      name: newCategoryModal.name.trim(),
      type: newCategoryModal.type,
      parent_id: newCategoryModal.parent_id || undefined
    });

    if (result.success && result.categoryId) {
      // Set the newly created category to the journal line
      if (newCategoryModal.lineId) {
        updateJournalLine(newCategoryModal.lineId, 'categoryId', result.categoryId);
      }

      setNewCategoryModal({ 
        isOpen: false, 
        name: '', 
        type: 'Expense', 
        parent_id: null, 
        lineId: null 
      });
    } else {
      console.error('Error creating category:', result.error);
    }
  };

  const handleAddEntry = async () => {
    if (!currentCompany?.id) return;
    
    // Validation
    if (!newEntry.date) {
      alert('Please select a date');
      return;
    }
    
    if (!selectedAccountId) {
      alert('Please select an account');
      return;
    }
    
    // Calculate totals using financial utilities
    const totalDebits = newEntry.lines.reduce((sum, line) => 
      addAmounts(sum, line.debit || '0.00'), toFinancialAmount('0.00'));
    const totalCredits = newEntry.lines.reduce((sum, line) => 
      addAmounts(sum, line.credit || '0.00'), toFinancialAmount('0.00'));
    
    // Validate that we have at least one debit and one credit
    const hasDebit = newEntry.lines.some(line => line.debit && !isZeroAmount(line.debit));
    const hasCredit = newEntry.lines.some(line => line.credit && !isZeroAmount(line.credit));
    
    if (!hasDebit || !hasCredit) {
      alert('Please enter both debit and credit amounts');
      return;
    }
    
    if (!isZeroAmount(subtractAmounts(totalDebits, totalCredits))) {
      alert('Debits and credits must be equal');
      return;
    }
    
    // Validate that each line has required fields
    for (const line of newEntry.lines) {
      const hasAmount = (line.debit && !isZeroAmount(line.debit)) || (line.credit && !isZeroAmount(line.credit));
      if (hasAmount && !line.categoryId) {
        alert('Please select a category for all lines with amounts');
        return;
      }
      if (hasAmount && !line.description.trim()) {
        alert('Please enter a description for all lines with amounts');
        return;
      }
    }

    try {
      setSaving(true);
      
      // Create journal entries for each line
      const entries = newEntry.lines.filter(line => 
        (line.debit && !isZeroAmount(line.debit)) || (line.credit && !isZeroAmount(line.credit))
      ).map(line => ({
        account_id: line.categoryId,
        amount: (line.debit && !isZeroAmount(line.debit)) ? parseAmount(line.debit).toNumber() : parseAmount(line.credit || '0.00').toNumber(),
        type: (line.debit && !isZeroAmount(line.debit)) ? 'debit' as const : 'credit' as const
      }));

      const entryData = {
        date: newEntry.date,
        description: newEntry.lines[0]?.description || 'Journal Entry',
        entries
      };

      const success = await saveJournalEntry(entryData, currentCompany.id);

      if (!success) {
        throw new Error('Failed to save journal entry');
      }

      // Reset form and close modal
      setNewEntry({
        date: new Date().toISOString().split('T')[0],
        lines: [
          {
            id: '1',
            description: '',
            categoryId: '',
            debit: '0.00',
            credit: '0.00'
          },
          {
            id: '2',
            description: '',
            categoryId: '',
            debit: '0.00',
            credit: '0.00'
          }
        ]
      });
      setShowAddModal(false);
      
      // Refresh the entries
      await fetchJournalEntries(currentCompany.id);
      
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
      {isLoading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : !journalEntries.length ? (
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
                            formatAmountLocal(parseFloat(entry.split_item_data.spent)) : 
                            formatAmountLocal(entry.debit)
                        ) : col.key === 'credit' ? (
                          entry.is_split_item && entry.split_item_data?.received ? 
                            formatAmountLocal(parseFloat(entry.split_item_data.received)) : 
                            formatAmountLocal(entry.credit)
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
            className="bg-white rounded-lg p-6 w-[800px] overflow-y-auto shadow-xl"
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
            
            {/* Date and Account selectors */}
            <div className="mb-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
                  className="border px-3 py-2 rounded text-sm w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account</label>
                <Select
                  options={[
                    { value: '', label: 'Select account...' },
                    ...accounts.map(account => ({
                      value: account.plaid_account_id || '',
                      label: account.name
                    }))
                  ]}
                  value={accounts.find(acc => acc.plaid_account_id === selectedAccountId) ? 
                    { value: selectedAccountId || '', label: accounts.find(acc => acc.plaid_account_id === selectedAccountId)?.name || '' } :
                    { value: '', label: 'Select account...' }
                  }
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    setSelectedAccountId(option?.value === '' ? null : option?.value || null);
                  }}
                  isSearchable
                  className="text-sm"
                />
              </div>
            </div>
            
            {/* Journal Entry Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="border px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="border px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                    <th className="border px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                    <th className="border px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {newEntry.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="border px-4 py-2">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => updateJournalLine(line.id, 'description', e.target.value)}
                          className="w-full border-0 px-0 py-0 text-xs focus:ring-0 focus:outline-none"
                          placeholder="Enter description"
                        />
                      </td>
                      <td className="border px-4 py-2">
                        <Select
                          options={categoryOptions}
                          value={categoryOptions.find(opt => opt.value === line.categoryId) || categoryOptions[0]}
                          onChange={(selectedOption) => {
                            const option = selectedOption as SelectOption | null;
                            if (option?.value === 'add_new') {
                              setNewCategoryModal({
                                isOpen: true,
                                name: '',
                                type: 'Expense',
                                parent_id: null,
                                lineId: line.id
                              });
                            } else {
                              updateJournalLine(line.id, 'categoryId', option?.value || '');
                            }
                          }}
                          isSearchable
                          menuPortalTarget={document.body}
                          styles={{
                            control: (base) => ({
                              ...base,
                              border: 'none',
                              boxShadow: 'none',
                              minHeight: 'auto',
                              fontSize: '12px',
                              '&:hover': {
                                border: 'none'
                              }
                            }),
                            menu: (base) => ({ 
                              ...base, 
                              zIndex: 9999,
                              fontSize: '12px'
                            }),
                            menuPortal: (base) => ({ 
                              ...base, 
                              zIndex: 9999 
                            })
                          }}
                        />
                      </td>
                      <td className="border px-4 py-2">
                        <input
                          type="text"
                          value={(() => {
                            const debit = line.debit;
                            return (debit && !isZeroAmount(debit)) ? debit : '';
                          })()}
                          onChange={(e) => handleAmountChange(line.id, 'debit', e.target.value)}
                          className="w-full border-0 px-0 py-0 text-xs text-right focus:ring-0 focus:outline-none"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="border px-4 py-2">
                        <input
                          type="text"
                          value={(() => {
                            const credit = line.credit;
                            return (credit && !isZeroAmount(credit)) ? credit : '';
                          })()}
                          onChange={(e) => handleAmountChange(line.id, 'credit', e.target.value)}
                          className="w-full border-0 px-0 py-0 text-xs text-right focus:ring-0 focus:outline-none"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="border px-4 py-2 text-center">
                        {newEntry.lines.length > 2 && (
                          <button
                            onClick={() => removeJournalLine(line.id)}
                            className="text-red-500 hover:text-red-700 text-xs"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={addJournalLine}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border"
              >
                Add lines
              </button>
              
              <button
                onClick={handleAddEntry}
                disabled={saving}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Category Modal */}
      {newCategoryModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() => setNewCategoryModal({ isOpen: false, name: '', type: 'Expense', parent_id: null, lineId: null })}
        >
          <div 
            className="bg-white rounded-lg p-6 w-[400px] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Add New Category</h2>
              <button
                onClick={() => setNewCategoryModal({ isOpen: false, name: '', type: 'Expense', parent_id: null, lineId: null })}
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
    </div>
  );
} 