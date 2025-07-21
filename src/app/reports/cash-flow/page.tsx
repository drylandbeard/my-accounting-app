"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { useTransactionsStore } from "@/zustand/transactionsStore";
import { useCategoriesStore } from "@/zustand/categoriesStore";
import { usePayeesStore } from "@/zustand/payeesStore";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TransactionModal, { EditJournalModalState as TransactionModalState, JournalEntryLine } from "@/components/TransactionModal";
import ManualJeModal, { EditJournalModalState as ManualJeModalState, NewJournalEntry } from "@/components/ManualJeModal";
import { useSearchParams } from "next/navigation";
import { useExportCashFlow } from "../_hooks/useExportCashFlow";

// Shared imports
import { Transaction, ViewerModalState } from "../_types";
import {
  formatDateForDisplay,
  formatNumber,
  getMonthsInRange,
  getQuartersInRange,
  formatMonth,
  formatQuarter,
  getAllAccountIds,
  getAllGroupAccountIds,
} from "../_utils";
import { useFinancialData } from "../_hooks/useFinancialData";
import { usePeriodSelection } from "../_hooks/usePeriodSelection";
import { useAccountOperations } from "../_hooks/useAccountOperations";
import { ReportHeader } from "../_components/ReportHeader";
import { TransactionViewer } from "../_components/TransactionViewer";
import { SaveReportModal } from "../_components/SaveReportModal";
import { api } from "@/lib/api";

