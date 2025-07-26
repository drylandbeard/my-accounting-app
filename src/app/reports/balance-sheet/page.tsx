"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { useTransactionsStore } from "@/zustand/transactionsStore";
import { useCategoriesStore } from "@/zustand/categoriesStore";
import { usePayeesStore } from "@/zustand/payeesStore";
import { supabase } from "@/lib/supabase";
import { ChevronDown, ChevronRight } from "lucide-react";
import Loader from "@/components/ui/loader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TransactionModal, {
  EditJournalModalState as TransactionModalState,
  JournalEntryLine,
} from "@/components/TransactionModal";
import ManualJeModal, {
  EditJournalModalState as ManualJeModalState,
  NewJournalEntry,
} from "@/components/ManualJeModal";

import { useSearchParams } from "next/navigation";

// Shared imports
import { Category, Transaction, ViewerModalState } from "../_types";
import {
  formatDateForDisplay,
  formatNumber,
  formatPercentage,
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
import { useExportBalanceSheet } from "../_hooks/useExportBalanceSheet";
import { useRetainedEarningsData } from "../_hooks/useRetainedEarningsData";
import { ReportHeader } from "../_components/ReportHeader";
import { TransactionViewer } from "../_components/TransactionViewer";
import { AccountRowRenderer } from "../_components/AccountRowRenderer";
import { SaveReportModal } from "../_components/SaveReportModal";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function BalanceSheetPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;

  // Store hooks for modal functionality
  const { accounts: bankAccounts } = useTransactionsStore();
  const { categories: storeCategories, addCategory } = useCategoriesStore();
  const { payees } = usePayeesStore();

  // Modal states
  const [editJournalModal, setEditJournalModal] = useState<
    TransactionModalState & { selectedAccountId?: string; selectedAccountCategoryId?: string }
  >({
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
    showPercentages,
    isMonthlyView,
    isQuarterlyView,
    setStartDate,
    setEndDate,
    handlePeriodChange,
    handlePrimaryDisplayChange,
    handleSecondaryDisplayChange,
  } = usePeriodSelection();

  // For balance sheet, we need all journal entries up to the end date
  const { categories, journalEntries, loading } = useFinancialData({
    companyId: currentCompany?.id || null,
    startDate: startDate,
    endDate: endDate,
    accountTypes: ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"],
  });

  // Fetch retained earnings data (historical transactions before current period)
  const { retainedEarningsEntries, loading: retainedEarningsLoading } = useRetainedEarningsData({
    companyId: currentCompany?.id || null,
    currentPeriodStartDate: startDate,
  });

  const {
    collapsedAccounts,
    toggleCategory,
    getTopLevelAccounts,
    collapseAllParentCategories,
    expandAllParentCategories,
    getParentAccounts,
  } = useAccountOperations({
    categories,
    journalEntries,
  });

  const [viewerModal, setViewerModal] = useState<ViewerModalState>({
    isOpen: false,
    category: null,
  });

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [loadingSavedReport, setLoadingSavedReport] = useState(false);
  const [saving, setSaving] = useState(false);

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
          console.log("savedReport", savedReport);
          if (savedReport.type === "balance-sheet") {
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
  }, [reportId, currentCompany?.id]);

  // Save report function
  const saveReport = async (name: string) => {
    if (!name.trim() || !currentCompany?.id) return;

    setSaving(true);
    try {
      const response = await api.post("/api/reports/saved", {
        name: name.trim(),
        type: "balance-sheet",
        description: `Balance Sheet from ${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`,
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
      }
    } catch (error) {
      console.error("Failed to save report:", error);
    } finally {
      setSaving(false);
    }
  };

  // Balance sheet specific account calculation (override the default P&L calculation)
  const calculateBalanceSheetAccountTotal = (category: Category): number => {
    if (category.type === "Asset" || category.type === "Bank Account") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (category.type === "Liability" || category.type === "Credit Card" || category.type === "Equity") {
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      return totalCredits - totalDebits;
    }
    return 0;
  };

  // Balance sheet calculation for specific month (cumulative up to end of month)
  const calculateBalanceSheetAccountTotalForMonth = (category: Category, month: string): number => {
    const endOfMonth = new Date(month + "-31").toISOString().split("T")[0];
    const monthTransactions = journalEntries.filter(
      (tx) => tx.chart_account_id === category.id && tx.date <= endOfMonth
    );

    if (category.type === "Asset" || category.type === "Bank Account") {
      const totalDebits = monthTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = monthTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (category.type === "Liability" || category.type === "Credit Card" || category.type === "Equity") {
      const totalCredits = monthTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = monthTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      return totalCredits - totalDebits;
    }
    return 0;
  };

  // Balance sheet calculation for specific quarter (cumulative up to end of quarter)
  const calculateBalanceSheetAccountTotalForQuarter = (category: Category, quarter: string): number => {
    const [year, q] = quarter.split("-Q");
    const endMonth = parseInt(q) * 3;
    const endOfQuarter = new Date(parseInt(year), endMonth - 1, 31).toISOString().split("T")[0];
    const quarterTransactions = journalEntries.filter(
      (tx) => tx.chart_account_id === category.id && tx.date <= endOfQuarter
    );

    if (category.type === "Asset" || category.type === "Bank Account") {
      const totalDebits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (category.type === "Liability" || category.type === "Credit Card" || category.type === "Equity") {
      const totalCredits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      return totalCredits - totalDebits;
    }
    return 0;
  };

  // Recursive function to calculate account total including subaccounts for balance sheet
  const calculateBalanceSheetAccountTotalWithSubaccounts = (category: Category): number => {
    let total = calculateBalanceSheetAccountTotal(category);
    const subaccounts = categories.filter((acc) => acc.parent_id === category.id);
    for (const sub of subaccounts) {
      total += calculateBalanceSheetAccountTotalWithSubaccounts(sub);
    }
    return total;
  };

  // Recursive function for month with subaccounts
  const calculateBalanceSheetAccountTotalForMonthWithSubaccounts = (category: Category, month: string): number => {
    let total = calculateBalanceSheetAccountTotalForMonth(category, month);
    const subaccounts = categories.filter((acc) => acc.parent_id === category.id);
    for (const sub of subaccounts) {
      total += calculateBalanceSheetAccountTotalForMonthWithSubaccounts(sub, month);
    }
    return total;
  };

  // Recursive function for quarter with subaccounts
  const calculateBalanceSheetAccountTotalForQuarterWithSubaccounts = (category: Category, quarter: string): number => {
    let total = calculateBalanceSheetAccountTotalForQuarter(category, quarter);
    const subaccounts = categories.filter((acc) => acc.parent_id === category.id);
    for (const sub of subaccounts) {
      total += calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(sub, quarter);
    }
    return total;
  };

  // Account groups for balance sheet
  const regularAssetAccounts = getTopLevelAccounts("Asset");
  const bankAccountAccounts = getTopLevelAccounts("Bank Account");
  const assetAccounts = [...regularAssetAccounts, ...bankAccountAccounts]; // Keep for total calculations
  const regularLiabilityAccounts = getTopLevelAccounts("Liability");
  const creditCardAccounts = getTopLevelAccounts("Credit Card");
  const liabilityAccounts = [...regularLiabilityAccounts, ...creditCardAccounts]; // Keep for total calculations
  const equityAccounts = getTopLevelAccounts("Equity");

  // Create virtual Bank Accounts parent category if there are bank accounts
  const virtualBankAccountsParent: Category | null = bankAccountAccounts.length > 0 ? {
    id: "VIRTUAL_BANK_ACCOUNTS",
    name: "Bank Accounts",
    type: "Asset",
    parent_id: null,
  } : null;

  // Create virtual Credit Cards parent category if there are credit card accounts
  const virtualCreditCardsParent: Category | null = creditCardAccounts.length > 0 ? {
    id: "VIRTUAL_CREDIT_CARDS",
    name: "Credit Cards",
    type: "Liability",
    parent_id: null,
  } : null;

  // Create the asset accounts array with virtual Bank Accounts parent first
  const assetAccountsWithBankGroup = [
    ...(virtualBankAccountsParent ? [virtualBankAccountsParent] : []),
    ...regularAssetAccounts
  ];

  // Create the liability accounts array with virtual Credit Cards parent first
  const liabilityAccountsWithCreditCardGroup = [
    ...(virtualCreditCardsParent ? [virtualCreditCardsParent] : []),
    ...regularLiabilityAccounts
  ];

  // P&L accounts for retained earnings calculation
  const revenueAccounts = getTopLevelAccounts("Revenue");
  const cogsAccounts = getTopLevelAccounts("COGS");
  const expenseAccounts = getTopLevelAccounts("Expense");

  // Calculate P&L totals for retained earnings (filtered by date range)
  const totalRevenue = revenueAccounts.reduce((sum, a) => {
    return (
      sum +
      journalEntries
        .filter((tx) => getAllAccountIds(categories, a).includes(tx.chart_account_id) && tx.date >= startDate && tx.date <= endDate)
        .reduce((txSum, tx) => txSum + Number(tx.credit), 0)
    );
  }, 0);

  const totalCOGS = cogsAccounts.reduce((sum, a) => {
    return (
      sum +
      journalEntries
        .filter((tx) => getAllAccountIds(categories, a).includes(tx.chart_account_id) && tx.date >= startDate && tx.date <= endDate)
        .reduce((txSum, tx) => txSum + Number(tx.debit), 0)
    );
  }, 0);

  const totalExpenses = expenseAccounts.reduce((sum, a) => {
    return (
      sum +
      journalEntries
        .filter((tx) => getAllAccountIds(categories, a).includes(tx.chart_account_id) && tx.date >= startDate && tx.date <= endDate)
        .reduce((txSum, tx) => txSum + Number(tx.debit), 0)
    );
  }, 0);

  const netIncome = totalRevenue - totalCOGS - totalExpenses;

  // Calculate Net Income for specific month (filtered by date range)
  const calculateNetIncomeForMonth = (month: string): number => {
    const monthStart = month + "-01";
    const monthEnd = new Date(month + "-31").toISOString().split("T")[0];
    
    // Filter to only include transactions within both the report date range AND the specific month
    const effectiveStartDate = monthStart >= startDate ? monthStart : startDate;
    const effectiveEndDate = monthEnd <= endDate ? monthEnd : endDate;
    
    // Skip if month is outside the report date range
    if (effectiveStartDate > effectiveEndDate) return 0;
    
    const monthRevenue = revenueAccounts.reduce((sum, a) => {
      return sum + journalEntries
        .filter((tx) => 
          getAllAccountIds(categories, a).includes(tx.chart_account_id) && 
          tx.date >= effectiveStartDate && 
          tx.date <= effectiveEndDate
        )
        .reduce((txSum, tx) => txSum + Number(tx.credit), 0);
    }, 0);

    const monthCOGS = cogsAccounts.reduce((sum, a) => {
      return sum + journalEntries
        .filter((tx) => 
          getAllAccountIds(categories, a).includes(tx.chart_account_id) && 
          tx.date >= effectiveStartDate && 
          tx.date <= effectiveEndDate
        )
        .reduce((txSum, tx) => txSum + Number(tx.debit), 0);
    }, 0);

    const monthExpenses = expenseAccounts.reduce((sum, a) => {
      return sum + journalEntries
        .filter((tx) => 
          getAllAccountIds(categories, a).includes(tx.chart_account_id) && 
          tx.date >= effectiveStartDate && 
          tx.date <= effectiveEndDate
        )
        .reduce((txSum, tx) => txSum + Number(tx.debit), 0);
    }, 0);

    return monthRevenue - monthCOGS - monthExpenses;
  };

  // Calculate Net Income for specific quarter (filtered by date range)
  const calculateNetIncomeForQuarter = (quarter: string): number => {
    const [year, q] = quarter.split("-Q");
    const startMonth = (parseInt(q) - 1) * 3 + 1;
    const endMonth = parseInt(q) * 3;
    const quarterStart = new Date(parseInt(year), startMonth - 1, 1).toISOString().split("T")[0];
    const quarterEnd = new Date(parseInt(year), endMonth - 1, 31).toISOString().split("T")[0];
    
    // Filter to only include transactions within both the report date range AND the specific quarter
    const effectiveStartDate = quarterStart >= startDate ? quarterStart : startDate;
    const effectiveEndDate = quarterEnd <= endDate ? quarterEnd : endDate;
    
    // Skip if quarter is outside the report date range
    if (effectiveStartDate > effectiveEndDate) return 0;
    
    const quarterRevenue = revenueAccounts.reduce((sum, a) => {
      return sum + journalEntries
        .filter((tx) => 
          getAllAccountIds(categories, a).includes(tx.chart_account_id) && 
          tx.date >= effectiveStartDate && 
          tx.date <= effectiveEndDate
        )
        .reduce((txSum, tx) => txSum + Number(tx.credit), 0);
    }, 0);

    const quarterCOGS = cogsAccounts.reduce((sum, a) => {
      return sum + journalEntries
        .filter((tx) => 
          getAllAccountIds(categories, a).includes(tx.chart_account_id) && 
          tx.date >= effectiveStartDate && 
          tx.date <= effectiveEndDate
        )
        .reduce((txSum, tx) => txSum + Number(tx.debit), 0);
    }, 0);

    const quarterExpenses = expenseAccounts.reduce((sum, a) => {
      return sum + journalEntries
        .filter((tx) => 
          getAllAccountIds(categories, a).includes(tx.chart_account_id) && 
          tx.date >= effectiveStartDate && 
          tx.date <= effectiveEndDate
        )
        .reduce((txSum, tx) => txSum + Number(tx.debit), 0);
    }, 0);

    return quarterRevenue - quarterCOGS - quarterExpenses;
  };

  // Calculate Retained Earnings (Net Income from 1/1/2000 to day before current period starts)
  const calculateRetainedEarnings = (): number => {
    // Use the dedicated retained earnings entries instead of filtered current period entries
    const retainedRevenue = revenueAccounts.reduce((sum, a) => {
      return sum + retainedEarningsEntries
        .filter((tx) => getAllAccountIds(categories, a).includes(tx.chart_account_id))
        .reduce((txSum, tx) => txSum + Number(tx.credit), 0);
    }, 0);

    const retainedCOGS = cogsAccounts.reduce((sum, a) => {
      return sum + retainedEarningsEntries
        .filter((tx) => getAllAccountIds(categories, a).includes(tx.chart_account_id))
        .reduce((txSum, tx) => txSum + Number(tx.debit), 0);
    }, 0);

    const retainedExpenses = expenseAccounts.reduce((sum, a) => {
      return sum + retainedEarningsEntries
        .filter((tx) => getAllAccountIds(categories, a).includes(tx.chart_account_id))
        .reduce((txSum, tx) => txSum + Number(tx.debit), 0);
    }, 0);

    return retainedRevenue - retainedCOGS - retainedExpenses;
  };

  const retainedEarnings = calculateRetainedEarnings();

  // Balance sheet totals
  const totalAssets = assetAccounts.reduce((sum, a) => {
    return sum + calculateBalanceSheetAccountTotalWithSubaccounts(a);
  }, 0);

  const totalLiabilities = liabilityAccounts.reduce((sum, a) => {
    return sum + calculateBalanceSheetAccountTotalWithSubaccounts(a);
  }, 0);

  const totalEquity =
    equityAccounts.reduce((sum, a) => {
      return sum + calculateBalanceSheetAccountTotalWithSubaccounts(a);
    }, 0) + retainedEarnings + netIncome;

  // Helper functions
  const getCategoryName = (tx: Transaction) => {
    return categories.find((a) => a.id === tx.chart_account_id)?.name || "";
  };

  // Calculate total columns for proper column spanning
  const getTotalColumns = (): number => {
    if (isMonthlyView) {
      const monthCount = getMonthsInRange(startDate, endDate).length;
      // Account column + month columns + (percentage columns if enabled) + Total column + (Total percentage if enabled)
      return 1 + monthCount + (showPercentages ? monthCount : 0) + 1 + (showPercentages ? 1 : 0);
    } else if (isQuarterlyView) {
      const quarterCount = getQuartersInRange(startDate, endDate).length;
      // Account column + quarter columns + (percentage columns if enabled) + Total column + (Total percentage if enabled)
      return 1 + quarterCount + (showPercentages ? quarterCount : 0) + 1 + (showPercentages ? 1 : 0);
    } else {
      // Account column + Total column + (Percentage column if enabled)
      return showPercentages ? 3 : 2;
    }
  };

  const formatPercentageForAccount = (num: number): string => {
    return formatPercentage(num, Math.abs(totalAssets));
  };

  const calculatePercentageForMonth = (amount: number, month: string): string => {
    const monthAssets = assetAccounts.reduce(
      (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
      0
    );
    return formatPercentage(amount, Math.abs(monthAssets));
  };

  const calculatePercentageForQuarter = (amount: number, quarter: string): string => {
    const quarterAssets = assetAccounts.reduce(
      (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
      0
    );
    return formatPercentage(amount, Math.abs(quarterAssets));
  };

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
          .from("manual_journal_entries")
          .select("*")
          .eq("reference_number", transaction.transaction_id)
          .eq("company_id", currentCompany?.id);

        if (error) throw error;

        if (manualEntries && manualEntries.length > 0) {
          // For manual journal entries, each row is a separate line in the journal entry
          // Can be 2 lines (normal) or 3+ lines (split)
          const lines = manualEntries.map(
            (
              entry: {
                description: string;
                chart_account_id: string;
                payee_id?: string;
                debit: number;
                credit: number;
              },
              index: number
            ) => ({
              id: (index + 1).toString(),
              description: entry.description,
              categoryId: entry.chart_account_id,
              payeeId: entry.payee_id || "",
              debit: entry.debit.toString(),
              credit: entry.credit.toString(),
            })
          );

          setEditManualModal((prev) => ({
            ...prev,
            editEntry: {
              ...prev.editEntry,
              lines,
            },
          }));
        }
      } catch (error) {
        console.error("Error fetching manual journal entry:", error);
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
          .from("journal")
          .select("*")
          .eq("transaction_id", transaction.transaction_id)
          .eq("company_id", currentCompany?.id);

        if (error) throw error;

        if (journalEntries && journalEntries.length > 0) {
          // Get the transaction data to find the corresponding account
          const { data: transactionData } = await supabase
            .from("transactions")
            .select("corresponding_category_id, plaid_account_id")
            .eq("id", transaction.transaction_id)
            .single();

          // Map all journal entries to lines (TransactionModal will handle filtering)
          const lines = journalEntries.map(
            (
              entry: { description: string; chart_account_id: string; debit: number; credit: number },
              index: number
            ) => ({
              id: (index + 1).toString(),
              description: entry.description,
              categoryId: entry.chart_account_id,
              payeeId: "", // Journal entries don't have payee_id directly
              debit: entry.debit.toString(),
              credit: entry.credit.toString(),
            })
          );

          setEditJournalModal((prev) => ({
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
          setEditJournalModal((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error("Error fetching journal entry:", error);
        setEditJournalModal((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to load transaction details",
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
        lines: [
          ...prev.editEntry.lines,
          {
            id: newLineId,
            description: "",
            categoryId: "",
            payeeId: "",
            debit: "0.00",
            credit: "0.00",
          },
        ],
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

  // Transaction filtering for viewer
  const selectedCategoryTransactions = useMemo(() => {
    if (!viewerModal.category) return [];

    const category = viewerModal.category;
    let transactions =
      category.id === "ASSETS_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, assetAccounts).includes(tx.chart_account_id))
        : category.id === "VIRTUAL_BANK_ACCOUNTS"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, bankAccountAccounts).includes(tx.chart_account_id))
        : category.id === "VIRTUAL_CREDIT_CARDS"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, creditCardAccounts).includes(tx.chart_account_id))
        : category.id === "BANK_ACCOUNT_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, bankAccountAccounts).includes(tx.chart_account_id))
        : category.id === "LIABILITIES_GROUP"
        ? journalEntries.filter((tx) =>
            getAllGroupAccountIds(categories, liabilityAccounts).includes(tx.chart_account_id)
          )
        : category.id === "EQUITY_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, equityAccounts).includes(tx.chart_account_id))
        : category.id === "NET_INCOME_GROUP"
        ? journalEntries.filter((tx) =>
            getAllGroupAccountIds(categories, [...revenueAccounts, ...cogsAccounts, ...expenseAccounts]).includes(
              tx.chart_account_id
            )
          )
        : category.id === "RETAINED_EARNINGS"
        ? retainedEarningsEntries.filter((tx) => 
            getAllGroupAccountIds(categories, [...revenueAccounts, ...cogsAccounts, ...expenseAccounts]).includes(
              tx.chart_account_id
            )
          )
        : journalEntries.filter((tx) => getAllAccountIds(categories, category).includes(tx.chart_account_id));

    // Filter by month if selectedMonth is provided
    if (viewerModal.selectedMonth) {
      transactions = transactions.filter((tx) => tx.date.startsWith(viewerModal.selectedMonth!));
    }

    return transactions;
  }, [
    viewerModal,
    journalEntries,
    categories,
    assetAccounts,
    bankAccountAccounts,
    creditCardAccounts,
    liabilityAccounts,
    equityAccounts,
    revenueAccounts,
    cogsAccounts,
    expenseAccounts,
  ]);

  // Export hook
  const { exportToXLSX } = useExportBalanceSheet({
    categories,
    journalEntries,
    assetAccounts,
    regularAssetAccounts,
    bankAccountAccounts,
    liabilityAccounts,
    regularLiabilityAccounts,
    creditCardAccounts,
    equityAccounts,
    currentCompany,
    isMonthlyView,
    isQuarterlyView,
    showPercentages,
    startDate,
    endDate,
    collapsedAccounts,
    calculateBalanceSheetAccountTotal,
    calculateBalanceSheetAccountTotalWithSubaccounts,
    calculateBalanceSheetAccountTotalForMonth,
    calculateBalanceSheetAccountTotalForMonthWithSubaccounts,
    calculateBalanceSheetAccountTotalForQuarter,
    calculateBalanceSheetAccountTotalForQuarterWithSubaccounts,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncome,
    retainedEarnings,
    formatPercentageForAccount,
    calculatePercentageForMonth,
    calculatePercentageForQuarter,
  });

  // Render account row helper for balance sheet
  const renderAccountRow = (category: Category, level = 0): React.ReactElement | null => {
    // Handle virtual Bank Accounts parent
    if (category.id === "VIRTUAL_BANK_ACCOUNTS") {
      const isCollapsed = collapsedAccounts.has(category.id);
      const totalBankAccountValue = bankAccountAccounts.reduce((sum, a) => sum + calculateBalanceSheetAccountTotalWithSubaccounts(a), 0);
      
      return (
        <React.Fragment key={category.id}>
          {/* Bank Accounts Parent Row */}
          <TableRow
            className="cursor-pointer hover:bg-gray-50"
            onClick={(e) => {
              // Check if clicking on the expand/collapse icon area
              const target = e.target as HTMLElement;
              if (target.closest('.expand-icon')) {
                toggleCategory(category.id);
              } else {
                // Open transaction viewer
                setViewerModal({
                  isOpen: true,
                  category: { id: "VIRTUAL_BANK_ACCOUNTS", name: "Bank Accounts", type: "Asset", parent_id: null },
                });
              }
            }}
          >
            <TableCell className="text-left font-medium">
              <div className="flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCategory(category.id);
                  }}
                  className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors expand-icon"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-gray-600" />
                  )}
                </button>
                {category.name}
              </div>
            </TableCell>
            {isMonthlyView ? (
              <>
                {getMonthsInRange(startDate, endDate).map((month) => (
                  <React.Fragment key={month}>
                    <TableCell isValue>
                      {formatNumber(
                        bankAccountAccounts.reduce(
                          (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                          0
                        )
                      )}
                    </TableCell>
                    {showPercentages && (
                      <TableCell isValue>
                        {calculatePercentageForMonth(
                          bankAccountAccounts.reduce(
                            (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                            0
                          ),
                          month
                        )}
                      </TableCell>
                    )}
                  </React.Fragment>
                ))}
                <TableCell isValue>{formatNumber(totalBankAccountValue)}</TableCell>
                {showPercentages && <TableCell isValue>{formatPercentageForAccount(totalBankAccountValue)}</TableCell>}
              </>
            ) : isQuarterlyView ? (
              <>
                {getQuartersInRange(startDate, endDate).map((quarter) => (
                  <React.Fragment key={quarter}>
                    <TableCell isValue>
                      {formatNumber(
                        bankAccountAccounts.reduce(
                          (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                          0
                        )
                      )}
                    </TableCell>
                    {showPercentages && (
                      <TableCell isValue>
                        {calculatePercentageForQuarter(
                          bankAccountAccounts.reduce(
                            (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                            0
                          ),
                          quarter
                        )}
                      </TableCell>
                    )}
                  </React.Fragment>
                ))}
                <TableCell isValue>{formatNumber(totalBankAccountValue)}</TableCell>
                {showPercentages && <TableCell isValue>{formatPercentageForAccount(totalBankAccountValue)}</TableCell>}
              </>
            ) : (
              <>
                <TableCell isValue>{formatNumber(totalBankAccountValue)}</TableCell>
                {showPercentages && <TableCell isValue>{formatPercentageForAccount(totalBankAccountValue)}</TableCell>}
              </>
            )}
          </TableRow>
          
          {/* Bank Account Children */}
          {!isCollapsed && bankAccountAccounts.map((bankAccount) => (
            <AccountRowRenderer
              key={bankAccount.id}
              category={bankAccount}
              level={1}
              categories={categories}
              journalEntries={journalEntries}
              isMonthlyView={isMonthlyView}
              isQuarterlyView={isQuarterlyView}
              showPercentages={showPercentages}
              startDate={startDate}
              endDate={endDate}
              collapsedAccounts={collapsedAccounts}
              toggleCategory={toggleCategory}
              calculateAccountTotal={calculateBalanceSheetAccountTotalWithSubaccounts}
              calculateAccountDirectTotal={calculateBalanceSheetAccountTotal}
              calculateAccountTotalForMonth={calculateBalanceSheetAccountTotalForMonth}
              calculateAccountTotalForMonthWithSubaccounts={calculateBalanceSheetAccountTotalForMonthWithSubaccounts}
              calculateAccountTotalForQuarter={calculateBalanceSheetAccountTotalForQuarter}
              calculateAccountTotalForQuarterWithSubaccounts={calculateBalanceSheetAccountTotalForQuarterWithSubaccounts}
              setViewerModal={setViewerModal}
              formatPercentageForAccount={(num) => formatPercentageForAccount(num)}
            />
          ))}
          
          {/* Total Bank Accounts Row */}
          {!isCollapsed && (
            <TableRow
              className="cursor-pointer hover:bg-blue-50"
              onClick={() => setViewerModal({ isOpen: true, category: { id: "VIRTUAL_BANK_ACCOUNTS", name: "Bank Accounts", type: "Asset", parent_id: null } })}
            >
              <TableCell className="border p-1 text-xs bg-gray-50" style={{ paddingLeft: `${2 * 12 + 8}px` }}>
                <span className="font-semibold">Total Bank Accounts</span>
              </TableCell>
              {isMonthlyView ? (
                <>
                  {getMonthsInRange(startDate, endDate).map((month) => (
                    <React.Fragment key={month}>
                      <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                        {formatNumber(
                          bankAccountAccounts.reduce(
                            (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                            0
                          )
                        )}
                      </TableCell>
                      {showPercentages && (
                        <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                          {calculatePercentageForMonth(
                            bankAccountAccounts.reduce(
                              (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                              0
                            ),
                            month
                          )}
                        </TableCell>
                      )}
                    </React.Fragment>
                  ))}
                  <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                    {formatNumber(totalBankAccountValue)}
                  </TableCell>
                  {showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                      {formatPercentageForAccount(totalBankAccountValue)}
                    </TableCell>
                  )}
                </>
              ) : isQuarterlyView ? (
                <>
                  {getQuartersInRange(startDate, endDate).map((quarter) => (
                    <React.Fragment key={quarter}>
                      <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                        {formatNumber(
                          bankAccountAccounts.reduce(
                            (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                            0
                          )
                        )}
                      </TableCell>
                      {showPercentages && (
                        <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                          {calculatePercentageForQuarter(
                            bankAccountAccounts.reduce(
                              (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                              0
                            ),
                            quarter
                          )}
                        </TableCell>
                      )}
                    </React.Fragment>
                  ))}
                  <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                    {formatNumber(totalBankAccountValue)}
                  </TableCell>
                  {showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                      {formatPercentageForAccount(totalBankAccountValue)}
                    </TableCell>
                  )}
                </>
              ) : (
                <>
                  <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                    {formatNumber(totalBankAccountValue)}
                  </TableCell>
                  {showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                      {formatPercentageForAccount(totalBankAccountValue)}
                    </TableCell>
                  )}
                </>
              )}
            </TableRow>
          )}
        </React.Fragment>
      );
    }

    // Handle virtual Credit Cards parent
    if (category.id === "VIRTUAL_CREDIT_CARDS") {
      const isCollapsed = collapsedAccounts.has(category.id);
      const totalCreditCardValue = creditCardAccounts.reduce((sum, a) => sum + calculateBalanceSheetAccountTotalWithSubaccounts(a), 0);
      
      return (
        <React.Fragment key={category.id}>
          {/* Credit Cards Parent Row */}
          <TableRow
            className="cursor-pointer hover:bg-gray-50"
            onClick={(e) => {
              // Check if clicking on the expand/collapse icon area
              const target = e.target as HTMLElement;
              if (target.closest('.expand-icon')) {
                toggleCategory(category.id);
              } else {
                // Open transaction viewer
                setViewerModal({
                  isOpen: true,
                  category: { id: "VIRTUAL_CREDIT_CARDS", name: "Credit Cards", type: "Liability", parent_id: null },
                });
              }
            }}
          >
            <TableCell className="text-left font-medium">
              <div className="flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCategory(category.id);
                  }}
                  className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors expand-icon"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-gray-600" />
                  )}
                </button>
                {category.name}
              </div>
            </TableCell>
            {isMonthlyView ? (
              <>
                {getMonthsInRange(startDate, endDate).map((month) => (
                  <React.Fragment key={month}>
                    <TableCell isValue>
                      {formatNumber(
                        creditCardAccounts.reduce(
                          (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                          0
                        )
                      )}
                    </TableCell>
                    {showPercentages && (
                      <TableCell isValue>
                        {calculatePercentageForMonth(
                          creditCardAccounts.reduce(
                            (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                            0
                          ),
                          month
                        )}
                      </TableCell>
                    )}
                  </React.Fragment>
                ))}
                <TableCell isValue>{formatNumber(totalCreditCardValue)}</TableCell>
                {showPercentages && <TableCell isValue>{formatPercentageForAccount(totalCreditCardValue)}</TableCell>}
              </>
            ) : isQuarterlyView ? (
              <>
                {getQuartersInRange(startDate, endDate).map((quarter) => (
                  <React.Fragment key={quarter}>
                    <TableCell isValue>
                      {formatNumber(
                        creditCardAccounts.reduce(
                          (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                          0
                        )
                      )}
                    </TableCell>
                    {showPercentages && (
                      <TableCell isValue>
                        {calculatePercentageForQuarter(
                          creditCardAccounts.reduce(
                            (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                            0
                          ),
                          quarter
                        )}
                      </TableCell>
                    )}
                  </React.Fragment>
                ))}
                <TableCell isValue>{formatNumber(totalCreditCardValue)}</TableCell>
                {showPercentages && <TableCell isValue>{formatPercentageForAccount(totalCreditCardValue)}</TableCell>}
              </>
            ) : (
              <>
                <TableCell isValue>{formatNumber(totalCreditCardValue)}</TableCell>
                {showPercentages && <TableCell isValue>{formatPercentageForAccount(totalCreditCardValue)}</TableCell>}
              </>
            )}
          </TableRow>
          
          {/* Credit Card Children */}
          {!isCollapsed && creditCardAccounts.map((creditCard) => (
            <AccountRowRenderer
              key={creditCard.id}
              category={creditCard}
              level={1}
              categories={categories}
              journalEntries={journalEntries}
              isMonthlyView={isMonthlyView}
              isQuarterlyView={isQuarterlyView}
              showPercentages={showPercentages}
              startDate={startDate}
              endDate={endDate}
              collapsedAccounts={collapsedAccounts}
              toggleCategory={toggleCategory}
              calculateAccountTotal={calculateBalanceSheetAccountTotalWithSubaccounts}
              calculateAccountDirectTotal={calculateBalanceSheetAccountTotal}
              calculateAccountTotalForMonth={calculateBalanceSheetAccountTotalForMonth}
              calculateAccountTotalForMonthWithSubaccounts={calculateBalanceSheetAccountTotalForMonthWithSubaccounts}
              calculateAccountTotalForQuarter={calculateBalanceSheetAccountTotalForQuarter}
              calculateAccountTotalForQuarterWithSubaccounts={calculateBalanceSheetAccountTotalForQuarterWithSubaccounts}
              setViewerModal={setViewerModal}
              formatPercentageForAccount={(num) => formatPercentageForAccount(num)}
            />
          ))}
          
          {/* Total Credit Cards Row */}
          {!isCollapsed && (
            <TableRow
              className="cursor-pointer hover:bg-blue-50"
              onClick={() => setViewerModal({ isOpen: true, category: { id: "VIRTUAL_CREDIT_CARDS", name: "Credit Cards", type: "Liability", parent_id: null } })}
            >
              <TableCell className="border p-1 text-xs bg-gray-50" style={{ paddingLeft: `${2 * 12 + 8}px` }}>
                <span className="font-semibold">Total Credit Cards</span>
              </TableCell>
              {isMonthlyView ? (
                <>
                  {getMonthsInRange(startDate, endDate).map((month) => (
                    <React.Fragment key={month}>
                      <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                        {formatNumber(
                          creditCardAccounts.reduce(
                            (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                            0
                          )
                        )}
                      </TableCell>
                      {showPercentages && (
                        <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                          {calculatePercentageForMonth(
                            creditCardAccounts.reduce(
                              (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                              0
                            ),
                            month
                          )}
                        </TableCell>
                      )}
                    </React.Fragment>
                  ))}
                  <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                    {formatNumber(totalCreditCardValue)}
                  </TableCell>
                  {showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                      {formatPercentageForAccount(totalCreditCardValue)}
                    </TableCell>
                  )}
                </>
              ) : isQuarterlyView ? (
                <>
                  {getQuartersInRange(startDate, endDate).map((quarter) => (
                    <React.Fragment key={quarter}>
                      <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                        {formatNumber(
                          creditCardAccounts.reduce(
                            (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                            0
                          )
                        )}
                      </TableCell>
                      {showPercentages && (
                        <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                          {calculatePercentageForQuarter(
                            creditCardAccounts.reduce(
                              (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                              0
                            ),
                            quarter
                          )}
                        </TableCell>
                      )}
                    </React.Fragment>
                  ))}
                  <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                    {formatNumber(totalCreditCardValue)}
                  </TableCell>
                  {showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                      {formatPercentageForAccount(totalCreditCardValue)}
                    </TableCell>
                  )}
                </>
              ) : (
                <>
                  <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                    {formatNumber(totalCreditCardValue)}
                  </TableCell>
                  {showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                      {formatPercentageForAccount(totalCreditCardValue)}
                    </TableCell>
                  )}
                </>
              )}
            </TableRow>
          )}
        </React.Fragment>
      );
    }

    // Regular account rendering
    return (
      <AccountRowRenderer
        key={category.id}
        category={category}
        level={level}
        categories={categories}
        journalEntries={journalEntries}
        isMonthlyView={isMonthlyView}
        isQuarterlyView={isQuarterlyView}
        showPercentages={showPercentages}
        startDate={startDate}
        endDate={endDate}
        collapsedAccounts={collapsedAccounts}
        toggleCategory={toggleCategory}
        calculateAccountTotal={calculateBalanceSheetAccountTotalWithSubaccounts}
        calculateAccountDirectTotal={calculateBalanceSheetAccountTotal}
        calculateAccountTotalForMonth={calculateBalanceSheetAccountTotalForMonth}
        calculateAccountTotalForMonthWithSubaccounts={calculateBalanceSheetAccountTotalForMonthWithSubaccounts}
        calculateAccountTotalForQuarter={calculateBalanceSheetAccountTotalForQuarter}
        calculateAccountTotalForQuarterWithSubaccounts={calculateBalanceSheetAccountTotalForQuarterWithSubaccounts}
        setViewerModal={setViewerModal}
        formatPercentageForAccount={(num) => formatPercentageForAccount(num)}
      />
    );
  };

  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-xs font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-xs text-yellow-700">
            Please select a company from the dropdown in the navigation bar to view balance sheet reports.
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
        />

        <Card className="pt-3 pb-0">
          <CardContent className="p-0">
            <h1 className="text-xl font-bold text-slate-800 mb-1 text-center">{currentCompany.name}</h1>
            <p className="text-lg text-slate-700 mb-1 text-center font-medium">Balance Sheet</p>
            <p className="text-sm text-slate-600 mb-3 text-center">
              {isMonthlyView || isQuarterlyView
                ? `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`
                : `As of ${formatDateForDisplay(endDate)}`}
            </p>

            <div className="overflow-x-auto">
              <Table className="table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="whitespace-nowrap"
                      style={{
                        width:
                          (isMonthlyView || isQuarterlyView) && showPercentages
                            ? "25%"
                            : isMonthlyView || isQuarterlyView
                            ? "30%"
                            : showPercentages
                            ? "50%"
                            : "70%",
                      }}
                    ></TableHead>
                    {isMonthlyView ? (
                      <>
                        {getMonthsInRange(startDate, endDate).map((month) => (
                          <React.Fragment key={month}>
                            <TableHead
                              className="whitespace-nowrap"
                              style={{ width: `${65 / (getMonthsInRange(startDate, endDate).length + 1)}%` }}
                            >
                              {formatMonth(month)}
                            </TableHead>
                            {showPercentages && <TableHead className="whitespace-nowrap">%</TableHead>}
                          </React.Fragment>
                        ))}
                        <TableHead style={{ width: `${65 / (getMonthsInRange(startDate, endDate).length + 1)}%` }}>
                          Total
                        </TableHead>
                        {showPercentages && (
                          <TableHead style={{ width: `${65 / (getMonthsInRange(startDate, endDate).length + 1)}%` }}>
                            %
                          </TableHead>
                        )}
                      </>
                    ) : isQuarterlyView ? (
                      <>
                        {getQuartersInRange(startDate, endDate).map((quarter) => (
                          <React.Fragment key={quarter}>
                            <TableHead className="whitespace-nowrap" style={{ width: showPercentages ? "7%" : "10%" }}>
                              {formatQuarter(quarter)}
                            </TableHead>
                            {showPercentages && <TableHead className="whitespace-nowrap">%</TableHead>}
                          </React.Fragment>
                        ))}
                        <TableHead style={{ width: showPercentages ? "7%" : "10%" }}>Total</TableHead>
                        {showPercentages && <TableHead>%</TableHead>}
                      </>
                    ) : (
                      <>
                        <TableHead>{showPercentages ? "Amount" : "Total"}</TableHead>
                        {showPercentages && <TableHead>%</TableHead>}
                      </>
                    )}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading || retainedEarningsLoading || loadingSavedReport ? (
                    <TableRow>
                      <TableCell colSpan={getTotalColumns()} className="border p-4 text-center">
                        <div className="flex flex-col items-center space-y-3">
                          <Loader size="md" />
                          <span className="text-xs">Loading financial data...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {/* Assets Section */}
                      <TableRow isSummaryLineItem>
                        <TableCell colSpan={getTotalColumns()} isLineItem>
                          Assets
                        </TableCell>
                      </TableRow>
                      {assetAccountsWithBankGroup.map((account) => renderAccountRow(account))}

                      {/* Total Assets */}
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setViewerModal({
                            isOpen: true,
                            category: { id: "ASSETS_GROUP", name: "Total Assets", type: "Asset", parent_id: null },
                          })
                        }
                      >
                        <TableCell isLineItem>Total Assets</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
                                  {formatNumber(
                                    assetAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && <TableCell isValue>{calculatePercentageForMonth(assetAccounts.reduce((sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month), 0), month)}</TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalAssets)}</TableCell>
                            {showPercentages && <TableCell isValue>{formatPercentageForAccount(totalAssets)}</TableCell>}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    assetAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && <TableCell isValue>{calculatePercentageForQuarter(assetAccounts.reduce((sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter), 0), quarter)}</TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalAssets)}</TableCell>
                            {showPercentages && <TableCell isValue>{formatPercentageForAccount(totalAssets)}</TableCell>}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(totalAssets)}</TableCell>
                            {showPercentages && <TableCell isValue>{formatPercentageForAccount(totalAssets)}</TableCell>}
                          </>
                        )}
                      </TableRow>

                      {/* Liabilities Section */}
                      <TableRow isSummaryLineItem>
                        <TableCell colSpan={getTotalColumns()} isLineItem>
                          Liabilities
                        </TableCell>
                      </TableRow>
                      {liabilityAccountsWithCreditCardGroup.map((account) => renderAccountRow(account))}

                      {/* Total Liabilities */}
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setViewerModal({
                            isOpen: true,
                            category: {
                              id: "LIABILITIES_GROUP",
                              name: "Total Liabilities",
                              type: "Liability",
                              parent_id: null,
                            },
                          })
                        }
                      >
                        <TableCell isLineItem>Total Liabilities</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
                                  {formatNumber(
                                    liabilityAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForMonth(
                                      liabilityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      ),
                                      month
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalLiabilities)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentageForAccount(totalLiabilities)}</TableCell>
                            )}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    liabilityAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(
                                      liabilityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ),
                                      quarter
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalLiabilities)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentageForAccount(totalLiabilities)}</TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(totalLiabilities)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentageForAccount(totalLiabilities)}</TableCell>
                            )}
                          </>
                        )}
                      </TableRow>

                      {/* Equity Section */}
                      <TableRow isSummaryLineItem>
                        <TableCell colSpan={getTotalColumns()} isLineItem>
                          Equity
                        </TableCell>
                      </TableRow>
                      {equityAccounts.map((account) => renderAccountRow(account))}

                      {/* Net Income */}
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setViewerModal({
                            isOpen: true,
                            category: {
                              id: "NET_INCOME_GROUP",
                              name: "Net Income",
                              type: "Net Income",
                              parent_id: null,
                            },
                          })
                        }
                      >
                        <TableCell isLineItem>Net Income</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>{formatNumber(calculateNetIncomeForMonth(month))}</TableCell>
                                {showPercentages && (
                                  <TableCell isValue>{calculatePercentageForMonth(calculateNetIncomeForMonth(month), month)}</TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(netIncome)}</TableCell>
                            {showPercentages && <TableCell isValue>{formatPercentageForAccount(netIncome)}</TableCell>}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>{formatNumber(calculateNetIncomeForQuarter(quarter))}</TableCell>
                                {showPercentages && (
                                  <TableCell isValue>{calculatePercentageForQuarter(calculateNetIncomeForQuarter(quarter), quarter)}</TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(netIncome)}</TableCell>
                            {showPercentages && <TableCell isValue>{formatPercentageForAccount(netIncome)}</TableCell>}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(netIncome)}</TableCell>
                            {showPercentages && <TableCell isValue>{formatPercentageForAccount(netIncome)}</TableCell>}
                          </>
                        )}
                      </TableRow>

                      {/* Retained Earnings */}
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setViewerModal({
                            isOpen: true,
                            category: {
                              id: "RETAINED_EARNINGS",
                              name: "Retained Earnings",
                              type: "Equity",
                              parent_id: null,
                            },
                          })
                        }
                      >
                        <TableCell isLineItem>Retained Earnings</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>{formatNumber(retainedEarnings)}</TableCell>
                                {showPercentages && (
                                  <TableCell isValue>{calculatePercentageForMonth(retainedEarnings, month)}</TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(retainedEarnings)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentageForAccount(retainedEarnings)}</TableCell>
                            )}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>{formatNumber(retainedEarnings)}</TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(retainedEarnings, quarter)}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(retainedEarnings)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentageForAccount(retainedEarnings)}</TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(retainedEarnings)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentageForAccount(retainedEarnings)}</TableCell>
                            )}
                          </>
                        )}
                      </TableRow>

                      {/* Total Equity */}
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setViewerModal({
                            isOpen: true,
                            category: { id: "EQUITY_GROUP", name: "Total Equity", type: "Equity", parent_id: null },
                          })
                        }
                      >
                        <TableCell isLineItem>Total Equity</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
                                  {formatNumber(
                                    equityAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) + retainedEarnings + calculateNetIncomeForMonth(month)
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForMonth(
                                      equityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      ) + retainedEarnings + calculateNetIncomeForMonth(month),
                                      month
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalEquity)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentageForAccount(totalEquity)}</TableCell>
                            )}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    equityAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    ) + retainedEarnings + calculateNetIncomeForQuarter(quarter)
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(
                                      equityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ) + retainedEarnings + calculateNetIncomeForQuarter(quarter),
                                      quarter
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalEquity)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentageForAccount(totalEquity)}</TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(totalEquity)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentageForAccount(totalEquity)}</TableCell>
                            )}
                          </>
                        )}
                      </TableRow>

                      {/* Total Liabilities & Equity */}
                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Total Liabilities & Equity</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
                                  {formatNumber(
                                    liabilityAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) +
                                      equityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      ) +
                                      retainedEarnings +
                                      calculateNetIncomeForMonth(month)
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForMonth(
                                      liabilityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      ) +
                                        equityAccounts.reduce(
                                          (sum, a) =>
                                            sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                          0
                                        ) +
                                        retainedEarnings +
                                        calculateNetIncomeForMonth(month),
                                      month
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalLiabilities + totalEquity)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {formatPercentageForAccount(totalLiabilities + totalEquity)}
                              </TableCell>
                            )}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    liabilityAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    ) +
                                      equityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ) +
                                      retainedEarnings +
                                      calculateNetIncomeForQuarter(quarter)
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(
                                      liabilityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ) +
                                        equityAccounts.reduce(
                                          (sum, a) =>
                                            sum +
                                            calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                          0
                                        ) +
                                        retainedEarnings +
                                        calculateNetIncomeForQuarter(quarter),
                                      quarter
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalLiabilities + totalEquity)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {formatPercentageForAccount(totalLiabilities + totalEquity)}
                              </TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(totalLiabilities + totalEquity)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {formatPercentageForAccount(totalLiabilities + totalEquity)}
                              </TableCell>
                            )}
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
      </div>

      {/* Save Dialog */}
      <SaveReportModal
        isOpen={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={saveReport}
        reportType="balance-sheet"
        isLoading={saving}
      />

      {/* Transaction Viewer Modal */}
      {viewerModal.isOpen && viewerModal.category && (
        <TransactionViewer
          viewerModal={viewerModal}
          setViewerModal={setViewerModal}
          selectedCategoryTransactions={selectedCategoryTransactions}
          startDate={startDate}
          endDate={endDate}
          companyName={currentCompany.name}
          getCategoryName={getCategoryName}
          onTransactionClick={handleTransactionClick}
          payees={payees}
          accounts={bankAccounts}
        />
      )}

      {/* Transaction Modals */}
      {editJournalModal.isOpen && (
        <TransactionModal
          modalState={editJournalModal}
          categories={storeCategories}
          payees={payees}
          accounts={bankAccounts}
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
          onOpenCategoryModal={(lineId) =>
            setNewCategoryModal({ isOpen: true, name: "", type: "Asset", parent_id: null, lineId })
          }
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
          categoryOptions={storeCategories.map((c) => ({ value: c.id, label: c.name }))}
          payees={payees}
          setNewCategoryModal={setNewCategoryModal}
        />
      )}

      {/* New Category Modal */}
      <Dialog
        open={newCategoryModal.isOpen}
        onOpenChange={() => setNewCategoryModal({ ...newCategoryModal, isOpen: false })}
      >
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold mb-4">Create New Category</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category Name</label>
              <input
                type="text"
                value={newCategoryModal.name}
                onChange={(e) => setNewCategoryModal((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="Enter category name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select
                value={newCategoryModal.type}
                onChange={(e) => setNewCategoryModal((prev) => ({ ...prev, type: e.target.value }))}
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
                onClick={() =>
                  setNewCategoryModal({ isOpen: false, name: "", type: "Asset", parent_id: null, lineId: null })
                }
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
