'use client';

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/zustand/authStore';
import { useTransactionsStore, type ManualJournalEntry } from '@/zustand/transactionsStore';
import { useCategoriesStore, type Category } from '@/zustand/categoriesStore';
import { usePayeesStore } from '@/zustand/payeesStore';
import ManualJeModal, { 
  type JournalEntryLine, 
  type NewJournalEntry, 
  type EditJournalModalState 
} from '@/components/ManualJeModal';

import { X } from 'lucide-react';
import Select from 'react-select';
import { 
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
  key: 'date' | 'description' | 'type' | 'payee' | 'debit' | 'credit' | 'category' | 'reference_number' | null;
  direction: 'asc' | 'desc';
};

type SelectOption = {
  value: string;
  label: string;
};

export default function JournalTablePage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!(currentCompany);
  
  // Store hooks
  const { fetchAccounts, manualJournalEntries, fetchManualJournalEntries, saveManualJournalEntry, updateManualJournalEntry, isLoading, error } = useTransactionsStore();
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
    description: '',
    jeName: '',
    lines: [
      {
        id: '1',
        description: '',
        categoryId: '',
        payeeId: '',
        debit: '0.00',
        credit: '0.00'
      },
      {
        id: '2',
        description: '',
        categoryId: '',
        payeeId: '',
        debit: '0.00',
        credit: '0.00'
      },
      {
        id: '3',
        description: '',
        categoryId: '',
        payeeId: '',
        debit: '0.00',
        credit: '0.00'
      },
      {
        id: '4',
        description: '',
        categoryId: '',
        payeeId: '',
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

  // Edit journal entry modal state
  const [editModal, setEditModal] = useState<EditJournalModalState>({
    isOpen: false,
    referenceNumber: '',
    editEntry: {
      date: '',
      description: '',
      jeName: '',
      lines: []
    },
    saving: false,
    error: null
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
      fetchManualJournalEntries(currentCompany!.id);
      refreshCategories();
      refreshPayees();
      fetchAccounts(currentCompany!.id);
    }
  }, [currentCompany?.id, hasCompanyContext, refreshCategories, refreshPayees, fetchAccounts, fetchManualJournalEntries]);

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
    return amount > 0 ? `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
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



  const sortEntries = (entries: ManualJournalEntry[], sortConfig: SortConfig) => {
    if (!sortConfig.key) return entries;

    return [...entries].sort((a, b) => {
      if (!sortConfig.key) return 0;
      
      if (sortConfig.key === 'date') {
        return sortConfig.direction === 'asc' 
          ? new Date(a.date).getTime() - new Date(b.date).getTime()
          : new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      
      if (sortConfig.key === 'description') {
        const aName = a.description || '';
        const bName = b.description || '';
        return sortConfig.direction === 'asc'
          ? aName.localeCompare(bName)
          : bName.localeCompare(aName);
      }
      if (sortConfig.key === 'type') {
        const aType = getAccountType(a.chart_account_id);
        const bType = getAccountType(b.chart_account_id);
        return sortConfig.direction === 'asc'
          ? aType.localeCompare(bType)
          : bType.localeCompare(aType);
      }
      if (sortConfig.key === 'debit') {
        return sortConfig.direction === 'asc'
          ? (a.debit ?? 0) - (b.debit ?? 0)
          : (b.debit ?? 0) - (a.debit ?? 0);
      }
      if (sortConfig.key === 'credit') {
        return sortConfig.direction === 'asc'
          ? (a.credit ?? 0) - (b.credit ?? 0)
          : (b.credit ?? 0) - (a.credit ?? 0);
      }
      if (sortConfig.key === 'category') {
        const aCategory = getAccountName(a.chart_account_id);
        const bCategory = getAccountName(b.chart_account_id);
        return sortConfig.direction === 'asc'
          ? aCategory.localeCompare(bCategory)
          : bCategory.localeCompare(aCategory);
      }
      if (sortConfig.key === 'reference_number') {
        return sortConfig.direction === 'asc'
          ? a.reference_number.localeCompare(b.reference_number)
          : b.reference_number.localeCompare(a.reference_number);
      }
      return 0;
    });
  };

  const handleSort = (key: 'date' | 'description' | 'type' | 'payee' | 'debit' | 'credit' | 'category' | 'reference_number') => {
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

  // Define specific column order for the manual journal table
  const orderedColumns = [
    { key: 'date', label: 'Date', sortable: true },
    { key: 'description', label: 'Description', sortable: true },
    { key: 'type', label: 'Type', isCustom: true, sortable: true },
    { key: 'debit', label: 'Debit', sortable: true },
    { key: 'credit', label: 'Credit', sortable: true },
    { key: 'payee', label: 'Payee', isCustom: true, sortable: true }
  ];

  // Get all available columns from manualJournalEntries to include any additional fields
  const availableColumns = Array.from(
    manualJournalEntries.reduce((cols, entry) => {
      Object.keys(entry).forEach((k) => cols.add(k));
      return cols;
    }, new Set<string>())
  ).filter((col): col is string => 
    col !== 'id' && 
    col !== 'company_id' && 
    col !== 'chart_account_id' && 
    col !== 'reference_number' &&
    col !== 'created_at' &&
    col !== 'updated_at' &&
    col !== 'chart_of_accounts'
  );

  // Combine ordered columns with any additional columns not in our predefined list, then add category at the end
  const finalColumns = [
    ...orderedColumns,
    ...availableColumns
      .filter(col => !orderedColumns.some(ordCol => ordCol.key === col) && col !== 'payee_id' && col !== 'reference_number')
      .map(col => ({ key: col, label: formatColumnLabel(col), sortable: false })),
    { key: 'category', label: 'Category', isCustom: true, sortable: true }
  ];

  const filterEntries = (entries: ManualJournalEntry[], searchTerm: string, startDate: string, endDate: string) => {
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
      if (entry.description && entry.description.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in type
      const accountType = getAccountType(entry.chart_account_id);
      if (accountType.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in debit amount (formatted)
      const debitAmount = formatAmountLocal(entry.debit);
      if (debitAmount.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in credit amount (formatted)
      const creditAmount = formatAmountLocal(entry.credit);
      if (creditAmount.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in category name
      const categoryName = getAccountName(entry.chart_account_id);
      if (categoryName.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in reference number
      if (entry.reference_number && entry.reference_number.toLowerCase().includes(lowercaseSearch)) return true;
      
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
  const filteredEntries = filterEntries(manualJournalEntries, searchTerm, startDate, endDate);
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
        payeeId: '',
        debit: '0.00',
        credit: '0.00'
      }]
    }));
  };

  const removeJournalLine = (lineId: string) => {
    // Only allow removal if there are more than 1 lines
    if (newEntry.lines.length <= 1) return;
    
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

  const handleEditJournalEntry = (entry: ManualJournalEntry) => {
    // Find all entries with the same reference number to get the complete journal entry
    const relatedEntries = manualJournalEntries.filter(e => e.reference_number === entry.reference_number);
    
    // Convert manual journal entries back to the edit format
    const editLines: JournalEntryLine[] = relatedEntries.map((relatedEntry, index) => ({
      id: (index + 1).toString(),
      description: relatedEntry.description || '',
      categoryId: relatedEntry.chart_account_id || '',
      payeeId: relatedEntry.payee_id || '',
      debit: relatedEntry.debit > 0 ? relatedEntry.debit.toString() : '0.00',
      credit: relatedEntry.credit > 0 ? relatedEntry.credit.toString() : '0.00'
    }));
    
    setEditModal({
      isOpen: true,
      referenceNumber: entry.reference_number,
      editEntry: {
        date: entry.date,
        description: entry.description || '',
        jeName: entry.je_name || '',
        lines: editLines
      },
      saving: false,
      error: null
    });
  };

  // Functions for edit modal
  const updateEditJournalLine = (lineId: string, field: keyof JournalEntryLine, value: string) => {
    setEditModal(prev => ({
      ...prev,
      editEntry: {
        ...prev.editEntry,
        lines: prev.editEntry.lines.map(line =>
          line.id === lineId ? { ...line, [field]: value } : line
        )
      }
    }));
  };

  const handleEditAmountChange = (lineId: string, field: 'debit' | 'credit', value: string) => {
    const inputValue = value;
    updateEditJournalLine(lineId, field, inputValue || '0.00');
    
    // Clear the opposite field when entering an amount
    if (inputValue) {
      const oppositeField = field === 'debit' ? 'credit' : 'debit';
      updateEditJournalLine(lineId, oppositeField, '0.00');
    }
  };

  const addEditJournalLine = () => {
    const newLineId = (editModal.editEntry.lines.length + 1).toString();
    setEditModal(prev => ({
      ...prev,
      editEntry: {
        ...prev.editEntry,
        lines: [...prev.editEntry.lines, {
          id: newLineId,
          description: '',
          categoryId: '',
          payeeId: '',
          debit: '0.00',
          credit: '0.00'
        }]
      }
    }));
  };

  const removeEditJournalLine = (lineId: string) => {
    // Only allow removal if there are more than 1 lines
    if (editModal.editEntry.lines.length <= 1) return;
    
    setEditModal(prev => ({
      ...prev,
      editEntry: {
        ...prev.editEntry,
        lines: prev.editEntry.lines.filter(line => line.id !== lineId)
      }
    }));
  };

  // Calculate totals for validation and display
  const calculateTotals = () => {
    const totalDebits = newEntry.lines.reduce((sum, line) => {
      const debit = parseFloat(line.debit) || 0;
      return sum + debit;
    }, 0);

    const totalCredits = newEntry.lines.reduce((sum, line) => {
      const credit = parseFloat(line.credit) || 0;
      return sum + credit;
    }, 0);

    return { totalDebits, totalCredits };
  };

  const { totalDebits, totalCredits } = calculateTotals();
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const handleAddEntry = async () => {
    if (!currentCompany?.id) return;
    
    // Validation
    if (!newEntry.date) {
      alert('Please select a date');
      return;
    }

    try {
      setSaving(true);
      
      // Basic validation - at least one debit and one credit line
      const hasValidLines = newEntry.lines.some(line => 
        (line.debit && !isZeroAmount(line.debit)) || (line.credit && !isZeroAmount(line.credit))
      );
      
      if (!hasValidLines) {
        alert('Please enter at least one debit or credit amount');
        return;
      }

      // Validation - debits must equal credits
      if (!isBalanced) {
        alert('Total debits must equal total credits');
        return;
      }

      // Reset form and close modal
      setNewEntry({
        date: new Date().toISOString().split('T')[0],
        description: '',
        jeName: '',
        lines: [
          {
            id: '1',
            description: '',
            categoryId: '',
            payeeId: '',
            debit: '0.00',
            credit: '0.00'
          },
          {
            id: '2',
            description: '',
            categoryId: '',
            payeeId: '',
            debit: '0.00',
            credit: '0.00'
          },
          {
            id: '3',
            description: '',
            categoryId: '',
            payeeId: '',
            debit: '0.00',
            credit: '0.00'
          },
          {
            id: '4',
            description: '',
            categoryId: '',
            payeeId: '',
            debit: '0.00',
            credit: '0.00'
          }
        ]
      });
      setShowAddModal(false);
      
      // Use the manual journal entry save function
      const result = await saveManualJournalEntry({
        date: newEntry.date,
        jeName: newEntry.jeName,
        lines: newEntry.lines.map(line => ({
          description: line.description,
          categoryId: line.categoryId,
          payeeId: line.payeeId,
          debit: line.debit,
          credit: line.credit
        }))
      }, currentCompany.id);
      
      if (!result.success) {
        alert(result.error || 'Failed to save manual journal entry');
        return;
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      alert(`Failed to add journal entry: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  // Calculate totals for edit modal validation and display
  const calculateEditTotals = () => {
    const totalDebits = editModal.editEntry.lines.reduce((sum, line) => {
      const debit = parseFloat(line.debit) || 0;
      return sum + debit;
    }, 0);

    const totalCredits = editModal.editEntry.lines.reduce((sum, line) => {
      const credit = parseFloat(line.credit) || 0;
      return sum + credit;
    }, 0);

    return { totalDebits, totalCredits };
  };

  const handleSaveEditEntry = async () => {
    if (!currentCompany?.id) return;
    
    // Validation
    if (!editModal.editEntry.date) {
      setEditModal(prev => ({ ...prev, error: 'Please select a date' }));
      return;
    }

    try {
      setEditModal(prev => ({ ...prev, saving: true, error: null }));
      
      // Basic validation - at least one debit and one credit line
      const hasValidLines = editModal.editEntry.lines.some(line => 
        (line.debit && !isZeroAmount(line.debit)) || (line.credit && !isZeroAmount(line.credit))
      );
      
      if (!hasValidLines) {
        setEditModal(prev => ({ ...prev, error: 'Please enter at least one debit or credit amount', saving: false }));
        return;
      }

      // Validation - debits must equal credits
      const { totalDebits, totalCredits } = calculateEditTotals();
      const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
      
      if (!isBalanced) {
        setEditModal(prev => ({ ...prev, error: 'Total debits must equal total credits', saving: false }));
        return;
      }

      // Use the manual journal entry update function
      const success = await updateManualJournalEntry({
        referenceNumber: editModal.referenceNumber,
        date: editModal.editEntry.date,
        jeName: editModal.editEntry.jeName,
        lines: editModal.editEntry.lines.map(line => ({
          description: line.description,
          categoryId: line.categoryId,
          payeeId: line.payeeId,
          debit: line.debit,
          credit: line.credit
        }))
      }, currentCompany.id);
      
      if (!success) {
        setEditModal(prev => ({ ...prev, error: 'Failed to update manual journal entry', saving: false }));
        return;
      }
      
      // Close modal and refresh data
      setEditModal({
        isOpen: false,
        referenceNumber: '',
        editEntry: { date: '', description: '', jeName: '', lines: [] },
        saving: false,
        error: null
      });
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      setEditModal(prev => ({ ...prev, error: `Failed to update journal entry: ${errorMessage}`, saving: false }));
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
        // Check if we're in edit mode or add mode
        if (editModal.isOpen) {
          updateEditJournalLine(newCategoryModal.lineId, 'categoryId', result.categoryId);
        } else {
          updateJournalLine(newCategoryModal.lineId, 'categoryId', result.categoryId);
        }
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
      ) : !manualJournalEntries.length ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-gray-500 mb-4 text-xs">No manual journal entries found</div>
          <button
            onClick={() => setShowAddModal(true)}
            className="border px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs"
          >
            Add
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end items-center mb-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
            >
              Add Manual Entry
            </button>
          </div>
          <div className="flex gap-2 items-center mb-2">
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
                      onClick={col.sortable ? () => handleSort(col.key as 'date' | 'description' | 'type' | 'payee' | 'debit' | 'credit' | 'category' | 'reference_number' | 'description') : undefined}
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
                  <tr 
                    key={String(entry.id)} 
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleEditJournalEntry(entry)}
                  >
                    {finalColumns.map((col) => (
                      <td key={col.key} className="border p-2 text-center text-xs whitespace-nowrap">
                        {col.key === 'date' ? (
                          formatDate(entry.date)
                        ) : col.key === 'description' ? (
                          entry.description || ''
                        ) : col.key === 'payee' ? (
                          getPayeeName(entry.payee_id || '')
                        ) : col.key === 'type' ? (
                          getAccountType(entry.chart_account_id)
                        ) : col.key === 'debit' ? (
                          formatAmountLocal(entry.debit)
                        ) : col.key === 'credit' ? (
                          formatAmountLocal(entry.credit)
                        ) : col.key === 'category' ? (
                          getAccountName(entry.chart_account_id)
                        ) : col.key === 'reference_number' ? (
                          entry.reference_number
                        ) : (
                          String((entry as unknown as Record<string, unknown>)[col.key] ?? '')
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
      
      {/* Manual Journal Entry Modals */}
      <ManualJeModal
        // Add Modal Props
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        newEntry={newEntry}
        setNewEntry={setNewEntry}
        saving={saving}
        isBalanced={isBalanced}
        totalDebits={totalDebits}
        totalCredits={totalCredits}
        addJournalLine={addJournalLine}
        removeJournalLine={removeJournalLine}
        updateJournalLine={updateJournalLine}
        handleAmountChange={handleAmountChange}
        handleAddEntry={handleAddEntry}
        
        // Edit Modal Props
        editModal={editModal}
        setEditModal={setEditModal}
        updateEditJournalLine={updateEditJournalLine}
        handleEditAmountChange={handleEditAmountChange}
        addEditJournalLine={addEditJournalLine}
        removeEditJournalLine={removeEditJournalLine}
        calculateEditTotals={calculateEditTotals}
        handleSaveEditEntry={handleSaveEditEntry}
        
        // Shared Props
        categoryOptions={categoryOptions}
        payees={payees}
        setNewCategoryModal={setNewCategoryModal}
      />

      {/* New Category Modal */}
      {newCategoryModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 flex items-center justify-center h-full z-150"
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
                  <option value="Bank Account">Bank Account</option>
                  <option value="Credit Card">Credit Card</option>
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
                onClick={() => handleCreateCategory()}
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