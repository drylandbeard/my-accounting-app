"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSearchParams } from "next/navigation";

// Shared imports
import { Transaction, ViewerModalState } from "../_types";
import {
  formatDateForDisplay,
  formatNumber,
  formatPercentage,
  getAllAccountIds,
  getMonthsInRange,
  getQuartersInRange,
  formatMonth,
  formatQuarter,
} from "../_utils";
import { useFinancialData } from "../_hooks/useFinancialData";
import { usePeriodSelection } from "../_hooks/usePeriodSelection";
import { ReportHeader } from "../_components/ReportHeader";
import { TransactionViewer } from "../_components/TransactionViewer";
import { SaveReportModal } from "../_components/SaveReportModal";
import { api } from "@/lib/api";
import { useAccountOperations } from "../_hooks/useAccountOperations";
import { useExportCashFlow } from "../_hooks/useExportCashFlow";

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
    getTopLevelAccounts,
    collapseAllParentCategories,
    expandAllParentCategories,
    getParentAccounts,
  } = useAccountOperations({
    accounts,
    journalEntries,
  });

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

  // Helper function to get category name
  const getCategoryName = (tx: Transaction) => {
    return accounts.find((a) => a.id === tx.chart_account_id)?.name || "";
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
        if (baseGetter) {
          return totalBaseValue > 0
            ? totalBaseValue
            : totalRevenue > 0
            ? totalRevenue
            : totalExpenses > 0
            ? totalExpenses
            : totalFinancing > 0
            ? totalFinancing
            : 1;
        } else {
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
                  className={`text-right py-2 ${categoryType ? "cursor-pointer hover:bg-slate-100" : ""}`}
                  onClick={
                    categoryType && categoryName ? () => handleCellClick(categoryType, categoryName, month) : undefined
                  }
                >
                  {formatNumber(value)}
                </TableCell>
                {showPercentages && (
                  <TableCell
                    className={`text-center py-2 text-xs ${categoryType ? "cursor-pointer hover:bg-slate-100" : ""}`}
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
          <TableCell className="text-right py-2">{formatNumber(totalValue)}</TableCell>
          {showPercentages && (
            <TableCell className="text-center py-2 text-xs">
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
        if (baseGetter) {
          return totalBaseValue > 0
            ? totalBaseValue
            : totalRevenue > 0
            ? totalRevenue
            : totalExpenses > 0
            ? totalExpenses
            : totalFinancing > 0
            ? totalFinancing
            : 1;
        } else {
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
                <TableCell className="text-right py-2">{formatNumber(value)}</TableCell>
                {showPercentages && (
                  <TableCell className="text-center py-2 text-xs">
                    {value !== 0 ? formatPercentage(value, quarterBaseValue) : "—"}
                  </TableCell>
                )}
              </React.Fragment>
            );
          })}
          <TableCell className="text-right py-2">{formatNumber(totalValue)}</TableCell>
          {showPercentages && (
            <TableCell className="text-center py-2 text-xs">
              {totalValue !== 0 ? formatPercentage(totalValue, getBaseValue(totalValue)) : "—"}
            </TableCell>
          )}
        </>
      );
    } else {
      const value = getValue(startDate, endDate);

      // Calculate base value for percentages
      const totalFinancing = Math.abs(financingActivities.netFinancingChange);
      const totalRevenue = Math.abs(operatingActivities.revenue);
      const totalExpenses = Math.abs(operatingActivities.expenses);

      let baseValue;
      if (baseGetter) {
        const originalBase = Math.abs(baseGetter(startDate, endDate));
        baseValue =
          originalBase > 0
            ? originalBase
            : totalRevenue > 0
            ? totalRevenue
            : totalExpenses > 0
            ? totalExpenses
            : totalFinancing > 0
            ? totalFinancing
            : 1;
      } else {
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

  // Helper function to get transactions for a specific line item
  const getTransactionsForCategory = (categoryType: string, selectedMonth?: string) => {
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

    // If a month is selected, filter by that month
    if (selectedMonth) {
      const monthStart = `${selectedMonth}-01`;
      const lastDay = new Date(
        parseInt(selectedMonth.split("-")[0]),
        parseInt(selectedMonth.split("-")[1]),
        0
      ).getDate();
      const monthEnd = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

      console.log(`Filtering transactions for month: ${selectedMonth}, from ${monthStart} to ${monthEnd}`);

      // Filter transactions that fall within the selected month
      return journalEntries.filter((tx) => {
        const matches = getCategoryFilter(tx) && tx.date >= monthStart && tx.date <= monthEnd;
        return matches;
      });
    } else {
      // Otherwise filter by the full date range
      return journalEntries.filter((tx) => getCategoryFilter(tx) && tx.date >= startDate && tx.date <= endDate);
    }
  };

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
    console.log(`Cell clicked for category: ${categoryType}, month: ${month}`);

    // The month format should already be YYYY-MM
    const formattedMonthDisplay = formatMonth(month); // Convert to display format (e.g., "May 2025")

    setViewerModal({
      isOpen: true,
      category: {
        id: categoryType,
        name: categoryName,
        type: categoryType,
      },
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
            <p className="text-sm text-slate-600 mb-6 text-center">
              {formatDateForDisplay(startDate)} to {formatDateForDisplay(endDate)}
            </p>

            <div className="overflow-x-auto">
              <Table className="w-full table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left font-bold text-slate-700">Cash Flow Activities</TableHead>
                    {isMonthlyView ? (
                      <>
                        {getMonthsInRange(startDate, endDate).map((month) => (
                          <React.Fragment key={month}>
                            <TableHead className="text-right font-bold text-slate-700">{formatMonth(month)}</TableHead>
                            {showPercentages && (
                              <TableHead className="text-center font-bold text-slate-700 min-w-11">%</TableHead>
                            )}
                          </React.Fragment>
                        ))}
                        <TableHead className="text-right font-bold text-slate-700">Total</TableHead>
                        {showPercentages && <TableHead className="text-center font-bold text-slate-700">%</TableHead>}
                      </>
                    ) : isQuarterlyView ? (
                      <>
                        {getQuartersInRange(startDate, endDate).map((quarter) => (
                          <React.Fragment key={quarter}>
                            <TableHead className="text-right font-bold text-slate-700">
                              {formatQuarter(quarter)}
                            </TableHead>
                            {showPercentages && (
                              <TableHead className="text-center font-bold text-slate-700 min-w-11">%</TableHead>
                            )}
                          </React.Fragment>
                        ))}
                        <TableHead className="text-right font-bold text-slate-700">Total</TableHead>
                        {showPercentages && <TableHead className="text-center font-bold text-slate-700">%</TableHead>}
                      </>
                    ) : (
                      <>
                        <TableHead className="text-right font-bold text-slate-700">Amount</TableHead>
                        {showPercentages && <TableHead className="text-center font-bold text-slate-700">%</TableHead>}
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading || loadingSavedReport ? (
                    <TableRow>
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange(startDate, endDate).length * (showPercentages ? 2 : 1) + 2
                            : isQuarterlyView
                            ? getQuartersInRange(startDate, endDate).length * (showPercentages ? 2 : 1) + 2
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="py-8 text-center"
                      >
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
                                    <TableCell className="text-center py-3 text-xs">
                                      {balance !== 0 ? formatPercentage(balance, baseValue) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell className="text-right py-3">{formatNumber(beginningBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell className="text-center py-3 text-xs">
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
                                    <TableCell className="text-center py-3 text-xs">
                                      {balance !== 0 ? formatPercentage(balance, baseValue) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell className="text-right py-3">{formatNumber(beginningBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell className="text-center py-3 text-xs">
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
                              <TableCell className="text-center py-3 text-xs">
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
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("revenue", "Revenue")}
                      >
                        <TableCell className="pl-6 py-2">Revenue</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue,
                          undefined,
                          "revenue",
                          "Revenue"
                        )}
                      </TableRow>
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("cogs", "COGS")}
                      >
                        <TableCell className="pl-6 py-2">COGS</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).cogs,
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue,
                          "cogs",
                          "COGS"
                        )}
                      </TableRow>
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("expenses", "Expenses")}
                      >
                        <TableCell className="pl-6 py-2">Expenses</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).expenses,
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue,
                          "expenses",
                          "Expenses"
                        )}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium pl-4 py-3">Net Income</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome,
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue
                        )}
                      </TableRow>
                      <TableRow className="border-b border-slate-200">
                        <TableCell className="font-medium pl-4 py-3">Operating Change:</TableCell>
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
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("assets", "Increase in Assets (non bank accounts)")}
                      >
                        <TableCell className="pl-6 py-2">Increase in Assets (non bank accounts)</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateInvestingActivitiesForPeriod(periodStart, periodEnd).increaseInAssets,
                          undefined,
                          "assets",
                          "Increase in Assets (non bank accounts)"
                        )}
                      </TableRow>
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("assets", "Decrease in Assets (non bank accounts)")}
                      >
                        <TableCell className="pl-6 py-2">Decrease in Assets (non bank accounts)</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateInvestingActivitiesForPeriod(periodStart, periodEnd).decreaseInAssets,
                          undefined,
                          "assets",
                          "Decrease in Assets (non bank accounts)"
                        )}
                      </TableRow>
                      <TableRow className="border-b border-slate-200">
                        <TableCell className="font-medium pl-4 py-3">Investing Change:</TableCell>
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
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("liabilities", "Increase / decrease in Credit Cards")}
                      >
                        <TableCell className="pl-6 py-2">Increase / decrease in Credit Cards</TableCell>
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
                          "Increase / decrease in Credit Cards"
                        )}
                      </TableRow>
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("liabilities", "Increases in Liabilities (e.g. new loans)")}
                      >
                        <TableCell className="pl-6 py-2">Increases in Liabilities (e.g. new loans)</TableCell>
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
                          "Increases in Liabilities (e.g. new loans)"
                        )}
                      </TableRow>
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("liabilities", "Decreases in Liabilities (e.g. loan repayments)")}
                      >
                        <TableCell className="pl-6 py-2">Decreases in Liabilities (e.g. loan repayments)</TableCell>
                        {renderPeriodCells((periodStart, periodEnd) => 0)}
                      </TableRow>
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("equity", "Owner contributions (Equity increases)")}
                      >
                        <TableCell className="pl-6 py-2">Owner contributions (Equity increases)</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).ownerContributions,
                          undefined,
                          "equity",
                          "Owner contributions (Equity increases)"
                        )}
                      </TableRow>
                      <TableRow
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleRowClick("equity", "Owner distributions (Equity decreases)")}
                      >
                        <TableCell className="pl-6 py-2">Owner distributions (Equity decreases)</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).ownerDistributions,
                          undefined,
                          "equity",
                          "Owner distributions (Equity decreases)"
                        )}
                      </TableRow>
                      <TableRow className="border-b border-slate-200">
                        <TableCell className="font-medium pl-4 py-3">Financing Change:</TableCell>
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
          selectedCategoryTransactions={
            viewerModal.category ? getTransactionsForCategory(viewerModal.category.id, viewerModal.selectedMonth) : []
          }
          startDate={startDate}
          endDate={endDate}
          companyName={currentCompany.name}
          getCategoryName={getCategoryName}
        />
      </div>
    </div>
  );
}
