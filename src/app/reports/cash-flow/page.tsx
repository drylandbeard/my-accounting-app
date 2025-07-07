"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSearchParams } from "next/navigation";

// Shared imports
import { Account, Transaction, ViewerModalState } from "../_types";
import {
  formatDateForDisplay,
  formatNumber,
  formatPercentage,
  getMonthsInRange,
  getQuartersInRange,
  formatMonth,
  formatQuarter,
  getAllAccountIds,
} from "../_utils";
import { useFinancialData } from "../_hooks/useFinancialData";
import { usePeriodSelection } from "../_hooks/usePeriodSelection";
import { useAccountOperations } from "../_hooks/useAccountOperations";
import { ReportHeader } from "../_components/ReportHeader";
import { TransactionViewer } from "../_components/TransactionViewer";
import { SaveReportModal } from "../_components/SaveReportModal";
import { useExportCashFlow } from "../_hooks/useExportCashFlow";
import { AccountRowRenderer } from "../_components/AccountRowRenderer";
import { api } from "@/lib/api";

export default function CashFlowPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;

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

  // Get all account types needed for cash flow
  const { accounts, journalEntries, loading } = useFinancialData({
    companyId: currentCompany?.id || null,
    startDate: startDate,
    endDate: endDate,
    accountTypes: ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"],
  });

  const {
    collapsedAccounts,
    toggleAccount,
    getTopLevelAccounts,
    calculateAccountTotalForMonthWithSubaccounts: getAccountTotalForMonthWithSubaccounts,
    calculateAccountTotalForQuarterWithSubaccounts: getAccountTotalForQuarterWithSubaccounts,
    collapseAllParentCategories,
    expandAllParentCategories,
    getParentAccounts,
  } = useAccountOperations({ accounts, journalEntries });

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
  }, [
    reportId,
    currentCompany?.id,
    setStartDate,
    setEndDate,
    handlePrimaryDisplayChange,
    handleSecondaryDisplayChange,
    handlePeriodChange,
  ]);

  // Add account calculation functions for cash flow
  const calculateAccountTotal = (account: Account): number => {
    const transactions = journalEntries.filter((tx) =>
      getAllAccountIds(accounts, account).includes(tx.chart_account_id)
    );

    if (account.type === "Revenue") {
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "COGS" || account.type === "Expense") {
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    } else if (account.type === "Asset") {
      // For non-bank assets in investing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    } else if (account.type === "Liability" || account.type === "Credit Card") {
      // For liabilities in financing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "Equity") {
      // For equity in financing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "Bank Account") {
      // For bank accounts
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }
    return 0;
  };

  const calculateAccountDirectTotal = (account: Account): number => {
    const transactions = journalEntries.filter((tx) => tx.chart_account_id === account.id);

    if (account.type === "Revenue") {
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "COGS" || account.type === "Expense") {
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    } else if (account.type === "Asset") {
      // For non-bank assets in investing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    } else if (account.type === "Liability" || account.type === "Credit Card") {
      // For liabilities in financing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "Equity") {
      // For equity in financing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "Bank Account") {
      // For bank accounts
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }
    return 0;
  };

  const calculateAccountTotalForMonth = (account: Account, month: string): number => {
    const monthStart = `${month}-01`;
    const lastDay = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).getDate();
    const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

    const transactions = journalEntries.filter(
      (tx) => tx.chart_account_id === account.id && tx.date >= monthStart && tx.date <= monthEnd
    );

    if (account.type === "Revenue") {
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "COGS" || account.type === "Expense") {
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    } else if (account.type === "Asset") {
      // For non-bank assets in investing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    } else if (account.type === "Liability" || account.type === "Credit Card") {
      // For liabilities in financing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "Equity") {
      // For equity in financing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "Bank Account") {
      // For bank accounts
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }
    return 0;
  };

  const calculateAccountTotalForQuarter = (account: Account, quarter: string): number => {
    const [year, q] = quarter.split("-Q");
    const quarterNum = parseInt(q);
    const quarterStart = `${year}-${String((quarterNum - 1) * 3 + 1).padStart(2, "0")}-01`;
    const quarterEndMonth = quarterNum * 3;
    const quarterEnd = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${new Date(
      parseInt(year),
      quarterEndMonth,
      0
    ).getDate()}`;

    const transactions = journalEntries.filter(
      (tx) => tx.chart_account_id === account.id && tx.date >= quarterStart && tx.date <= quarterEnd
    );

    if (account.type === "Revenue") {
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "COGS" || account.type === "Expense") {
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    } else if (account.type === "Asset") {
      // For non-bank assets in investing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    } else if (account.type === "Liability" || account.type === "Credit Card") {
      // For liabilities in financing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "Equity") {
      // For equity in financing activities
      return transactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    } else if (account.type === "Bank Account") {
      // For bank accounts
      return transactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }
    return 0;
  };

  // Add these functions to support the AccountRowRenderer
  const calculateAccountTotalForMonthWithSubaccounts = (account: Account, month: string): number => {
    let total = calculateAccountTotalForMonth(account, month);
    const subaccounts = accounts.filter((acc) => acc.parent_id === account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotalForMonthWithSubaccounts(sub, month);
    }
    return total;
  };

  const calculateAccountTotalForQuarterWithSubaccounts = (account: Account, quarter: string): number => {
    let total = calculateAccountTotalForQuarter(account, quarter);
    const subaccounts = accounts.filter((acc) => acc.parent_id === account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotalForQuarterWithSubaccounts(sub, quarter);
    }
    return total;
  };

  // Create a wrapper function to adapt formatPercentageForCashFlow to match the expected signature
  const formatPercentageForAccountAdapter = (num: number, account?: Account): string => {
    if (!account) return formatPercentageForCashFlow(num);

    // Determine appropriate base value based on account type
    let baseValue: number;

    if (account.type === "Revenue" || account.type === "COGS" || account.type === "Expense") {
      // For operating activities, use revenue as base
      baseValue = Math.abs(operatingActivities.revenue) > 0 ? Math.abs(operatingActivities.revenue) : 1;
    } else if (account.type === "Asset") {
      // For investing activities, use total assets as base
      baseValue =
        Math.abs(investingActivities.increaseInAssets) > 0 ? Math.abs(investingActivities.increaseInAssets) : 1;
    } else if (account.type === "Liability" || account.type === "Credit Card" || account.type === "Equity") {
      // For financing activities, use total financing as base
      baseValue =
        Math.abs(financingActivities.netFinancingChange) > 0 ? Math.abs(financingActivities.netFinancingChange) : 1;
    } else {
      // Default case
      baseValue = 1;
    }

    return formatPercentageForCashFlow(num, baseValue);
  };

  // Render account row using the reusable component
  const renderAccountRow = (account: Account, level = 0): React.ReactElement | null => {
    return (
      <AccountRowRenderer
        key={account.id}
        account={account}
        level={level}
        accounts={accounts}
        journalEntries={journalEntries}
        isMonthlyView={isMonthlyView}
        isQuarterlyView={isQuarterlyView}
        showPercentages={showPercentages}
        startDate={startDate}
        endDate={endDate}
        collapsedAccounts={collapsedAccounts}
        toggleAccount={toggleAccount}
        calculateAccountTotal={calculateAccountTotal}
        calculateAccountDirectTotal={calculateAccountDirectTotal}
        calculateAccountTotalForMonth={calculateAccountTotalForMonth}
        calculateAccountTotalForMonthWithSubaccounts={calculateAccountTotalForMonthWithSubaccounts}
        calculateAccountTotalForQuarter={calculateAccountTotalForQuarter}
        calculateAccountTotalForQuarterWithSubaccounts={calculateAccountTotalForQuarterWithSubaccounts}
        setViewerModal={setViewerModal}
        formatPercentageForAccount={formatPercentageForAccountAdapter}
      />
    );
  };

  // Get bank accounts for beginning and ending balance
  const bankAccounts = useMemo(() => {
    return accounts.filter(
      (acc) =>
        acc.type === "Bank Account" ||
        acc.name.toLowerCase().includes("cash") ||
        acc.name.toLowerCase().includes("bank") ||
        acc.name.toLowerCase().includes("checking") ||
        acc.name.toLowerCase().includes("savings")
    );
  }, [accounts]);

  // Calculate beginning bank balance (balance before start date)
  const beginningBankBalance = useMemo(() => {
    return bankAccounts.reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date < startDate
      );
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);
  }, [bankAccounts, journalEntries, startDate]);

  // Calculate ending bank balance (balance up to end date)
  const endingBankBalance = useMemo(() => {
    return bankAccounts.reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date <= endDate
      );
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);
  }, [bankAccounts, journalEntries, endDate]);

  // Period-specific calculation functions
  const calculateBankBalanceForPeriod = (periodEnd: string) => {
    return bankAccounts.reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date <= periodEnd
      );
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);
  };

  const calculateOperatingActivitiesForPeriod = (periodStart: string, periodEnd: string) => {
    const revenueAccounts = getTopLevelAccounts("Revenue");
    const cogsAccounts = getTopLevelAccounts("COGS");
    const expenseAccounts = getTopLevelAccounts("Expense");

    const revenue = revenueAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter(
        (tx) =>
          getAllAccountIds(accounts, account).includes(tx.chart_account_id) &&
          tx.date >= periodStart &&
          tx.date <= periodEnd
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.credit) - Number(tx.debit), 0);
    }, 0);

    const cogs = cogsAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter(
        (tx) =>
          getAllAccountIds(accounts, account).includes(tx.chart_account_id) &&
          tx.date >= periodStart &&
          tx.date <= periodEnd
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);

    const expenses = expenseAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter(
        (tx) =>
          getAllAccountIds(accounts, account).includes(tx.chart_account_id) &&
          tx.date >= periodStart &&
          tx.date <= periodEnd
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);

    return { revenue, cogs, expenses, netIncome: revenue - cogs - expenses };
  };

  const calculateInvestingActivitiesForPeriod = (periodStart: string, periodEnd: string) => {
    const assetAccounts = accounts.filter(
      (acc) =>
        acc.type === "Asset" &&
        !acc.name.toLowerCase().includes("cash") &&
        !acc.name.toLowerCase().includes("bank") &&
        !acc.name.toLowerCase().includes("checking") &&
        !acc.name.toLowerCase().includes("savings")
    );

    const increaseInAssets = assetAccounts.reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
      );
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);

    return { increaseInAssets, decreaseInAssets: -increaseInAssets, netInvestingChange: -increaseInAssets };
  };

  const calculateFinancingActivitiesForPeriod = (periodStart: string, periodEnd: string) => {
    const liabilityAccounts = accounts.filter((acc) => acc.type === "Liability");
    const equityAccounts = accounts.filter((acc) => acc.type === "Equity");
    const creditCardAccounts = accounts.filter((acc) => acc.type === "Credit Card");

    const increaseInLiabilities = [...liabilityAccounts, ...creditCardAccounts].reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
      );
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    }, 0);

    const ownerContributions = equityAccounts.reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
      );
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    }, 0);

    return {
      increaseInLiabilities,
      ownerContributions,
      ownerDistributions: -ownerContributions,
      netFinancingChange: increaseInLiabilities + ownerContributions,
    };
  };

  // Operating Activities
  const operatingActivities = useMemo(() => {
    const revenueAccounts = getTopLevelAccounts("Revenue");
    const cogsAccounts = getTopLevelAccounts("COGS");
    const expenseAccounts = getTopLevelAccounts("Expense");

    const revenue = revenueAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter((tx) =>
        getAllAccountIds(accounts, account).includes(tx.chart_account_id)
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.credit) - Number(tx.debit), 0);
    }, 0);

    const cogs = cogsAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter((tx) =>
        getAllAccountIds(accounts, account).includes(tx.chart_account_id)
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);

    const expenses = expenseAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter((tx) =>
        getAllAccountIds(accounts, account).includes(tx.chart_account_id)
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
  }, [accounts, journalEntries, getTopLevelAccounts]);

  // Investing Activities (changes in non-bank assets)
  const investingActivities = useMemo(() => {
    const assetAccounts = accounts.filter(
      (acc) =>
        acc.type === "Asset" &&
        !acc.name.toLowerCase().includes("cash") &&
        !acc.name.toLowerCase().includes("bank") &&
        !acc.name.toLowerCase().includes("checking") &&
        !acc.name.toLowerCase().includes("savings")
    );

    const increaseInAssets = assetAccounts.reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date >= startDate && tx.date <= endDate
      );
      // For assets, debits increase, credits decrease
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);

    const decreaseInAssets = -increaseInAssets; // Opposite for cash flow purposes

    return {
      increaseInAssets,
      decreaseInAssets,
      netInvestingChange: decreaseInAssets, // Decrease in assets = positive cash flow
    };
  }, [accounts, journalEntries, startDate, endDate]);

  // Financing Activities (changes in liabilities and equity)
  const financingActivities = useMemo(() => {
    const liabilityAccounts = accounts.filter((acc) => acc.type === "Liability");
    const equityAccounts = accounts.filter((acc) => acc.type === "Equity");
    const creditCardAccounts = accounts.filter((acc) => acc.type === "Credit Card");

    const increaseInLiabilities = [...liabilityAccounts, ...creditCardAccounts].reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date >= startDate && tx.date <= endDate
      );
      // For liabilities, credits increase, debits decrease
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    }, 0);

    const ownerContributions = equityAccounts.reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date >= startDate && tx.date <= endDate
      );
      // For equity, credits increase, debits decrease
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
    }, 0);

    const ownerDistributions = -ownerContributions; // Opposite for distributions

    return {
      increaseInLiabilities,
      ownerContributions,
      ownerDistributions,
      netFinancingChange: increaseInLiabilities + ownerContributions,
    };
  }, [accounts, journalEntries, startDate, endDate]);

  // Export functionality
  const { exportToXLSX } = useExportCashFlow({
    accounts,
    journalEntries,
    bankAccounts,
    currentCompany,
    startDate,
    endDate,
    beginningBankBalance,
    endingBankBalance,
    operatingActivities,
    investingActivities,
    financingActivities,
    isMonthlyView,
    isQuarterlyView,
    calculateBankBalanceForPeriod,
    calculateOperatingActivitiesForPeriod,
    calculateInvestingActivitiesForPeriod,
    calculateFinancingActivitiesForPeriod,
  });

  // Helper functions (similar to P&L and Balance Sheet)
  const getCategoryName = (tx: Transaction) => {
    return accounts.find((a) => a.id === tx.chart_account_id)?.name || "";
  };

  const formatPercentageForCashFlow = (num: number, baseAmount?: number): string => {
    // If baseAmount is provided, use it; otherwise use appropriate defaults
    let base = baseAmount !== undefined ? Math.abs(baseAmount) : 1;

    // Ensure we don't divide by zero
    if (base === 0) base = 1;

    // Calculate percentage
    const percentage = (num / base) * 100;

    // Format with 1 decimal place and add % symbol
    return percentage === 0 ? "—" : `${percentage.toFixed(1)}%`;
  };

  const calculatePercentageForMonth = (amount: number, month: string): string => {
    // For monthly view, calculate percentages based on monthly totals
    const monthStart = `${month}-01`;
    const lastDay = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).getDate();
    const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

    // Get the appropriate base for the month
    const monthlyOperating = calculateOperatingActivitiesForPeriod(monthStart, monthEnd);
    const monthlyRevenue = Math.abs(monthlyOperating.revenue) || 1;

    return formatPercentage(amount, monthlyRevenue);
  };

  const calculatePercentageForQuarter = (amount: number, quarter: string): string => {
    // For quarterly view, calculate percentages based on quarterly totals
    const [year, q] = quarter.split("-Q");
    const quarterNum = parseInt(q);
    const quarterStart = `${year}-${String((quarterNum - 1) * 3 + 1).padStart(2, "0")}-01`;
    const quarterEndMonth = quarterNum * 3;
    const quarterEnd = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${new Date(
      parseInt(year),
      quarterEndMonth,
      0
    ).getDate()}`;

    // Get the appropriate base for the quarter
    const quarterlyOperating = calculateOperatingActivitiesForPeriod(quarterStart, quarterEnd);
    const quarterlyRevenue = Math.abs(quarterlyOperating.revenue) || 1;

    return formatPercentage(amount, quarterlyRevenue);
  };

  // Calculate total columns for proper column spanning (consistent with P&L and Balance Sheet)
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

      // Calculate total base value for percentages
      const totalBaseValue = baseGetter ? Math.abs(baseGetter(startDate, endDate)) : Math.abs(totalValue);

      // For financing activities, use total financing as base
      const totalFinancing = Math.abs(financingActivities.netFinancingChange);

      // For operating activities, use revenue or expenses as base
      const totalRevenue = Math.abs(operatingActivities.revenue);
      const totalExpenses = Math.abs(operatingActivities.expenses);

      // Determine which base to use for percentages
      const getBaseValue = (value: number) => {
        // For different sections, use different base values
        if (categoryType === "revenue" || categoryType === "cogs" || categoryType === "expenses") {
          // For operating activities, use revenue as base
          return totalRevenue > 0 ? totalRevenue : 1;
        } else if (categoryType === "assets") {
          // For investing activities, use total assets as base
          const totalAssets = Math.abs(investingActivities.increaseInAssets);
          return totalAssets > 0 ? totalAssets : 1;
        } else if (categoryType === "liabilities" || categoryType === "equity") {
          // For financing activities, use total financing as base
          return totalFinancing > 0 ? totalFinancing : 1;
        } else if (baseGetter) {
          // If a specific base getter is provided, use that
          return totalBaseValue > 0 ? totalBaseValue : 1;
        } else {
          // Default case - use the absolute value of the total
          return Math.abs(totalValue) > 0 ? Math.abs(totalValue) : 1;
        }
      };

      return (
        <>
          {months.map((month) => {
            const monthStart = `${month}-01`;
            const lastDay = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).getDate();
            const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
            const value = getValue(monthStart, monthEnd);

            // Calculate base value for this month
            let monthBaseValue;
            if (baseGetter) {
              const monthBase = Math.abs(baseGetter(monthStart, monthEnd));
              monthBaseValue = monthBase > 0 ? monthBase : getBaseValue(value);
            } else {
              monthBaseValue = Math.abs(value) > 0 ? Math.abs(value) : getBaseValue(value);
            }

            return (
              <React.Fragment key={month}>
                <TableCell
                  className={`text-right p-1 py-2 ${categoryType ? "cursor-pointer hover:bg-slate-100" : ""}`}
                  onClick={
                    categoryType && categoryName ? () => handleCellClick(categoryType, categoryName, month) : undefined
                  }
                >
                  {formatNumber(value)}
                </TableCell>
                {showPercentages && (
                  <TableCell
                    className={`text-right p-1 py-2 text-xs ${categoryType ? "cursor-pointer hover:bg-slate-100" : ""}`}
                    onClick={
                      categoryType && categoryName
                        ? () => handleCellClick(categoryType, categoryName, month)
                        : undefined
                    }
                  >
                    {value !== 0 ? formatPercentage(value, monthBaseValue) : "—"}
                  </TableCell>
                )}
              </React.Fragment>
            );
          })}
          <TableCell className="text-right p-1 py-2">{formatNumber(totalValue)}</TableCell>
          {showPercentages && (
            <TableCell className="text-right p-1 py-2 text-xs">
              {totalValue !== 0 ? formatPercentage(totalValue, getBaseValue(totalValue)) : "—"}
            </TableCell>
          )}
        </>
      );
    } else if (isQuarterlyView) {
      const quarters = getQuartersInRange(startDate, endDate);
      const totalValue = getValue(startDate, endDate);

      // Calculate total base value for percentages
      const totalBaseValue = baseGetter ? Math.abs(baseGetter(startDate, endDate)) : Math.abs(totalValue);

      // For financing activities, use total financing as base
      const totalFinancing = Math.abs(financingActivities.netFinancingChange);

      // For operating activities, use revenue or expenses as base
      const totalRevenue = Math.abs(operatingActivities.revenue);
      const totalExpenses = Math.abs(operatingActivities.expenses);

      // Determine which base to use for percentages
      const getBaseValue = (value: number) => {
        // For different sections, use different base values
        if (categoryType === "revenue" || categoryType === "cogs" || categoryType === "expenses") {
          // For operating activities, use revenue as base
          return totalRevenue > 0 ? totalRevenue : 1;
        } else if (categoryType === "assets") {
          // For investing activities, use total assets as base
          const totalAssets = Math.abs(investingActivities.increaseInAssets);
          return totalAssets > 0 ? totalAssets : 1;
        } else if (categoryType === "liabilities" || categoryType === "equity") {
          // For financing activities, use total financing as base
          return totalFinancing > 0 ? totalFinancing : 1;
        } else if (baseGetter) {
          // If a specific base getter is provided, use that
          return totalBaseValue > 0 ? totalBaseValue : 1;
        } else {
          // Default case - use the absolute value of the total
          return Math.abs(totalValue) > 0 ? Math.abs(totalValue) : 1;
        }
      };

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

            // Calculate base value for this quarter
            let quarterBaseValue;
            if (baseGetter) {
              const quarterBase = Math.abs(baseGetter(quarterStart, quarterEnd));
              quarterBaseValue = quarterBase > 0 ? quarterBase : getBaseValue(value);
            } else {
              quarterBaseValue = Math.abs(value) > 0 ? Math.abs(value) : getBaseValue(value);
            }

            return (
              <React.Fragment key={quarter}>
                <TableCell className="text-right p-1 py-2">{formatNumber(value)}</TableCell>
                {showPercentages && (
                  <TableCell className="text-right p-1 py-2 text-xs">
                    {value !== 0 ? formatPercentage(value, quarterBaseValue) : "—"}
                  </TableCell>
                )}
              </React.Fragment>
            );
          })}
          <TableCell className="text-right p-1 py-2">{formatNumber(totalValue)}</TableCell>
          {showPercentages && (
            <TableCell className="text-right p-1 py-2 text-xs">
              {totalValue !== 0 ? formatPercentage(totalValue, getBaseValue(totalValue)) : "—"}
            </TableCell>
          )}
        </>
      );
    } else {
      const value = getValue(startDate, endDate);

      // Calculate base value for percentages based on category type
      let baseValue;

      if (categoryType === "revenue" || categoryType === "cogs" || categoryType === "expenses") {
        // For operating activities, use revenue as base
        baseValue = Math.abs(operatingActivities.revenue) > 0 ? Math.abs(operatingActivities.revenue) : 1;
      } else if (categoryType === "assets") {
        // For investing activities, use total assets as base
        baseValue =
          Math.abs(investingActivities.increaseInAssets) > 0 ? Math.abs(investingActivities.increaseInAssets) : 1;
      } else if (categoryType === "liabilities" || categoryType === "equity") {
        // For financing activities, use total financing as base
        baseValue =
          Math.abs(financingActivities.netFinancingChange) > 0 ? Math.abs(financingActivities.netFinancingChange) : 1;
      } else if (baseGetter) {
        // If a specific base getter is provided, use that
        const originalBase = Math.abs(baseGetter(startDate, endDate));
        baseValue = originalBase > 0 ? originalBase : 1;
      } else {
        // Default case - use the absolute value of the value itself
        baseValue = Math.abs(value) > 0 ? Math.abs(value) : 1;
      }

      return (
        <>
          <TableCell className="text-right py-2">{formatNumber(value)}</TableCell>
          {showPercentages && (
            <TableCell className="text-center py-2 text-xs">
              {value !== 0 ? formatPercentage(value, baseValue) : "—"}
            </TableCell>
          )}
        </>
      );
    }
  };

  // Transaction filtering for viewer (similar to P&L approach)
  const selectedCategoryTransactions = useMemo(() => {
    if (!viewerModal.category) return [];

    // Get transactions based on the selected category
    let transactions: Transaction[] = [];

    // Check if we're dealing with a specific account (has an ID that matches an account)
    const specificAccount = accounts.find((a) => a.id === viewerModal.category?.id);

    if (specificAccount) {
      // If it's a specific account, get transactions for that account and its subaccounts
      const accountIds = getAllAccountIds(accounts, specificAccount);
      transactions = journalEntries.filter((tx) => accountIds.includes(tx.chart_account_id));
      console.log(`Filtering for specific account: ${specificAccount.name}`, transactions);
    } else {
      // Otherwise filter by account type category
      const categoryType = viewerModal.category.id;

      // Base filter function for the category
      const getCategoryFilter = (tx: Transaction) => {
        const account = accounts.find((a) => a.id === tx.chart_account_id);
        switch (categoryType) {
          case "revenue":
            return account?.type === "Revenue";
          case "cogs":
            return account?.type === "COGS";
          case "expenses":
            return account?.type === "Expense";
          case "assets":
            return account?.type === "Asset" && !bankAccounts.some((ba) => ba.id === account.id);
          case "liabilities":
            return account?.type === "Liability" || account?.type === "Credit Card";
          case "equity":
            return account?.type === "Equity";
          default:
            return false;
        }
      };

      // Get base transactions for the category
      transactions = journalEntries.filter((tx) => getCategoryFilter(tx));
    }

    console.log(transactions);

    // If a month or quarter is selected, filter by that period with proper date boundaries
    if (viewerModal.selectedMonth) {
      let periodStart: string;
      let periodEnd: string;

      if (viewerModal.selectedMonth.includes("-Q")) {
        // Handle quarterly view (e.g., "2025-Q1")
        const [year, q] = viewerModal.selectedMonth.split("-Q");
        const quarterNum = parseInt(q);
        periodStart = `${year}-${String((quarterNum - 1) * 3 + 1).padStart(2, "0")}-01`;
        const quarterEndMonth = quarterNum * 3;
        periodEnd = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${new Date(
          parseInt(year),
          quarterEndMonth,
          0
        ).getDate()}`;
      } else {
        // Handle monthly view (e.g., "2025-05")
        periodStart = `${viewerModal.selectedMonth}-01`;
        // Fix the month calculation - JS months are 0-indexed but our string is 1-indexed
        const year = parseInt(viewerModal.selectedMonth.split("-")[0]);
        const month = parseInt(viewerModal.selectedMonth.split("-")[1]);
        // To get the last day of a month, we can use the 0th day of the next month, then go back 1 day
        const lastDay = new Date(year, month, 0).getDate();
        periodEnd = `${viewerModal.selectedMonth}-${String(lastDay).padStart(2, "0")}`;
      }

      console.log(
        `Filtering cash flow transactions for period: ${viewerModal.selectedMonth}, from ${periodStart} to ${periodEnd}`
      );

      // Filter transactions that fall within the selected period
      transactions = transactions.filter((tx) => {
        const matches = tx.date >= periodStart && tx.date <= periodEnd;
        return matches;
      });
    } else {
      // Otherwise filter by the full date range
      transactions = transactions.filter((tx) => tx.date >= startDate && tx.date <= endDate);
    }

    return transactions;
  }, [viewerModal, journalEntries, accounts, bankAccounts, startDate, endDate]);

  // Handle row click to show transaction viewer
  const handleRowClick = (categoryType: string, categoryName: string) => {
    setViewerModal({
      isOpen: true,
      category: {
        id: categoryType,
        name: categoryName,
        type: categoryType,
      },
    });
  };

  // Handle cell click to show transactions for a specific month
  const handleCellClick = (categoryType: string, categoryName: string, month: string) => {
    console.log(`Cell clicked for category: ${categoryType}, name: ${categoryName}, month: ${month}`);

    // Find the specific account if it exists
    let category = {
      id: categoryType,
      name: categoryName,
      type: categoryType,
    };

    // Check if this is a specific account name rather than a category type
    const specificAccount = accounts.find((a) => a.name === categoryName);
    if (specificAccount) {
      category = {
        id: specificAccount.id,
        name: specificAccount.name,
        type: specificAccount.type,
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
              <Table className="border border-gray-300 w-full table-auto">
                <TableHeader className="text-xs bg-gray-100 h-3">
                  <TableRow>
                    <TableHead className="border p-1 text-center text-xs whitespace-nowrap">
                      Cash Flow Activities
                    </TableHead>
                    {isMonthlyView ? (
                      <>
                        {getMonthsInRange(startDate, endDate).map((month) => (
                          <React.Fragment key={month}>
                            <TableHead className="border p-1 text-center text-xs whitespace-nowrap">
                              {formatMonth(month)}
                            </TableHead>
                            {showPercentages && (
                              <TableHead className="text-center font-bold text-slate-700 min-w-11">%</TableHead>
                            )}
                          </React.Fragment>
                        ))}
                        <TableHead className="border p-1 text-center text-xs whitespace-nowrap">Total</TableHead>
                        {showPercentages && (
                          <TableHead className="border p-1 text-center text-xs whitespace-nowrap">%</TableHead>
                        )}
                      </>
                    ) : isQuarterlyView ? (
                      <>
                        {getQuartersInRange(startDate, endDate).map((quarter) => (
                          <React.Fragment key={quarter}>
                            <TableHead className="border p-1 text-center text-xs whitespace-nowrap">
                              {formatQuarter(quarter)}
                            </TableHead>
                            {showPercentages && (
                              <TableHead className="text-center font-bold text-slate-700 min-w-11">%</TableHead>
                            )}
                          </React.Fragment>
                        ))}
                        <TableHead className="border p-1 text-center text-xs whitespace-nowrap">Total</TableHead>
                        {showPercentages && <TableHead className="text-center font-bold text-slate-700">%</TableHead>}
                      </>
                    ) : (
                      <>
                        <TableHead className="border p-1 text-center text-xs whitespace-nowrap">Amount</TableHead>
                        {showPercentages && <TableHead className="text-center font-bold text-slate-700">%</TableHead>}
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {loading || loadingSavedReport ? (
                    <TableRow>
                      <TableCell colSpan={getTotalColumns()} className="py-8 text-center">
                        <div className="flex flex-col items-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                          <span className="text-xs">Loading financial data...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {/* Beginning Bank Balance */}
                      <TableRow>
                        <TableCell className="font-semibold text-slate-800 py-3">Beginning Bank Balance</TableCell>
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

                              // Calculate percentage based on total assets or total liabilities + equity
                              const totalFinancing = Math.abs(financingActivities.netFinancingChange);
                              const baseValue = totalFinancing > 0 ? totalFinancing : 1;

                              return (
                                <React.Fragment key={month}>
                                  <TableCell className="text-right py-3">{formatNumber(balance)}</TableCell>
                                  {showPercentages && (
                                    <TableCell className="text-right p-1 py-3 text-xs">
                                      {balance !== 0 ? formatPercentage(balance, baseValue) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell className="text-right py-3">{formatNumber(beginningBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell className="text-right p-1 py-3 text-xs">
                                {beginningBankBalance !== 0
                                  ? formatPercentage(
                                      beginningBankBalance,
                                      Math.abs(financingActivities.netFinancingChange) || 1
                                    )
                                  : "—"}
                              </TableCell>
                            )}
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

                              // Calculate percentage based on total assets or total liabilities + equity
                              const totalFinancing = Math.abs(financingActivities.netFinancingChange);
                              const baseValue = totalFinancing > 0 ? totalFinancing : 1;

                              return (
                                <React.Fragment key={quarter}>
                                  <TableCell className="text-right py-3">{formatNumber(balance)}</TableCell>
                                  {showPercentages && (
                                    <TableCell className="text-right p-1 py-3 text-xs">
                                      {balance !== 0 ? formatPercentage(balance, baseValue) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell className="text-right py-3">{formatNumber(beginningBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell className="text-right p-1 py-3 text-xs">
                                {beginningBankBalance !== 0
                                  ? formatPercentage(
                                      beginningBankBalance,
                                      Math.abs(financingActivities.netFinancingChange) || 1
                                    )
                                  : "—"}
                              </TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right py-3">{formatNumber(beginningBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell className="text-right p-1 py-3 text-xs">
                                {beginningBankBalance !== 0
                                  ? formatPercentage(
                                      beginningBankBalance,
                                      Math.abs(financingActivities.netFinancingChange) || 1
                                    )
                                  : "—"}
                              </TableCell>
                            )}
                          </>
                        )}
                      </TableRow>

                      {/* Operating Activities */}
                      <TableRow className="border-b-2 border-slate-200">
                        <TableCell className="font-semibold text-slate-800 py-3">Operating:</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell></TableCell>
                                {showPercentages && <TableCell></TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                            {showPercentages && <TableCell></TableCell>}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell></TableCell>
                                {showPercentages && <TableCell></TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                            {showPercentages && <TableCell></TableCell>}
                          </>
                        ) : (
                          <>
                            <TableCell></TableCell>
                            {showPercentages && <TableCell></TableCell>}
                          </>
                        )}
                      </TableRow>

                      {/* Revenue */}
                      <TableRow>
                        <TableCell className="py-2 font-medium">Revenue</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue,
                          undefined,
                          "revenue",
                          "Revenue"
                        )}
                      </TableRow>
                      {/* Render revenue accounts */}
                      {getTopLevelAccounts("Revenue").map((account) => renderAccountRow(account, 1))}

                      {/* COGS */}
                      <TableRow>
                        <TableCell className="py-2 font-medium">Cost of Goods Sold</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).cogs,
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue,
                          "cogs",
                          "COGS"
                        )}
                      </TableRow>
                      {/* Render COGS accounts */}
                      {getTopLevelAccounts("COGS").map((account) => renderAccountRow(account, 1))}

                      {/* Expenses */}
                      <TableRow>
                        <TableCell className="py-2 font-medium">Expenses</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).expenses,
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue,
                          "expenses",
                          "Expenses"
                        )}
                      </TableRow>
                      {/* Render expense accounts */}
                      {getTopLevelAccounts("Expense").map((account) => renderAccountRow(account, 1))}
                      <TableRow>
                        <TableCell className="font-medium py-3">Net Income</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome,
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue
                        )}
                      </TableRow>
                      <TableRow className="border-b border-slate-200">
                        <TableCell className="font-medium py-3">Operating Change:</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome,
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue
                        )}
                      </TableRow>

                      {/* Investing Activities */}
                      <TableRow className="border-b-2 border-slate-200">
                        <TableCell className="font-semibold text-slate-800 py-3">Investing:</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell></TableCell>
                                {showPercentages && <TableCell></TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                            {showPercentages && <TableCell></TableCell>}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell></TableCell>
                                {showPercentages && <TableCell></TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                            {showPercentages && <TableCell></TableCell>}
                          </>
                        ) : (
                          <>
                            <TableCell></TableCell>
                            {showPercentages && <TableCell></TableCell>}
                          </>
                        )}
                      </TableRow>

                      {/* Non-bank assets */}
                      <TableRow>
                        <TableCell className="py-2 font-medium">Changes in Non-Bank Assets</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateInvestingActivitiesForPeriod(periodStart, periodEnd).increaseInAssets,
                          undefined,
                          "assets",
                          "Changes in Non-Bank Assets"
                        )}
                      </TableRow>
                      {/* Render non-bank asset accounts */}
                      {accounts
                        .filter(
                          (acc) =>
                            acc.type === "Asset" &&
                            !acc.name.toLowerCase().includes("cash") &&
                            !acc.name.toLowerCase().includes("bank") &&
                            !acc.name.toLowerCase().includes("checking") &&
                            !acc.name.toLowerCase().includes("savings") &&
                            !acc.parent_id // Only top-level accounts
                        )
                        .map((account) => renderAccountRow(account, 1))}

                      <TableRow className="border-b border-slate-200">
                        <TableCell className="font-medium py-3">Investing Change:</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateInvestingActivitiesForPeriod(periodStart, periodEnd).netInvestingChange
                        )}
                      </TableRow>

                      {/* Financing Activities */}
                      <TableRow className="border-b-2 border-slate-200">
                        <TableCell className="font-semibold text-slate-800 py-3">Financing:</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell></TableCell>
                                {showPercentages && <TableCell></TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                            {showPercentages && <TableCell></TableCell>}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell></TableCell>
                                {showPercentages && <TableCell></TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell></TableCell>
                            {showPercentages && <TableCell></TableCell>}
                          </>
                        ) : (
                          <>
                            <TableCell></TableCell>
                            {showPercentages && <TableCell></TableCell>}
                          </>
                        )}
                      </TableRow>

                      {/* Credit Cards */}
                      <TableRow>
                        <TableCell className="py-2 font-medium">Credit Cards</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) => {
                            const creditCardAccounts = accounts.filter((acc) => acc.type === "Credit Card");
                            return creditCardAccounts.reduce((total, account) => {
                              const accountTransactions = journalEntries.filter(
                                (tx) =>
                                  tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
                              );
                              return (
                                total +
                                accountTransactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0)
                              );
                            }, 0);
                          },
                          undefined,
                          "liabilities",
                          "Credit Cards"
                        )}
                      </TableRow>
                      {/* Render credit card accounts */}
                      {accounts
                        .filter((acc) => acc.type === "Credit Card" && !acc.parent_id)
                        .map((account) => renderAccountRow(account, 1))}

                      {/* Liabilities */}
                      <TableRow>
                        <TableCell className="py-2 font-medium">Liabilities</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) => {
                            const liabilityAccounts = accounts.filter((acc) => acc.type === "Liability");
                            return liabilityAccounts.reduce((total, account) => {
                              const accountTransactions = journalEntries.filter(
                                (tx) =>
                                  tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
                              );
                              return (
                                total +
                                accountTransactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0)
                              );
                            }, 0);
                          },
                          undefined,
                          "liabilities",
                          "Liabilities"
                        )}
                      </TableRow>
                      {/* Render liability accounts */}
                      {accounts
                        .filter((acc) => acc.type === "Liability" && !acc.parent_id)
                        .map((account) => renderAccountRow(account, 1))}

                      {/* Equity */}
                      <TableRow>
                        <TableCell className="py-2 font-medium">Equity</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).ownerContributions,
                          undefined,
                          "equity",
                          "Equity"
                        )}
                      </TableRow>
                      {/* Render equity accounts */}
                      {accounts
                        .filter((acc) => acc.type === "Equity" && !acc.parent_id)
                        .map((account) => renderAccountRow(account, 1))}
                      <TableRow className="border-b border-slate-200">
                        <TableCell className="font-medium py-3">Financing Change:</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).netFinancingChange
                        )}
                      </TableRow>

                      {/* Ending Bank Balance */}
                      <TableRow className="border-b-2 border-slate-400">
                        <TableCell className="font-bold text-slate-900 py-4">Ending Bank Balance</TableCell>
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

                              // Calculate percentage based on total assets or total liabilities + equity
                              const totalFinancing = Math.abs(financingActivities.netFinancingChange);
                              const baseValue = totalFinancing > 0 ? totalFinancing : 1;

                              return (
                                <React.Fragment key={month}>
                                  <TableCell className="text-right font-bold text-slate-900 py-4">
                                    {formatNumber(balance)}
                                  </TableCell>
                                  {showPercentages && (
                                    <TableCell className="text-right py-4 text-xs">
                                      {balance !== 0 ? formatPercentage(balance, baseValue) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell className="text-right font-bold text-slate-900 py-4">
                              {formatNumber(endingBankBalance)}
                            </TableCell>
                            {showPercentages && (
                              <TableCell className="text-right py-4 text-xs">
                                {endingBankBalance !== 0
                                  ? formatPercentage(
                                      endingBankBalance,
                                      Math.abs(financingActivities.netFinancingChange) || 1
                                    )
                                  : "—"}
                              </TableCell>
                            )}
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

                              // Calculate percentage based on total assets or total liabilities + equity
                              const totalFinancing = Math.abs(financingActivities.netFinancingChange);
                              const baseValue = totalFinancing > 0 ? totalFinancing : 1;

                              return (
                                <React.Fragment key={quarter}>
                                  <TableCell className="text-right font-bold text-slate-900 py-4">
                                    {formatNumber(balance)}
                                  </TableCell>
                                  {showPercentages && (
                                    <TableCell className="text-center py-4 text-xs">
                                      {balance !== 0 ? formatPercentage(balance, baseValue) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell className="text-right font-bold text-slate-900 py-4">
                              {formatNumber(endingBankBalance)}
                            </TableCell>
                            {showPercentages && (
                              <TableCell className="text-center py-4 text-xs">
                                {endingBankBalance !== 0
                                  ? formatPercentage(
                                      endingBankBalance,
                                      Math.abs(financingActivities.netFinancingChange) || 1
                                    )
                                  : "—"}
                              </TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right font-bold text-slate-900 py-4">
                              {formatNumber(endingBankBalance)}
                            </TableCell>
                            {showPercentages && (
                              <TableCell className="text-center py-4 text-xs">
                                {endingBankBalance !== 0
                                  ? formatPercentage(
                                      endingBankBalance,
                                      Math.abs(financingActivities.netFinancingChange) || 1
                                    )
                                  : "—"}
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
        />
      </div>
    </div>
  );
}
