'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useApiWithCompany } from '@/hooks/useApiWithCompany';
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';

type Payee = {
  id: string;
  name: string;
  company_id: string;
};

type Account = {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  company_id: string;
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
  };
  [key: string]: unknown; // Allow dynamic property access for additional columns
};

type SortConfig = {
  key: 'date' | 'description' | 'payee' | 'debit' | 'credit' | 'category' | null;
  direction: 'asc' | 'desc';
};

export default function JournalTablePage() {
  const { hasCompanyContext, currentCompany } = useApiWithCompany();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Fixed items per page

  useEffect(() => {
    fetchJournalEntries();
    fetchAccounts();
    fetchPayees();
  }, [currentCompany?.id]);

  // Reset to first page when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const fetchJournalEntries = async () => {
    if (!hasCompanyContext) return;
    
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('journal')
        .select(`
          *,
          transactions!inner(payee_id)
        `)
        .eq('company_id', currentCompany?.id)
        .order('date', { ascending: false });
      if (error) throw error;
      setEntries(data || []);
    } catch {
      setError('Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    if (!hasCompanyContext) return;
    
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('company_id', currentCompany?.id);
    if (!error) setAccounts(data || []);
  };

  const fetchPayees = async () => {
    if (!hasCompanyContext) return;
    
    const { data, error } = await supabase
      .from('payees')
      .select('*')
      .eq('company_id', currentCompany?.id)
      .order('name');
    if (!error) setPayees(data || []);
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
    const account = accounts.find(a => a.id === id);
    return account ? account.name : id;
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
      if (sortConfig.key === 'payee') {
        const aPayee = getPayeeName(a.transactions?.payee_id || '');
        const bPayee = getPayeeName(b.transactions?.payee_id || '');
        return sortConfig.direction === 'asc'
          ? aPayee.localeCompare(bPayee)
          : bPayee.localeCompare(aPayee);
      }
      if (sortConfig.key === 'debit') {
        const aDebit = a.debit ?? 0;
        const bDebit = b.debit ?? 0;
        return sortConfig.direction === 'asc'
          ? aDebit - bDebit
          : bDebit - aDebit;
      }
      if (sortConfig.key === 'credit') {
        const aCredit = a.credit ?? 0;
        const bCredit = b.credit ?? 0;
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

  const handleSort = (key: 'date' | 'description' | 'payee' | 'debit' | 'credit' | 'category') => {
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
    { key: 'id', label: formatColumnLabel('id'), sortable: false },
    { key: 'date', label: 'Date', sortable: true },
    { key: 'description', label: 'Description', sortable: true },
    { key: 'payee', label: 'Payee', isCustom: true, sortable: true },
    { key: 'debit', label: 'Debit', sortable: true },
    { key: 'credit', label: 'Credit', sortable: true }
  ];

  // Get all available columns from entries to include any additional fields
  const availableColumns = Array.from(
    entries.reduce((cols, entry) => {
      Object.keys(entry).forEach((k) => cols.add(k));
      return cols;
    }, new Set<string>())
  ).filter((col): col is string => col !== 'chart_account_id' && col !== 'payee_id' && col !== 'transactions');

  // Combine ordered columns with any additional columns not in our predefined list, then add category at the end
  const finalColumns = [
    ...orderedColumns,
    ...availableColumns
      .filter(col => !orderedColumns.some(ordCol => ordCol.key === col))
      .map(col => ({ key: col, label: formatColumnLabel(col), sortable: false })),
    { key: 'category', label: 'Category Name', isCustom: true, sortable: true }
  ];

  const filterEntries = (entries: JournalEntry[], searchTerm: string) => {
    if (!searchTerm.trim()) return entries;
    
    const lowercaseSearch = searchTerm.toLowerCase();
    
    return entries.filter(entry => {
      // Search in date (formatted)
      const formattedDate = formatDate(entry.date);
      if (formattedDate.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in description
      if (entry.description.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in payee name
      const payeeName = getPayeeName(entry.transactions?.payee_id || '');
      if (payeeName.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in debit amount (formatted)
      const debitAmount = formatAmount(entry.debit);
      if (debitAmount.toLowerCase().includes(lowercaseSearch)) return true;
      
      // Search in credit amount (formatted)
      const creditAmount = formatAmount(entry.credit);
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

  // Filter entries based on search term, then sort
  const filteredEntries = filterEntries(entries, searchTerm);
  const sortedAndFilteredEntries = sortEntries(filteredEntries, sortConfig);
  
  // Get paginated data
  const paginationData = getPaginatedData(sortedAndFilteredEntries, currentPage, itemsPerPage);
  const { paginatedData: displayedEntries, totalPages, totalItems } = paginationData;

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
          <input
            type="text"
            placeholder="Search journal entries..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border px-2 py-1 w-full text-xs mb-2"
          />

          <table className="w-full border-collapse border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  {finalColumns.map((col) => (
                    <th 
                      key={col.key} 
                      className={`border p-2 text-center text-xs font-medium tracking-wider ${
                        col.sortable ? 'cursor-pointer hover:bg-gray-200' : ''
                      }`}
                      onClick={col.sortable ? () => handleSort(col.key as 'date' | 'description' | 'payee' | 'debit' | 'credit' | 'category') : undefined}
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
                  <tr key={String(entry.id)} className="hover:bg-gray-50">
                    {finalColumns.map((col) => (
                      <td key={col.key} className="border p-2 text-center text-xs">
                        {col.key === 'date' ? (
                          formatDate(entry.date)
                        ) : col.key === 'debit' ? (
                          formatAmount(entry.debit)
                        ) : col.key === 'credit' ? (
                          formatAmount(entry.credit)
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
    </div>
  );
} 