export default function CashFlowPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;

  // Store hooks for modal functionality
  const { accounts: transactionAccounts } = useTransactionsStore();
  const { categories: storeCategories, addCategory } = useCategoriesStore();
  const { payees } = usePayeesStore();

  // Modal states
  const [editJournalModal, setEditJournalModal] = useState<TransactionModalState & { selectedAccountId?: string; selectedAccountCategoryId?: string }>({
    isOpen: false,
    isLoading: false,
    saving: false,
    error: null,
    transactionId: "",
    isManualEntry: false,
    editEntry: {
      date: "",
      description: "",
      lines: [],
    },
  });
  
  const [editManualModal, setEditManualModal] = useState<ManualJeModalState>({
    isOpen: false,
    referenceNumber: "",
    editEntry: {
      date: "",
      description: "",
      jeName: "",
      lines: [],
    },
    saving: false,
    error: null,
  });
  
  const [newCategoryModal, setNewCategoryModal] = useState({
    isOpen: false,
    name: "",
    type: "Asset",
    parent_id: null as string | null,
    lineId: null as string | null,
  });

  const {
    selectedPeriod,
    selectedPrimaryDisplay,
    selectedSecondaryDisplay,
    startDate,
    endDate,
    isMonthlyView,
    isQuarterlyView,
    setStartDate,
    setEndDate,
    handlePeriodChange,
    handlePrimaryDisplayChange,
    handleSecondaryDisplayChange,
  } = usePeriodSelection();

  // Get all account types needed for cash flow
  const { categories, actualBankAccounts, journalEntries, loading } = useFinancialData({
    companyId: currentCompany?.id || null,
    startDate: startDate,
    endDate: endDate,
    accountTypes: ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"],
  });

  const {
    collapsedAccounts,
    getTopLevelAccounts,
    calculateAccountTotal,
    collapseAllParentCategories,
    expandAllParentCategories,
    getParentAccounts,
  } = useAccountOperations({ categories, journalEntries });

  const [viewerModal, setViewerModal] = useState<ViewerModalState>({
    isOpen: false,
    category: null,
  });

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingSavedReport, setLoadingSavedReport] = useState(false);

  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");

  // Load saved report if reportId is provided
  useEffect(() => {
    const loadSavedReport = async () => {
      if (!reportId || !currentCompany?.id) return;

      setLoadingSavedReport(true);
      try {
        const response = await api.get(`/api/reports/saved/${reportId}`);

        if (response.ok) {
          const savedReport = await response.json();
          if (savedReport.type === "cash-flow") {
            // Apply saved parameters
            setStartDate(savedReport.parameters.startDate);
            setEndDate(savedReport.parameters.endDate);
            handlePrimaryDisplayChange(savedReport.parameters.primaryDisplay);
            handleSecondaryDisplayChange(savedReport.parameters.secondaryDisplay);
            if (savedReport.parameters.period) {
              handlePeriodChange(savedReport.parameters.period);
            }
          }
        }
      } catch (error) {
        console.error("Failed to load saved report:", error);
      } finally {
        setLoadingSavedReport(false);
      }
    };

    loadSavedReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, currentCompany?.id]); // Only depend on reportId and currentCompany?.id

  // Account groups
  const revenueRows = getTopLevelAccounts("Revenue");
  const cogsRows = getTopLevelAccounts("COGS");
  const expenseRows = getTopLevelAccounts("Expense");

  // Get bank accounts for beginning and ending balance - specifically "Bank Account" type as per business requirements
  const bankAccounts = useMemo(() => {
    return actualBankAccounts.filter((acc) => acc.type === "Bank Account");
  }, [actualBankAccounts]);

  // Beginning Bank Balance: starting balance + all transactions before start date (as per business requirements)
  const beginningBankBalance = useMemo(() => {
    return bankAccounts.reduce((total, account) => {
      // Start with the account's starting balance
      const startingBalance = Number(account.starting_balance) || 0;

      // Add all transactions before the start date
      const transactionsBeforeStart = journalEntries.filter(
        (tx) => tx.chart_account_id === account.plaid_account_id && tx.date < startDate
      );
      const transactionTotal = transactionsBeforeStart.reduce(
        (sum, tx) => sum + Number(tx.debit) - Number(tx.credit),
        0
      );

      // Beginning balance = starting balance + transactions before start date
      return total + startingBalance + transactionTotal;
    }, 0);
  }, [actualBankAccounts, journalEntries, startDate]);

  // Period-specific calculation functions
  const calculateOperatingActivitiesForPeriod = useCallback(
    (periodStart: string, periodEnd: string) => {
      const revenueAccounts = getTopLevelAccounts("Revenue");
      const cogsAccounts = getTopLevelAccounts("COGS");
      const expenseAccounts = getTopLevelAccounts("Expense");

      const revenue = revenueAccounts.reduce((sum, account) => {
        const transactions = journalEntries.filter(
          (tx) =>
            getAllAccountIds(categories, account).includes(tx.chart_account_id) &&
            tx.date >= periodStart &&
            tx.date <= periodEnd
        );
        return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.credit) - Number(tx.debit), 0);
      }, 0);

      const cogs = cogsAccounts.reduce((sum, account) => {
        const transactions = journalEntries.filter(
          (tx) =>
            getAllAccountIds(categories, account).includes(tx.chart_account_id) &&
            tx.date >= periodStart &&
            tx.date <= periodEnd
        );
        return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.debit) - Number(tx.credit), 0);
      }, 0);

      const expenses = expenseAccounts.reduce((sum, account) => {
        const transactions = journalEntries.filter(
          (tx) =>
            getAllAccountIds(categories, account).includes(tx.chart_account_id) &&
            tx.date >= periodStart &&
            tx.date <= periodEnd
        );
        return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.debit) - Number(tx.credit), 0);
      }, 0);

      return { revenue, cogs, expenses, netIncome: revenue - cogs - expenses };
    },
    [categories, journalEntries, getTopLevelAccounts]
  );

  const calculateInvestingActivitiesForPeriod = useCallback(
    (periodStart: string, periodEnd: string) => {
      // Get asset accounts excluding bank accounts as per business requirements
      const assetAccounts = categories.filter((acc) => acc.type === "Asset");

      // Increase in Assets: total of assets debits (purchased) excluding bank accounts
      const increaseInAssets = assetAccounts.reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
        );
        // For assets, debits represent purchases/increases
        const debits = accountTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
        return total + debits;
      }, 0);

      // Decrease in Assets: total of assets sold (credits to asset accounts)
      const decreaseInAssets = assetAccounts.reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
        );
        // For assets, credits represent sales/decreases
        const credits = accountTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
        return total + credits;
      }, 0);

      // Investing Change: Decrease in Assets - Increase in Assets (as per business requirements)
      const netInvestingChange = decreaseInAssets - increaseInAssets;

      return { increaseInAssets, decreaseInAssets, netInvestingChange };
    },
    [categories, journalEntries]
  );

  const calculateFinancingActivitiesForPeriod = useCallback(
    (periodStart: string, periodEnd: string) => {
      const liabilityAccounts = categories.filter((acc) => acc.type === "Liability");
      const equityAccounts = categories.filter((acc) => acc.type === "Equity");
      const creditCardAccounts = categories.filter((acc) => acc.type === "Credit Card");

      // Credit Card Changes (separate from liabilities)
      const increaseInCreditCards = creditCardAccounts.reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
        );
        // For credit cards, credits represent increases (more debt)
        const credits = accountTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
        return total + credits;
      }, 0);

      const decreaseInCreditCards = creditCardAccounts.reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
        );
        // For credit cards, debits represent decreases (payments/reductions)
        const debits = accountTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
        return total + debits;
      }, 0);

      // Net Credit Card Change: Increase - Decrease (positive means more debt, negative means payments)
      const netCreditCardChange = increaseInCreditCards - decreaseInCreditCards;

      // Increase in Liabilities: total of liabilities credits (excluding credit cards)
      const increaseInLiabilities = liabilityAccounts.reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
        );
        // For liabilities, credits represent increases
        const credits = accountTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
        return total + credits;
      }, 0);

      // Decrease in Liabilities: total of liabilities debits (excluding credit cards)
      const decreaseInLiabilities = liabilityAccounts.reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
        );
        // For liabilities, debits represent decreases
        const debits = accountTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
        return total + debits;
      }, 0);

      // Owner Investment: equity credits (investments into the business)
      const ownerInvestment = equityAccounts.reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
        );
        // For equity, credits represent owner investments
        const credits = accountTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
        return total + credits;
      }, 0);

      // Owner Withdrawal: equity debits (withdrawals from the business)
      const ownerWithdrawal = equityAccounts.reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
        );
        // For equity, debits represent owner withdrawals
        const debits = accountTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
        return total + debits;
      }, 0);

      // Net Financing Change: Credit Card Change + Increase in Liabilities - Decrease in Liabilities + Owner Investment - Owner Withdrawal
      const netFinancingChange =
        netCreditCardChange + increaseInLiabilities - decreaseInLiabilities + ownerInvestment - ownerWithdrawal;

      return {
        increaseInCreditCards,
        decreaseInCreditCards,
        netCreditCardChange,
        increaseInLiabilities,
        decreaseInLiabilities,
        ownerInvestment,
        ownerWithdrawal,
        netFinancingChange,
      };
    },
    [categories, journalEntries]
  );

  // Calculate bank balance for period (defined after other calculation functions)
  const calculateBankBalanceForPeriod = useCallback(
    (periodEnd: string) => {
      // Calculate ending bank balance for a specific period using the cash flow formula
      const periodStartBalance = actualBankAccounts.reduce((total, account) => {
        // Start with the account's starting balance
        const startingBalance = Number(account.starting_balance) || 0;

        // Add all transactions before the start date
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.plaid_account_id && tx.date < startDate
        );
        const transactionTotal = accountTransactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);

        return total + startingBalance + transactionTotal;
      }, 0);

      const operating = calculateOperatingActivitiesForPeriod(startDate, periodEnd);
      const investing = calculateInvestingActivitiesForPeriod(startDate, periodEnd);
      const financing = calculateFinancingActivitiesForPeriod(startDate, periodEnd);

      return periodStartBalance + operating.netIncome + investing.netInvestingChange + financing.netFinancingChange;
    },
    [
      actualBankAccounts,
      journalEntries,
      startDate,
      calculateOperatingActivitiesForPeriod,
      calculateInvestingActivitiesForPeriod,
      calculateFinancingActivitiesForPeriod,
    ]
  );

  // Operating Activities
  const operatingActivities = useMemo(() => {
    const revenueAccounts = getTopLevelAccounts("Revenue");
    const cogsAccounts = getTopLevelAccounts("COGS");
    const expenseAccounts = getTopLevelAccounts("Expense");

    const revenue = revenueAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter((tx) =>
        getAllAccountIds(categories, account).includes(tx.chart_account_id)
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.credit) - Number(tx.debit), 0);
    }, 0);

    const cogs = cogsAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter((tx) =>
        getAllAccountIds(categories, account).includes(tx.chart_account_id)
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);

    const expenses = expenseAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter((tx) =>
        getAllAccountIds(categories, account).includes(tx.chart_account_id)
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);

    const netIncome = revenue - cogs - expenses;

    return {
      revenue,
      cogs,
      expenses,
      netIncome,
    };
  }, [categories, journalEntries, getTopLevelAccounts]);

  // Investing Activities (changes in non-bank assets as per business requirements)
  const investingActivities = useMemo(() => {
    return calculateInvestingActivitiesForPeriod(startDate, endDate);
  }, [startDate, endDate, calculateInvestingActivitiesForPeriod]);

  // Financing Activities (changes in liabilities and equity as per business requirements)
  const financingActivities = useMemo(() => {
    return calculateFinancingActivitiesForPeriod(startDate, endDate);
  }, [startDate, endDate, calculateFinancingActivitiesForPeriod]);

  // Ending Bank Balance: Beginning Bank Balance + Operating Change + Investing Change + Financing Change
  const endingBankBalance = useMemo(() => {
    const operatingChange = operatingActivities.netIncome;
    const investingChange = investingActivities.netInvestingChange;
    const financingChange = financingActivities.netFinancingChange;

    return beginningBankBalance + operatingChange + investingChange + financingChange;
  }, [
    beginningBankBalance,
    operatingActivities.netIncome,
    investingActivities.netInvestingChange,
    financingActivities.netFinancingChange,
  ]);

  // Export hook
  const { exportToXLSX } = useExportCashFlow({
    categories,
    journalEntries,
    actualBankAccounts,
    revenueRows,
    cogsRows,
    expenseRows,
    beginningBankBalance,
    endingBankBalance,
    operatingActivities,
    investingActivities,
    financingActivities,
    currentCompany,
    isMonthlyView,
    isQuarterlyView,
    startDate,
    endDate,
    collapsedAccounts,
    calculateAccountTotal,
    calculateBankBalanceForPeriod,
    calculateOperatingActivitiesForPeriod,
    calculateInvestingActivitiesForPeriod,
    calculateFinancingActivitiesForPeriod,
  });

  // Helper functions (similar to P&L and Balance Sheet)
  const getCategoryName = (tx: Transaction) => {
    return categories.find((a) => a.id === tx.chart_account_id)?.name || "";
  };

  // Calculate total columns for proper column spanning (consistent with P&L and Balance Sheet)
  // Handle transaction click
  const handleTransactionClick = async (transaction: Transaction) => {
    if (transaction.source === "manual") {
      // Open ManualJeModal for manual journal entries
      setEditManualModal({
        isOpen: true,
        referenceNumber: transaction.transaction_id,
        editEntry: {
          date: transaction.date,
          description: transaction.description,
          jeName: "",
          lines: [],
        },
        saving: false,
        error: null,
      });
      
      // Fetch manual journal entry details
      try {
        const { data: manualEntries, error } = await supabase
          .from('manual_journal_entries')
          .select('*')
          .eq('reference_number', transaction.transaction_id)
          .eq('company_id', currentCompany?.id);

        if (error) throw error;

        if (manualEntries && manualEntries.length > 0) {
          // For manual journal entries, each row is a separate line in the journal entry
          // Can be 2 lines (normal) or 3+ lines (split)
          const lines = manualEntries.map((entry: { description: string; chart_account_id: string; payee_id?: string; debit: number; credit: number }, index: number) => ({
            id: (index + 1).toString(),
            description: entry.description,
            categoryId: entry.chart_account_id,
            payeeId: entry.payee_id || "",
            debit: entry.debit.toString(),
            credit: entry.credit.toString(),
          }));

          setEditManualModal(prev => ({
            ...prev,
            editEntry: {
              ...prev.editEntry,
              lines,
            },
          }));
        }
      } catch (error) {
        console.error('Error fetching manual journal entry:', error);
      }
    } else {
      // Open TransactionModal for regular journal entries
      setEditJournalModal({
        isOpen: true,
        isLoading: true,
        saving: false,
        error: null,
        transactionId: transaction.transaction_id,
        isManualEntry: false,
        editEntry: {
          date: transaction.date,
          description: transaction.description,
          lines: [],
        },
      });
      
      // Fetch journal entry details
      try {
        const { data: journalEntries, error } = await supabase
          .from('journal')
          .select('*')
          .eq('transaction_id', transaction.transaction_id)
          .eq('company_id', currentCompany?.id);

        if (error) throw error;

        if (journalEntries && journalEntries.length > 0) {
          // Get the transaction data to find the corresponding account
          const { data: transactionData } = await supabase
            .from('transactions')
            .select('corresponding_category_id, plaid_account_id')
            .eq('id', transaction.transaction_id)
            .single();
          
          // Map all journal entries to lines (TransactionModal will handle filtering)
          const lines = journalEntries.map((entry: { description: string; chart_account_id: string; debit: number; credit: number }, index: number) => ({
            id: (index + 1).toString(),
            description: entry.description,
            categoryId: entry.chart_account_id,
            payeeId: "", // Journal entries don't have payee_id directly
            debit: entry.debit.toString(),
            credit: entry.credit.toString(),
          }));

          setEditJournalModal(prev => ({
            ...prev,
            isLoading: false,
            selectedAccountId: transactionData?.plaid_account_id || null,
            selectedAccountCategoryId: transactionData?.corresponding_category_id || null,
            editEntry: {
              ...prev.editEntry,
              lines,
            },
          }));
        } else {
          setEditJournalModal(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Error fetching journal entry:', error);
        setEditJournalModal(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Failed to load transaction details' 
        }));
      }
    }
  };

  // Modal helper functions
  const updateEditJournalLine = (lineId: string, field: keyof JournalEntryLine, value: string) => {
    setEditJournalModal((prev) => ({
      ...prev,
      editEntry: {
        ...prev.editEntry,
        lines: prev.editEntry.lines.map((line) => (line.id === lineId ? { ...line, [field]: value } : line)),
      },
    }));
  };

  const handleEditAmountChange = (lineId: string, field: "debit" | "credit", value: string) => {
    updateEditJournalLine(lineId, field, value || "0.00");
    // Clear the opposite field when entering an amount
    if (value) {
      const oppositeField = field === "debit" ? "credit" : "debit";
      updateEditJournalLine(lineId, oppositeField, "0.00");
    }
  };

  const addEditLine = () => {
    const newLineId = (editJournalModal.editEntry.lines.length + 1).toString();
    setEditJournalModal((prev) => ({
      ...prev,
      editEntry: {
        ...prev.editEntry,
        lines: [...prev.editEntry.lines, {
          id: newLineId,
          description: "",
          categoryId: "",
          payeeId: "",
          debit: "0.00",
          credit: "0.00",
        }],
      },
    }));
  };

  const removeEditLine = (lineId: string) => {
    setEditJournalModal((prev) => ({
      ...prev,
      editEntry: {
        ...prev.editEntry,
        lines: prev.editEntry.lines.filter((line) => line.id !== lineId),
      },
    }));
  };

  const handleSaveJournalEntry = async () => {
    // Implementation would go here
    console.log("Save journal entry:", editJournalModal.editEntry);
    setEditJournalModal((prev) => ({ ...prev, isOpen: false }));
  };

  const calculateTotals = () => {
    const totalDebits = editJournalModal.editEntry.lines.reduce((sum, line) => {
      const debit = parseFloat(line.debit) || 0;
      return sum + debit;
    }, 0);

    const totalCredits = editJournalModal.editEntry.lines.reduce((sum, line) => {
      const credit = parseFloat(line.credit) || 0;
      return sum + credit;
    }, 0);

    return { totalDebits, totalCredits };
  };

  const handleCreateCategory = async () => {
    if (!newCategoryModal.name.trim() || !currentCompany?.id) return;

    try {
      const newCategory = await addCategory({
        name: newCategoryModal.name.trim(),
        type: newCategoryModal.type,
        parent_id: newCategoryModal.parent_id,
      });

      if (newCategory && newCategoryModal.lineId) {
        // Update the line with the new category
        updateEditJournalLine(newCategoryModal.lineId, "categoryId", newCategory.id);
      }

      setNewCategoryModal({
        isOpen: false,
        name: "",
        type: "Asset",
        parent_id: null,
        lineId: null,
      });
    } catch (error) {
      console.error("Failed to create category:", error);
    }
  };

  const getTotalColumns = (): number => {
    if (isMonthlyView) {
      const monthCount = getMonthsInRange(startDate, endDate).length;
      // Account column + month columns + Total column + (Total percentage if enabled)
      return 1 + monthCount + 1 + 1;
    } else if (isQuarterlyView) {
      const quarterCount = getQuartersInRange(startDate, endDate).length;
      // Account column + quarter columns + Total column + (Total percentage if enabled)
      return 1 + quarterCount + 1 + 1;
    } else {
      // Account column + Total column + (Percentage column if enabled)
      return 2;
    }
  };

  // Helper function to render period cells
  const renderPeriodCells = (
    getValue: (periodStart: string, periodEnd: string) => number,
    baseGetter?: (periodStart: string, periodEnd: string) => number,
    categoryType?: string,
    categoryName?: string
  ) => {
    if (isMonthlyView) {
      const months = getMonthsInRange(startDate, endDate);
      const totalValue = getValue(startDate, endDate);

      return (
        <>
          {months.map((month) => {
            const monthStart = `${month}-01`;
            const lastDay = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).getDate();
            const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
            const value = getValue(monthStart, monthEnd);

            return (
              <React.Fragment key={month}>
                <TableCell
                  className={`${categoryType ? "cursor-pointer hover:bg-slate-100" : ""}`}
                  isValue
                  onClick={
                    categoryType && categoryName ? () => handleCellClick(categoryType, categoryName, month) : undefined
                  }
                >
                  {formatNumber(value)}
                </TableCell>
              </React.Fragment>
            );
          })}
          <TableCell
            isValue
            onClick={() =>
              setViewerModal({
                isOpen: true,
                category: {
                  id: categoryType?.toUpperCase() + "_GROUP",
                  name: categoryName || "",
                  type: categoryType || "",
                },
              })
            }
          >
            {formatNumber(totalValue)}
          </TableCell>
        </>
      );
    } else if (isQuarterlyView) {
      const quarters = getQuartersInRange(startDate, endDate);
      const totalValue = getValue(startDate, endDate);

      return (
        <>
          {quarters.map((quarter) => {
            const [year, q] = quarter.split("-Q");
            const quarterNum = parseInt(q);
            const quarterStart = `${year}-${String((quarterNum - 1) * 3 + 1).padStart(2, "0")}-01`;
            const quarterEndMonth = quarterNum * 3;
            const quarterEnd = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${new Date(
              parseInt(year),
              quarterEndMonth,
              0
            ).getDate()}`;
            const value = getValue(quarterStart, quarterEnd);

            return (
              <React.Fragment key={quarter}>
                <TableCell
                  className={`${categoryType ? "cursor-pointer hover:bg-slate-100" : ""}`}
                  isValue
                  onClick={
                    categoryType && categoryName ? () => handleCellClick(categoryType, categoryName, quarter) : undefined
                  }
                >
                  {formatNumber(value)}
                </TableCell>
              </React.Fragment>
            );
          })}
          <TableCell onClick={() =>
              setViewerModal({
                isOpen: true,
                category: {
                  id: categoryType?.toUpperCase() + "_GROUP",
                  name: categoryName || "",
                  type: categoryType || "",
                },
              })
            } isValue>{formatNumber(totalValue)}</TableCell>
        </>
      );
    } else {
      const value = getValue(startDate, endDate);

      return (
        <>
          <TableCell onClick={() =>
              setViewerModal({
                isOpen: true,
                category: {
                  id: categoryType?.toUpperCase() + "_GROUP",
                  name: categoryName || "",
                  type: categoryType || "",
                },
              })
            } isValue>{formatNumber(value)}</TableCell>
        </>
      );
    }
  };

  // Transaction filtering for viewer (similar to P&L approach)
  const selectedCategoryTransactions = useMemo(() => {
    if (!viewerModal.category) return [];

    const category = viewerModal.category;
    let transactions =
      category.id === "REVENUE_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, revenueRows).includes(tx.chart_account_id))
        : category.id === "COGS_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, cogsRows).includes(tx.chart_account_id))
        : category.id === "EXPENSE_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, expenseRows).includes(tx.chart_account_id))
        : category.id === "NET_INCOME_GROUP" || category.id === "OPERATING_CHANGE_GROUP"
        ? journalEntries.filter((tx) => 
            getAllGroupAccountIds(categories, [...revenueRows, ...cogsRows, ...expenseRows]).includes(tx.chart_account_id)
          )
        : category.id === "INVESTING_CHANGE_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => cat.type === "Asset").some(asset => getAllAccountIds(categories, asset).includes(tx.chart_account_id))
          )
        : category.id === "INCREASE_IN_ASSETS_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => cat.type === "Asset").some(asset => getAllAccountIds(categories, asset).includes(tx.chart_account_id)) &&
            Number(tx.debit) > 0
          )
        : category.id === "DECREASE_IN_ASSETS_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => cat.type === "Asset").some(asset => getAllAccountIds(categories, asset).includes(tx.chart_account_id)) &&
            Number(tx.credit) > 0
          )
        : category.id === "FINANCING_CHANGE_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => ["Liability", "Credit Card", "Equity"].includes(cat.type)).some(account => getAllAccountIds(categories, account).includes(tx.chart_account_id))
          )
        : category.id === "INCREASE_IN_CREDIT_CARDS_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => cat.type === "Credit Card").some(account => getAllAccountIds(categories, account).includes(tx.chart_account_id)) &&
            Number(tx.credit) > 0
          )
        : category.id === "DECREASE_IN_CREDIT_CARDS_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => cat.type === "Credit Card").some(account => getAllAccountIds(categories, account).includes(tx.chart_account_id)) &&
            Number(tx.debit) > 0
          )
        : category.id === "INCREASE_IN_LIABILITIES_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => cat.type === "Liability").some(account => getAllAccountIds(categories, account).includes(tx.chart_account_id)) &&
            Number(tx.credit) > 0
          )
        : category.id === "DECREASE_IN_LIABILITIES_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => cat.type === "Liability").some(account => getAllAccountIds(categories, account).includes(tx.chart_account_id)) &&
            Number(tx.debit) > 0
          )
        : category.id === "OWNER_INVESTMENT_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => cat.type === "Equity").some(account => getAllAccountIds(categories, account).includes(tx.chart_account_id)) &&
            Number(tx.credit) > 0
          )
        : category.id === "OWNER_WITHDRAWAL_GROUP"
        ? journalEntries.filter((tx) => 
            categories.filter(cat => cat.type === "Equity").some(account => getAllAccountIds(categories, account).includes(tx.chart_account_id)) &&
            Number(tx.debit) > 0
          )
        : journalEntries.filter((tx) => getAllAccountIds(categories, category).includes(tx.chart_account_id));

    if (viewerModal.selectedMonth) {
      // Handle both monthly (YYYY-MM) and quarterly (YYYY-QN) filtering
      if (viewerModal.selectedMonth.includes('-Q')) {
        // Quarterly filtering: convert quarter to date range
        const [year, quarter] = viewerModal.selectedMonth.split('-Q');
        const quarterNum = parseInt(quarter);
        const startMonth = (quarterNum - 1) * 3 + 1;
        const endMonth = quarterNum * 3;
        
        transactions = transactions.filter((tx) => {
          const txDate = new Date(tx.date);
          const txYear = txDate.getFullYear();
          const txMonth = txDate.getMonth() + 1; // getMonth() is 0-indexed
          
          return txYear === parseInt(year) && txMonth >= startMonth && txMonth <= endMonth;
        });
      } else {
        // Monthly filtering: filter by YYYY-MM prefix
        transactions = transactions.filter((tx) => tx.date.startsWith(viewerModal.selectedMonth!));
      }
    }

    return transactions;
  }, [viewerModal, journalEntries, categories, revenueRows, cogsRows, expenseRows]);

  // Handle cell click to show transactions for a specific month
  const handleCellClick = (categoryType: string, categoryName: string, month: string) => {
    // Find the specific account if it exists
    let category;

    // Check if this is a specific account name rather than a category type
    const specificAccount = categories.find((a) => a.name === categoryName);

    if (specificAccount) {
      category = {
        id: specificAccount.id,
        name: specificAccount.name,
        type: specificAccount.type,
      };
    } else {
      // For category groups like "Revenue", "COGS", "Expenses", "Net Income", Asset changes
      // Use consistent ID format like in PnL page (REVENUE_GROUP, COGS_GROUP, EXPENSE_GROUP)
      let groupId;
      let categoryTypeForGroup;
      
      if (categoryType === "NET_INCOME") {
        groupId = "NET_INCOME_GROUP";
        categoryTypeForGroup = "Operating";
      } else if (categoryType === "OPERATING_CHANGE") {
        groupId = "OPERATING_CHANGE_GROUP";
        categoryTypeForGroup = "Operating";
      } else if (categoryType === "INCREASE_IN_ASSETS") {
        groupId = "INCREASE_IN_ASSETS_GROUP";
        categoryTypeForGroup = "Asset";
      } else if (categoryType === "DECREASE_IN_ASSETS") {
        groupId = "DECREASE_IN_ASSETS_GROUP";
        categoryTypeForGroup = "Asset";
      } else if (categoryType === "INVESTING_CHANGE") {
        groupId = "INVESTING_CHANGE_GROUP";
        categoryTypeForGroup = "Investing";
      } else if (categoryType === "INCREASE_IN_CREDIT_CARDS") {
        groupId = "INCREASE_IN_CREDIT_CARDS_GROUP";
        categoryTypeForGroup = "Credit Card";
      } else if (categoryType === "DECREASE_IN_CREDIT_CARDS") {
        groupId = "DECREASE_IN_CREDIT_CARDS_GROUP";
        categoryTypeForGroup = "Credit Card";
      } else if (categoryType === "INCREASE_IN_LIABILITIES") {
        groupId = "INCREASE_IN_LIABILITIES_GROUP";
        categoryTypeForGroup = "Liability";
      } else if (categoryType === "DECREASE_IN_LIABILITIES") {
        groupId = "DECREASE_IN_LIABILITIES_GROUP";
        categoryTypeForGroup = "Liability";
      } else if (categoryType === "OWNER_INVESTMENT") {
        groupId = "OWNER_INVESTMENT_GROUP";
        categoryTypeForGroup = "Equity";
      } else if (categoryType === "OWNER_WITHDRAWAL") {
        groupId = "OWNER_WITHDRAWAL_GROUP";
        categoryTypeForGroup = "Equity";
      } else {
        groupId = categoryType.toUpperCase() + "_GROUP";
        categoryTypeForGroup = categoryType;
      }
      
      category = {
        id: groupId,
        name: categoryName,
        type: categoryTypeForGroup,
      };
    }

    setViewerModal({
      isOpen: true,
      category: category,
      selectedMonth: month,
    });
  };

  const saveReport = async (name: string) => {
    if (!name.trim() || !currentCompany?.id) return;

    setSaving(true);
    try {
      const response = await api.post("/api/reports/saved", {
        name: name.trim(),
        type: "cash-flow",
        description: `Cash Flow Statement from ${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`,
        parameters: {
          startDate,
          endDate,
          primaryDisplay: selectedPrimaryDisplay,
          secondaryDisplay: selectedSecondaryDisplay,
          period: selectedPeriod,
        },
      });

      if (response.ok) {
        setShowSaveDialog(false);
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 3000);
      }
    } catch (error) {
      console.error("Failed to save report:", error);
    } finally {
      setSaving(false);
    }
  };

  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-xs font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-xs text-yellow-700">
            Please select a company from the dropdown in the navigation bar to view cash flow reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white min-h-screen">
      <div
        className={`mx-auto ${
          getMonthsInRange(startDate, endDate).length > 6 ? "max-w-full" : "max-w-7xl"
        } animate-in fade-in`}
      >
        <ReportHeader
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
          selectedPrimaryDisplay={selectedPrimaryDisplay}
          onPrimaryDisplayChange={handlePrimaryDisplayChange}
          selectedSecondaryDisplay={selectedSecondaryDisplay}
          onSecondaryDisplayChange={handleSecondaryDisplayChange}
          onCollapseAllCategories={collapseAllParentCategories}
          onExpandAllCategories={expandAllParentCategories}
          collapsedAccounts={collapsedAccounts}
          parentAccounts={getParentAccounts()}
          exportToXLSX={exportToXLSX}
          onSaveReport={() => setShowSaveDialog(true)}
          loading={loading}
          hideSecondaryDisplay={true}
        />

        {showSuccessMessage && (
          <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
            Report saved successfully!
          </div>
        )}

        <Card className="pt-3 pb-0">
          <CardContent className="p-0">
            <h1 className="text-xl font-bold text-slate-800 mb-1 text-center">{currentCompany.name}</h1>
            <p className="text-lg text-slate-700 mb-1 text-center font-medium">Cash Flow Statement</p>
            <p className="text-sm text-slate-600 mb-3 text-center">
              {formatDateForDisplay(startDate)} to {formatDateForDisplay(endDate)}
            </p>

            <div className="overflow-x-auto">
              <Table className="table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Cash Flow Activities</TableHead>
                    {isMonthlyView ? (
                      <>
                        {getMonthsInRange(startDate, endDate).map((month) => (
                          <React.Fragment key={month}>
                            <TableHead className="whitespace-nowrap">{formatMonth(month)}</TableHead>
                          </React.Fragment>
                        ))}
                        <TableHead>Total</TableHead>
                      </>
                    ) : isQuarterlyView ? (
                      <>
                        {getQuartersInRange(startDate, endDate).map((quarter) => (
                          <React.Fragment key={quarter}>
                            <TableHead className="whitespace-nowrap">{formatQuarter(quarter)}</TableHead>
                          </React.Fragment>
                        ))}
                        <TableHead>Total</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>Amount</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading || loadingSavedReport ? (
                    <TableRow>
                      <TableCell colSpan={getTotalColumns()} className="py-8 text-center">
                        <div className="flex flex-col items-center space-y-3">
                          <Loader2 className="h-8 w-8 animate-spin" />
                          <span className="text-xs">Loading financial data...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {/* Beginning Bank Balance */}
                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Beginning Bank Balance</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month, index) => {
                              const monthStart = `${month}-01`;
                              const prevMonthEnd =
                                index === 0
                                  ? new Date(new Date(monthStart).getTime() - 24 * 60 * 60 * 1000)
                                      .toISOString()
                                      .split("T")[0]
                                  : new Date(new Date(monthStart).getTime() - 24 * 60 * 60 * 1000)
                                      .toISOString()
                                      .split("T")[0];
                              const balance =
                                index === 0 ? beginningBankBalance : calculateBankBalanceForPeriod(prevMonthEnd);

                              return (
                                <React.Fragment key={month}>
                                  <TableCell isValue>{formatNumber(balance)}</TableCell>
                                </React.Fragment>
                              );
                            })}
                            <TableCell isValue>{formatNumber(beginningBankBalance)}</TableCell>
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter, index) => {
                              const [year, q] = quarter.split("-Q");
                              const quarterStart = `${year}-${String((parseInt(q) - 1) * 3 + 1).padStart(2, "0")}-01`;
                              const prevQuarterEnd =
                                index === 0
                                  ? new Date(new Date(quarterStart).getTime() - 24 * 60 * 60 * 1000)
                                      .toISOString()
                                      .split("T")[0]
                                  : new Date(new Date(quarterStart).getTime() - 24 * 60 * 60 * 1000)
                                      .toISOString()
                                      .split("T")[0];
                              const balance =
                                index === 0 ? beginningBankBalance : calculateBankBalanceForPeriod(prevQuarterEnd);

                              return (
                                <React.Fragment key={quarter}>
                                  <TableCell isValue>{formatNumber(balance)}</TableCell>
                                </React.Fragment>
                              );
                            })}
                            <TableCell isValue>{formatNumber(beginningBankBalance)}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(beginningBankBalance)}</TableCell>
                          </>
                        )}
                      </TableRow>

                      {/* Operating Activities */}
                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Operating</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell></TableCell>
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell></TableCell>
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell></TableCell>
                          </>
                        )}
                      </TableRow>

                      {/* Revenue */}
                      <TableRow className="cursor-pointer">
                        <TableCell
                          isLineItem
                          onClick={() =>
                            setViewerModal({
                              isOpen: true,
                              category: { id: "REVENUE_GROUP", name: "Revenue", type: "Revenue" },
                            })
                          }
                          style={{ paddingLeft: "28px" }}
                        >
                          Revenue
                        </TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue,
                          undefined,
                          "Revenue",
                          "Revenue"
                        )}
                      </TableRow>

                      {/* COGS */}
                      <TableRow className="cursor-pointer">
                        <TableCell
                          isLineItem
                          onClick={() =>
                            setViewerModal({
                              isOpen: true,
                              category: { id: "COGS_GROUP", name: "Cost of Goods Sold", type: "COGS" },
                            })
                          }
                          style={{ paddingLeft: "28px" }}
                        >
                          Cost of Goods Sold
                        </TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).cogs,
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue,
                          "COGS",
                          "COGS"
                        )}
                      </TableRow>

                      {/* Expenses */}
                      <TableRow className="cursor-pointer">
                        <TableCell
                          isLineItem
                          onClick={() =>
                            setViewerModal({
                              isOpen: true,
                              category: { id: "EXPENSE_GROUP", name: "Expenses", type: "Expense" },
                            })
                          }
                          style={{ paddingLeft: "28px" }}
                        >
                          Expenses
                        </TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).expenses,
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue,
                          "Expense",
                          "Expenses"
                        )}
                      </TableRow>

                      {/* Net Income */}
                      <TableRow className="cursor-pointer">
                        <TableCell 
                          isLineItem 
                          style={{ paddingLeft: "28px" }}
                          onClick={() => setViewerModal({
                            isOpen: true,
                            category: { id: "NET_INCOME_GROUP", name: "Net Income", type: "Operating" }
                          })}
                        >
                          Net Income
                        </TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome,
                          undefined,
                          "NET_INCOME",
                          "Net Income"
                        )}
                      </TableRow>
                      {/* Operating Change - equal to Net Income as per business requirements */}
                      <TableRow isSummaryLineItem className="cursor-pointer">
                        <TableCell 
                          isLineItem
                          onClick={() => setViewerModal({
                            isOpen: true,
                            category: { id: "OPERATING_CHANGE_GROUP", name: "Operating Change", type: "Operating" }
                          })}
                        >
                          Operating Change
                        </TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome,
                          undefined,
                          "OPERATING_CHANGE",
                          "Operating Change"
                        )}
                      </TableRow>

                      {/* Investing Activities */}
                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Investing</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell></TableCell>
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell></TableCell>
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell></TableCell>
                          </>
                        )}
                      </TableRow>

                      {/* Increase in Assets */}
                      <TableRow className="cursor-pointer">
                        <TableCell isLineItem style={{ paddingLeft: "28px" }} onClick={() => setViewerModal({
                          isOpen: true,
                          category: { id: "INCREASE_IN_ASSETS_GROUP", name: "Increase in Assets", type: "Investing" }
                        })}>Increase in Assets</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateInvestingActivitiesForPeriod(periodStart, periodEnd).increaseInAssets,
                          undefined,
                          "INCREASE_IN_ASSETS",
                          "Increase in Assets"
                        )}
                      </TableRow>

                      {/* Decrease in Assets */}
                      <TableRow className="cursor-pointer">
                        <TableCell isLineItem style={{ paddingLeft: "28px" }} onClick={() => setViewerModal({
                          isOpen: true,
                          category: { id: "DECREASE_IN_ASSETS_GROUP", name: "Decrease in Assets", type: "Investing" }
                        })}>Decrease in Assets</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateInvestingActivitiesForPeriod(periodStart, periodEnd).decreaseInAssets,
                          undefined,
                          "DECREASE_IN_ASSETS",
                          "Decrease in Assets"
                        )}
                      </TableRow>

                      <TableRow isSummaryLineItem className="cursor-pointer">
                        <TableCell 
                          isLineItem
                          onClick={() => setViewerModal({
                            isOpen: true,
                            category: { id: "INVESTING_CHANGE_GROUP", name: "Investing Change", type: "Investing" }
                          })}
                        >
                          Investing Change
                        </TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateInvestingActivitiesForPeriod(periodStart, periodEnd).netInvestingChange,
                          undefined,
                          "INVESTING_CHANGE",
                          "Investing Change"
                        )}
                      </TableRow>

                      {/* Financing Activities */}
                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Financing</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell></TableCell>
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell></TableCell>
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell></TableCell>
                          </>
                        )}
                      </TableRow>

                      {/* Increase in Credit Cards */}
                      <TableRow className="cursor-pointer">
                        <TableCell isLineItem style={{ paddingLeft: "28px" }} onClick={() => setViewerModal({
                          isOpen: true,
                          category: { id: "INCREASE_IN_CREDIT_CARDS_GROUP", name: "Increase in Credit Cards", type: "Financing" }
                        })}>Increase in Credit Cards</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).increaseInCreditCards,
                          undefined,
                          "INCREASE_IN_CREDIT_CARDS",
                          "Increase in Credit Cards"
                        )}
                      </TableRow>

                      {/* Decrease in Credit Cards */}
                      <TableRow className="cursor-pointer">
                        <TableCell isLineItem style={{ paddingLeft: "28px" }} onClick={() => setViewerModal({
                          isOpen: true,
                          category: { id: "DECREASE_IN_CREDIT_CARDS_GROUP", name: "Decrease in Credit Cards", type: "Financing" }
                        })}>Decrease in Credit Cards</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateFinancingActivitiesForPeriod(periodStart, periodEnd).decreaseInCreditCards,
                          undefined,
                          "DECREASE_IN_CREDIT_CARDS",
                          "Decrease in Credit Cards"
                        )}
                      </TableRow>

                      {/* Increase in Liabilities */}
                      <TableRow className="cursor-pointer">
                        <TableCell isLineItem style={{ paddingLeft: "28px" }} onClick={() => setViewerModal({
                          isOpen: true,
                          category: { id: "INCREASE_IN_LIABILITIES_GROUP", name: "Increase in Liabilities", type: "Financing" }
                        })}>Increase in Liabilities</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).increaseInLiabilities,
                          undefined,
                          "INCREASE_IN_LIABILITIES",
                          "Increase in Liabilities"
                        )}
                      </TableRow>

                      {/* Decrease in Liabilities */}
                      <TableRow className="cursor-pointer">
                        <TableCell isLineItem style={{ paddingLeft: "28px" }} onClick={() => setViewerModal({
                          isOpen: true,
                          category: { id: "DECREASE_IN_LIABILITIES_GROUP", name: "Decrease in Liabilities", type: "Financing" }
                        })}>Decrease in Liabilities</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateFinancingActivitiesForPeriod(periodStart, periodEnd).decreaseInLiabilities,
                          undefined,
                          "DECREASE_IN_LIABILITIES",
                          "Decrease in Liabilities"
                        )}
                      </TableRow>

                      {/* Owner Investment */}
                      <TableRow className="cursor-pointer">
                        <TableCell isLineItem style={{ paddingLeft: "28px" }} onClick={() => setViewerModal({
                          isOpen: true,
                          category: { id: "OWNER_INVESTMENT_GROUP", name: "Owner Investment", type: "Financing" }
                        })}>Owner Investment</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).ownerInvestment,
                          undefined,
                          "OWNER_INVESTMENT",
                          "Owner Investment"
                        )}
                      </TableRow>

                      {/* Owner Withdrawal */}
                      <TableRow className="cursor-pointer">
                        <TableCell isLineItem style={{ paddingLeft: "28px" }} onClick={() => setViewerModal({
                          isOpen: true,
                          category: { id: "OWNER_WITHDRAWAL_GROUP", name: "Owner Withdrawal", type: "Financing" }
                        })}>Owner Withdrawal</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateFinancingActivitiesForPeriod(periodStart, periodEnd).ownerWithdrawal,
                          undefined,
                          "OWNER_WITHDRAWAL",
                          "Owner Withdrawal"
                        )}
                      </TableRow>
                      {/* Financing Change */}
                      <TableRow isSummaryLineItem className="cursor-pointer">
                        <TableCell 
                          isLineItem
                          onClick={() => setViewerModal({
                            isOpen: true,
                            category: { id: "FINANCING_CHANGE_GROUP", name: "Financing Change", type: "Financing" }
                          })}
                        >
                          Financing Change
                        </TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).netFinancingChange,
                          undefined,
                          "FINANCING_CHANGE",
                          "Financing Change"
                        )}
                      </TableRow>

                      {/* Ending Bank Balance */}
                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Ending Bank Balance</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => {
                              const lastDay = new Date(
                                parseInt(month.split("-")[0]),
                                parseInt(month.split("-")[1]),
                                0
                              ).getDate();
                              const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
                              const balance = calculateBankBalanceForPeriod(monthEnd);

                              return (
                                <React.Fragment key={month}>
                                  <TableCell isValue>{formatNumber(balance)}</TableCell>
                                </React.Fragment>
                              );
                            })}
                            <TableCell isValue>{formatNumber(endingBankBalance)}</TableCell>
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => {
                              const [year, q] = quarter.split("-Q");
                              const quarterNum = parseInt(q);
                              const quarterEndMonth = quarterNum * 3;
                              const quarterEnd = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${new Date(
                                parseInt(year),
                                quarterEndMonth,
                                0
                              ).getDate()}`;
                              const balance = calculateBankBalanceForPeriod(quarterEnd);

                              return (
                                <React.Fragment key={quarter}>
                                  <TableCell isValue>{formatNumber(balance)}</TableCell>
                                </React.Fragment>
                              );
                            })}
                            <TableCell isValue>{formatNumber(endingBankBalance)}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(endingBankBalance)}</TableCell>
                          </>
                        )}
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Save Dialog */}
        <SaveReportModal
          isOpen={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onSave={saveReport}
          reportType="cash-flow"
          isLoading={saving}
        />

        {/* Transaction Viewer Modal */}
        <TransactionViewer
          viewerModal={viewerModal}
          setViewerModal={setViewerModal}
          selectedCategoryTransactions={selectedCategoryTransactions}
          startDate={startDate}
          endDate={endDate}
          companyName={currentCompany.name}
          getCategoryName={getCategoryName}
          onTransactionClick={handleTransactionClick}
        />

        {/* Transaction Modals */}
        {editJournalModal.isOpen && (
          <TransactionModal
            modalState={editJournalModal}
            categories={storeCategories}
            payees={payees}
            accounts={transactionAccounts}
            selectedAccountId={editJournalModal.selectedAccountId || null}
            selectedAccountCategoryId={editJournalModal.selectedAccountCategoryId || null}
            onClose={() => setEditJournalModal((prev) => ({ ...prev, isOpen: false }))}
            onUpdateLine={updateEditJournalLine}
            onAmountChange={handleEditAmountChange}
            onAddLine={addEditLine}
            onRemoveLine={removeEditLine}
            onSave={handleSaveJournalEntry}
            onDateChange={(date) => setEditJournalModal((prev) => ({ ...prev, editEntry: { ...prev.editEntry, date } }))}
            onAccountChange={() => {}}
            onOpenCategoryModal={(lineId) => setNewCategoryModal({ isOpen: true, name: "", type: "Asset", parent_id: null, lineId })}
            calculateTotals={calculateTotals}
          />
        )}

        {editManualModal.isOpen && (
          <ManualJeModal
            showAddModal={false}
            setShowAddModal={() => {}}
            newEntry={{} as NewJournalEntry}
            setNewEntry={() => {}}
            saving={false}
            isBalanced={true}
            totalDebits={0}
            totalCredits={0}
            addJournalLine={() => {}}
            removeJournalLine={() => {}}
            updateJournalLine={() => {}}
            handleAmountChange={() => {}}
            handleAddEntry={async () => {}}
            editModal={editManualModal}
            setEditModal={setEditManualModal}
            updateEditJournalLine={() => {}}
            handleEditAmountChange={() => {}}
            addEditJournalLine={() => {}}
            removeEditJournalLine={() => {}}
            calculateEditTotals={() => ({ totalDebits: 0, totalCredits: 0 })}
            handleSaveEditEntry={async () => {}}
            categoryOptions={storeCategories.map(c => ({ value: c.id, label: c.name }))}
            payees={payees}
            setNewCategoryModal={setNewCategoryModal}
          />
        )}

        {/* New Category Modal */}
        {newCategoryModal.isOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">Create New Category</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category Name</label>
                  <input
                    type="text"
                    value={newCategoryModal.name}
                    onChange={(e) => setNewCategoryModal(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                    placeholder="Enter category name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Type</label>
                  <select
                    value={newCategoryModal.type}
                    onChange={(e) => setNewCategoryModal(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  >
                    <option value="Asset">Asset</option>
                    <option value="Liability">Liability</option>
                    <option value="Equity">Equity</option>
                    <option value="Revenue">Revenue</option>
                    <option value="COGS">COGS</option>
                    <option value="Expense">Expense</option>
                  </select>
                </div>
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => setNewCategoryModal({ isOpen: false, name: "", type: "Asset", parent_id: null, lineId: null })}
                    className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateCategory}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    disabled={!newCategoryModal.name.trim()}
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
