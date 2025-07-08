"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSearchParams } from "next/navigation";
import { useExportCashFlow } from "../_hooks/useExportCashFlow";

// Shared imports
import { Transaction, ViewerModalState } from "../_types";
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
import { ReportHeader } from "../_components/ReportHeader";
import { TransactionViewer } from "../_components/TransactionViewer";
import { SaveReportModal } from "../_components/SaveReportModal";
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
    getTopLevelAccounts,
    calculateAccountTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForQuarter,
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

  // Account groups
  const revenueRows = getTopLevelAccounts("Revenue");
  const cogsRows = getTopLevelAccounts("COGS");
  const expenseRows = getTopLevelAccounts("Expense");

  // Totals for cash flow calculations
  const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const totalCOGS = cogsRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const totalExpenses = expenseRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);

  // Net Income: difference of Revenue, COGS, and Expenses (as per business requirements)
  const netIncome = totalRevenue - totalCOGS - totalExpenses;

  // Get bank accounts for beginning and ending balance - specifically "Bank Account" type as per business requirements
  const bankAccounts = useMemo(() => {
    return accounts.filter((acc) => acc.type === "Bank Account");
  }, [accounts]);

  // Beginning Bank Balance: total of all Bank Account type categories (as per business requirements)
  const beginningBankBalance = useMemo(() => {
    return bankAccounts.reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date < startDate
      );
      // For bank accounts, debits increase balance, credits decrease balance
      return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);
  }, [bankAccounts, journalEntries, startDate]);

  // Period-specific calculation functions
  const calculateOperatingActivitiesForPeriod = useCallback(
    (periodStart: string, periodEnd: string) => {
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
    },
    [accounts, journalEntries, getTopLevelAccounts]
  );

  const calculateInvestingActivitiesForPeriod = useCallback(
    (periodStart: string, periodEnd: string) => {
      // Get asset accounts excluding bank accounts as per business requirements
      const assetAccounts = accounts.filter((acc) => acc.type === "Asset");

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
    [accounts, journalEntries]
  );

  const calculateFinancingActivitiesForPeriod = useCallback(
    (periodStart: string, periodEnd: string) => {
      const liabilityAccounts = accounts.filter((acc) => acc.type === "Liability");
      const equityAccounts = accounts.filter((acc) => acc.type === "Equity");
      const creditCardAccounts = accounts.filter((acc) => acc.type === "Credit Card");

      // Increase in Liabilities: total of liabilities credits (as per business requirements)
      const increaseInLiabilities = [...liabilityAccounts, ...creditCardAccounts].reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date >= periodStart && tx.date <= periodEnd
        );
        // For liabilities, credits represent increases
        const credits = accountTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
        return total + credits;
      }, 0);

      // Decrease in Liabilities: total of liabilities debits (as per business requirements)
      const decreaseInLiabilities = [...liabilityAccounts, ...creditCardAccounts].reduce((total, account) => {
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

      // Net Financing Change: Increase in Liabilities - Decrease in Liabilities + Owner Investment - Owner Withdrawal
      const netFinancingChange = increaseInLiabilities - decreaseInLiabilities + ownerInvestment - ownerWithdrawal;

      return {
        increaseInLiabilities,
        decreaseInLiabilities,
        ownerInvestment,
        ownerWithdrawal,
        netFinancingChange,
      };
    },
    [accounts, journalEntries]
  );

  // Calculate bank balance for period (defined after other calculation functions)
  const calculateBankBalanceForPeriod = useCallback(
    (periodEnd: string) => {
      // Calculate ending bank balance for a specific period using the cash flow formula
      const periodStartBalance = bankAccounts.reduce((total, account) => {
        const accountTransactions = journalEntries.filter(
          (tx) => tx.chart_account_id === account.id && tx.date < startDate
        );
        return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
      }, 0);

      const operating = calculateOperatingActivitiesForPeriod(startDate, periodEnd);
      const investing = calculateInvestingActivitiesForPeriod(startDate, periodEnd);
      const financing = calculateFinancingActivitiesForPeriod(startDate, periodEnd);

      return periodStartBalance + operating.netIncome + investing.netInvestingChange + financing.netFinancingChange;
    },
    [
      bankAccounts,
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
    accounts,
    journalEntries,
    bankAccounts,
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
    showPercentages,
    startDate,
    endDate,
    collapsedAccounts,
    calculateAccountTotal,
    calculateAccountDirectTotal: calculateAccountTotal, // Use the same function since calculateAccountDirectTotal is not defined
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts: calculateAccountTotalForMonth, // Use the same function since calculateAccountTotalForMonthWithSubaccounts is not defined
    calculateAccountTotalForQuarter,
    calculateAccountTotalForQuarterWithSubaccounts: calculateAccountTotalForQuarter, // Use the same function since calculateAccountTotalForQuarterWithSubaccounts is not defined
    formatPercentageForAccount: (num: number) => formatPercentage(num, Math.abs(num)), // Simple wrapper
    calculatePercentageForMonth: (amount: number) => formatPercentage(amount, Math.abs(amount)), // Simple wrapper
    calculatePercentageForQuarter: (amount: number) => formatPercentage(amount, Math.abs(amount)), // Simple wrapper
    calculateBankBalanceForPeriod,
    calculateOperatingActivitiesForPeriod,
    calculateInvestingActivitiesForPeriod,
    calculateFinancingActivitiesForPeriod,
  });

  // Helper functions (similar to P&L and Balance Sheet)
  const getCategoryName = (tx: Transaction) => {
    return accounts.find((a) => a.id === tx.chart_account_id)?.name || "";
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
      const totalNetIncome = Math.abs(operatingActivities.netIncome);

      // Determine which base to use for percentages
      const getBaseValue = () => {
        // For different sections, use different base values
        if (categoryType === "Revenue" || categoryType === "COGS" || categoryType === "Expense") {
          // For operating activities, use revenue as base
          return totalNetIncome;
        } else if (categoryType === "Asset") {
          // For investing activities, use total assets as base
          const totalAssets = Math.abs(investingActivities.increaseInAssets);
          return totalAssets > 0 ? totalAssets : 1;
        } else if (categoryType === "Liability" || categoryType === "Equity" || categoryType === "Credit Card") {
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
                {showPercentages && (
                  <TableCell className={`${categoryType ? "cursor-pointer hover:bg-slate-100" : ""}`} isValue>
                    {value !== 0 ? formatPercentage(value, getBaseValue()) : "—"}
                  </TableCell>
                )}
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
          {showPercentages && (
            <TableCell isValue>{totalValue !== 0 ? formatPercentage(totalValue, getBaseValue()) : "—"}</TableCell>
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
      const totalNetIncome = Math.abs(operatingActivities.netIncome);

      // Determine which base to use for percentages
      const getBaseValue = () => {
        // For different sections, use different base values
        if (categoryType === "Revenue" || categoryType === "COGS" || categoryType === "Expense") {
          // For operating activities, use revenue as base
          return totalNetIncome > 0 ? totalNetIncome : 1;
        } else if (categoryType === "Asset") {
          // For investing activities, use total assets as base
          const totalAssets = Math.abs(investingActivities.increaseInAssets);
          return totalAssets > 0 ? totalAssets : 1;
        } else if (categoryType === "Liability" || categoryType === "Equity" || categoryType === "Credit Card") {
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
              quarterBaseValue = quarterBase > 0 ? quarterBase : getBaseValue();
            } else {
              quarterBaseValue = Math.abs(value) > 0 ? Math.abs(value) : getBaseValue();
            }

            return (
              <React.Fragment key={quarter}>
                <TableCell isValue>{formatNumber(value)}</TableCell>
                {showPercentages && (
                  <TableCell isValue>{value !== 0 ? formatPercentage(value, quarterBaseValue) : "—"}</TableCell>
                )}
              </React.Fragment>
            );
          })}
          <TableCell isValue>{formatNumber(totalValue)}</TableCell>
          {showPercentages && (
            <TableCell isValue>{totalValue !== 0 ? formatPercentage(totalValue, getBaseValue()) : "—"}</TableCell>
          )}
        </>
      );
    } else {
      const value = getValue(startDate, endDate);

      return (
        <>
          <TableCell isValue>{formatNumber(value)}</TableCell>
          {showPercentages && <TableCell isValue>{value !== 0 ? formatPercentage(value, netIncome) : "—"}</TableCell>}
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
        ? journalEntries.filter((tx) => getAllGroupAccountIds(accounts, revenueRows).includes(tx.chart_account_id))
        : category.id === "COGS_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(accounts, cogsRows).includes(tx.chart_account_id))
        : category.id === "EXPENSE_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(accounts, expenseRows).includes(tx.chart_account_id))
        : journalEntries.filter((tx) => getAllAccountIds(accounts, category).includes(tx.chart_account_id));

    if (viewerModal.selectedMonth) {
      transactions = transactions.filter((tx) => tx.date.startsWith(viewerModal.selectedMonth!));
    }

    return transactions;
  }, [viewerModal, journalEntries, accounts, revenueRows, cogsRows, expenseRows]);

  // Handle cell click to show transactions for a specific month
  const handleCellClick = (categoryType: string, categoryName: string, month: string) => {
    // Find the specific account if it exists
    let category;

    // Check if this is a specific account name rather than a category type
    const specificAccount = accounts.find((a) => a.name === categoryName);

    if (specificAccount) {
      category = {
        id: specificAccount.id,
        name: specificAccount.name,
        type: specificAccount.type,
      };
    } else {
      // For category groups like "Revenue", "COGS", "Expenses"
      // Use consistent ID format like in PnL page (REVENUE_GROUP, COGS_GROUP, EXPENSE_GROUP)
      const groupId = categoryType.toUpperCase() + "_GROUP";
      category = {
        id: groupId,
        name: categoryName,
        type: categoryType,
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
              <Table className="table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead>Cash Flow Activities</TableHead>
                    {isMonthlyView ? (
                      <>
                        {getMonthsInRange(startDate, endDate).map((month) => (
                          <React.Fragment key={month}>
                            <TableHead className="whitespace-nowrap">{formatMonth(month)}</TableHead>
                            {showPercentages && <TableHead className="whitespace-nowrap min-w-11">%</TableHead>}
                          </React.Fragment>
                        ))}
                        <TableHead>Total</TableHead>
                        {showPercentages && <TableHead>%</TableHead>}
                      </>
                    ) : isQuarterlyView ? (
                      <>
                        {getQuartersInRange(startDate, endDate).map((quarter) => (
                          <React.Fragment key={quarter}>
                            <TableHead className="whitespace-nowrap">{formatQuarter(quarter)}</TableHead>
                            {showPercentages && <TableHead className="whitespace-nowrap">%</TableHead>}
                          </React.Fragment>
                        ))}
                        <TableHead>Total</TableHead>
                        {showPercentages && <TableHead>%</TableHead>}
                      </>
                    ) : (
                      <>
                        <TableHead>Amount</TableHead>
                        {showPercentages && <TableHead>%</TableHead>}
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
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

                              // Use the absolute value of the balance itself as the base for percentage
                              const baseValue = Math.abs(balance);

                              return (
                                <React.Fragment key={month}>
                                  <TableCell isValue>{formatNumber(balance)}</TableCell>
                                  {showPercentages && (
                                    <TableCell isValue>
                                      {balance !== 0 ? formatPercentage(balance, baseValue) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell isValue>{formatNumber(beginningBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {beginningBankBalance !== 0
                                  ? formatPercentage(beginningBankBalance, Math.abs(beginningBankBalance))
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

                              // Use the absolute value of the balance itself as the base for percentage
                              const baseValue = Math.abs(balance);

                              return (
                                <React.Fragment key={quarter}>
                                  <TableCell isValue>{formatNumber(balance)}</TableCell>
                                  {showPercentages && (
                                    <TableCell isValue>
                                      {balance !== 0 ? formatPercentage(balance, baseValue) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell isValue>{formatNumber(beginningBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {beginningBankBalance !== 0
                                  ? formatPercentage(beginningBankBalance, Math.abs(beginningBankBalance))
                                  : "—"}
                              </TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(beginningBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {beginningBankBalance !== 0
                                  ? formatPercentage(beginningBankBalance, Math.abs(beginningBankBalance))
                                  : "—"}
                              </TableCell>
                            )}
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
                      <TableRow className="cursor-pointer">
                        <TableCell
                          isLineItem
                          onClick={() =>
                            setViewerModal({
                              isOpen: true,
                              category: { id: "REVENUE_GROUP", name: "Revenue", type: "Revenue" },
                            })
                          }
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
                      <TableRow>
                        <TableCell isLineItem>Net Income</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
                                  {formatNumber(
                                    revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonth(a, month), 0) -
                                      cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonth(a, month), 0) -
                                      expenseRows.reduce((sum, a) => sum + calculateAccountTotalForMonth(a, month), 0)
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {formatPercentage(
                                      revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonth(a, month), 0) -
                                        cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonth(a, month), 0) -
                                        expenseRows.reduce(
                                          (sum, a) => sum + calculateAccountTotalForMonth(a, month),
                                          0
                                        ),
                                      netIncome
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(netIncome)}</TableCell>
                            {showPercentages && <TableCell isValue>{formatPercentage(netIncome, netIncome)}</TableCell>}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    revenueRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForQuarter(a, quarter),
                                      0
                                    ) -
                                      cogsRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarter(a, quarter),
                                        0
                                      ) -
                                      expenseRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarter(a, quarter),
                                        0
                                      )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {formatPercentage(
                                      revenueRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarter(a, quarter),
                                        0
                                      ) -
                                        cogsRows.reduce(
                                          (sum, a) => sum + calculateAccountTotalForQuarter(a, quarter),
                                          0
                                        ) -
                                        expenseRows.reduce(
                                          (sum, a) => sum + calculateAccountTotalForQuarter(a, quarter),
                                          0
                                        ),
                                      netIncome
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(netIncome)}</TableCell>
                            {showPercentages && <TableCell isValue>{formatPercentage(netIncome, netIncome)}</TableCell>}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(netIncome)}</TableCell>
                            {showPercentages && <TableCell isValue>{formatPercentage(netIncome, netIncome)}</TableCell>}
                          </>
                        )}
                      </TableRow>
                      {/* Operating Change - equal to Net Income as per business requirements */}
                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Operating Change</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome,
                          undefined,
                          "Operating",
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

                      {/* Increase in Assets */}
                      <TableRow>
                        <TableCell isLineItem>Increase in Assets</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateInvestingActivitiesForPeriod(periodStart, periodEnd).increaseInAssets,
                          undefined,
                          "Asset",
                          "Increase in Assets"
                        )}
                      </TableRow>

                      {/* Decrease in Assets */}
                      <TableRow>
                        <TableCell isLineItem>Decrease in Assets</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateInvestingActivitiesForPeriod(periodStart, periodEnd).decreaseInAssets,
                          undefined,
                          "Asset",
                          "Decrease in Assets"
                        )}
                      </TableRow>

                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Investing Change</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateInvestingActivitiesForPeriod(periodStart, periodEnd).netInvestingChange
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

                      {/* Increase in Liabilities */}
                      <TableRow>
                        <TableCell isLineItem>Increase in Liabilities</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).increaseInLiabilities,
                          undefined,
                          "Liability",
                          "Increase in Liabilities"
                        )}
                      </TableRow>

                      {/* Decrease in Liabilities */}
                      <TableRow>
                        <TableCell isLineItem>Decrease in Liabilities</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateFinancingActivitiesForPeriod(periodStart, periodEnd).decreaseInLiabilities,
                          undefined,
                          "Liability",
                          "Decrease in Liabilities"
                        )}
                      </TableRow>

                      {/* Owner Investment */}
                      <TableRow>
                        <TableCell isLineItem>Owner Investment</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).ownerInvestment,
                          undefined,
                          "Equity",
                          "Owner Investment"
                        )}
                      </TableRow>

                      {/* Owner Withdrawal */}
                      <TableRow>
                        <TableCell isLineItem>Owner Withdrawal</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            -calculateFinancingActivitiesForPeriod(periodStart, periodEnd).ownerWithdrawal,
                          undefined,
                          "Equity",
                          "Owner Withdrawal"
                        )}
                      </TableRow>
                      {/* Financing Change */}
                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Financing Change</TableCell>
                        {renderPeriodCells(
                          (periodStart, periodEnd) =>
                            calculateFinancingActivitiesForPeriod(periodStart, periodEnd).netFinancingChange,
                          undefined,
                          "Financing",
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
                                  {showPercentages && (
                                    <TableCell isValue>
                                      {balance !== 0 ? formatPercentage(balance, Math.abs(balance)) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell isValue>{formatNumber(endingBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {endingBankBalance !== 0
                                  ? formatPercentage(endingBankBalance, Math.abs(endingBankBalance))
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

                              return (
                                <React.Fragment key={quarter}>
                                  <TableCell isValue>{formatNumber(balance)}</TableCell>
                                  {showPercentages && (
                                    <TableCell isValue>
                                      {balance !== 0 ? formatPercentage(balance, Math.abs(balance)) : "—"}
                                    </TableCell>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <TableCell isValue>{formatNumber(endingBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {endingBankBalance !== 0
                                  ? formatPercentage(endingBankBalance, Math.abs(endingBankBalance))
                                  : "—"}
                              </TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(endingBankBalance)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {endingBankBalance !== 0
                                  ? formatPercentage(endingBankBalance, Math.abs(endingBankBalance))
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
