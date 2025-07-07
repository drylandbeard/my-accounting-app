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

  const searchParams = useSearchParams();
  const reportId = searchParams.get("reportId");

  // Load saved report if reportId is provided
  useEffect(() => {
    const loadSavedReport = async () => {
      if (!reportId || !currentCompany?.id) return;

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
  const renderPeriodCells = (getValue: (periodStart: string, periodEnd: string) => number) => {
    if (isMonthlyView) {
      const months = getMonthsInRange(startDate, endDate);
      return (
        <>
          {months.map((month) => {
            const monthStart = `${month}-01`;
            const lastDay = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).getDate();
            const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
            const value = getValue(monthStart, monthEnd);
            return (
              <TableCell key={month} className="text-right py-2">
                {formatNumber(value)}
              </TableCell>
            );
          })}
          <TableCell className="text-right py-2">{formatNumber(getValue(startDate, endDate))}</TableCell>
        </>
      );
    } else if (isQuarterlyView) {
      const quarters = getQuartersInRange(startDate, endDate);
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
              <TableCell key={quarter} className="text-right py-2">
                {formatNumber(value)}
              </TableCell>
            );
          })}
          <TableCell className="text-right py-2">{formatNumber(getValue(startDate, endDate))}</TableCell>
        </>
      );
    } else {
      return <TableCell className="text-right py-2">{formatNumber(getValue(startDate, endDate))}</TableCell>;
    }
  };

  // Helper function to get transactions for a specific line item
  const getTransactionsForCategory = (categoryType: string) => {
    switch (categoryType) {
      case "revenue":
        return journalEntries.filter((tx) => {
          const account = accounts.find((a) => a.id === tx.chart_account_id);
          return account?.type === "Revenue";
        });
      case "cogs":
        return journalEntries.filter((tx) => {
          const account = accounts.find((a) => a.id === tx.chart_account_id);
          return account?.type === "COGS";
        });
      case "expenses":
        return journalEntries.filter((tx) => {
          const account = accounts.find((a) => a.id === tx.chart_account_id);
          return account?.type === "Expense";
        });
      case "assets":
        return journalEntries.filter((tx) => {
          const account = accounts.find((a) => a.id === tx.chart_account_id);
          return account?.type === "Asset" && !bankAccounts.some((ba) => ba.id === account.id);
        });
      case "liabilities":
        return journalEntries.filter((tx) => {
          const account = accounts.find((a) => a.id === tx.chart_account_id);
          return account?.type === "Liability" || account?.type === "Credit Card";
        });
      case "equity":
        return journalEntries.filter((tx) => {
          const account = accounts.find((a) => a.id === tx.chart_account_id);
          return account?.type === "Equity";
        });
      default:
        return [];
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
      <div className="p-6 bg-white min-h-screen">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Cash Flow Statement</h1>
          <p className="text-gray-600">Please select a company to view cash flow data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto">
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

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left font-bold text-slate-700">Cash Flow Activities</TableHead>
                  {isMonthlyView ? (
                    <>
                      {getMonthsInRange(startDate, endDate).map((month) => (
                        <TableHead key={month} className="text-right font-bold text-slate-700">
                          {formatMonth(month)}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-bold text-slate-700">Total</TableHead>
                    </>
                  ) : isQuarterlyView ? (
                    <>
                      {getQuartersInRange(startDate, endDate).map((quarter) => (
                        <TableHead key={quarter} className="text-right font-bold text-slate-700">
                          {formatQuarter(quarter)}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-bold text-slate-700">Total</TableHead>
                    </>
                  ) : (
                    <TableHead className="text-right font-bold text-slate-700">Amount</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Beginning Bank Balance */}
                <TableRow>
                  <TableCell className="font-semibold text-slate-800 py-3">Beginning Bank Balance</TableCell>
                  {isMonthlyView ? (
                    <>
                      {getMonthsInRange(startDate, endDate).map((month, index) => {
                        const monthStart = `${month}-01`;
                        const prevMonthEnd =
                          index === 0
                            ? new Date(new Date(monthStart).getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0]
                            : new Date(new Date(monthStart).getTime() - 24 * 60 * 60 * 1000)
                                .toISOString()
                                .split("T")[0];
                        const balance =
                          index === 0 ? beginningBankBalance : calculateBankBalanceForPeriod(prevMonthEnd);
                        return (
                          <TableCell key={month} className="text-right py-3">
                            {formatNumber(balance)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right py-3">{formatNumber(beginningBankBalance)}</TableCell>
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
                          <TableCell key={quarter} className="text-right py-3">
                            {formatNumber(balance)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right py-3">{formatNumber(beginningBankBalance)}</TableCell>
                    </>
                  ) : (
                    <TableCell className="text-right py-3">{formatNumber(beginningBankBalance)}</TableCell>
                  )}
                </TableRow>

                {/* Operating Activities */}
                <TableRow className="border-b-2 border-slate-200">
                  <TableCell className="font-semibold text-slate-800 py-3">Operating:</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleRowClick("revenue", "Revenue")}
                >
                  <TableCell className="pl-6 py-2">Revenue</TableCell>
                  {renderPeriodCells(
                    (periodStart, periodEnd) => calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue
                  )}
                </TableRow>
                <TableRow className="hover:bg-slate-50 cursor-pointer" onClick={() => handleRowClick("cogs", "COGS")}>
                  <TableCell className="pl-6 py-2">COGS</TableCell>
                  {renderPeriodCells(
                    (periodStart, periodEnd) => -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).cogs
                  )}
                </TableRow>
                <TableRow
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleRowClick("expenses", "Expenses")}
                >
                  <TableCell className="pl-6 py-2">Expenses</TableCell>
                  {renderPeriodCells(
                    (periodStart, periodEnd) => -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).expenses
                  )}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium pl-4 py-3">Net Income</TableCell>
                  {renderPeriodCells(
                    (periodStart, periodEnd) => calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome
                  )}
                </TableRow>
                <TableRow className="border-b border-slate-200">
                  <TableCell className="font-medium pl-4 py-3">Operating Change:</TableCell>
                  {renderPeriodCells(
                    (periodStart, periodEnd) => calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome
                  )}
                </TableRow>

                {/* Investing Activities */}
                <TableRow className="border-b-2 border-slate-200">
                  <TableCell className="font-semibold text-slate-800 py-3">Investing:</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleRowClick("assets", "Increase in Assets (non bank accounts)")}
                >
                  <TableCell className="pl-6 py-2">Increase in Assets (non bank accounts)</TableCell>
                  <TableCell className="text-right py-2">
                    {formatNumber(investingActivities.increaseInAssets)}
                  </TableCell>
                </TableRow>
                <TableRow
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleRowClick("assets", "Decrease in Assets (non bank accounts)")}
                >
                  <TableCell className="pl-6 py-2">Decrease in Assets (non bank accounts)</TableCell>
                  <TableCell className="text-right py-2">
                    {formatNumber(investingActivities.decreaseInAssets)}
                  </TableCell>
                </TableRow>
                <TableRow className="border-b border-slate-200">
                  <TableCell className="font-medium pl-4 py-3">Investing Change:</TableCell>
                  <TableCell className="text-right font-medium py-3">
                    {formatNumber(investingActivities.netInvestingChange)}
                  </TableCell>
                </TableRow>

                {/* Financing Activities */}
                <TableRow className="border-b-2 border-slate-200">
                  <TableCell className="font-semibold text-slate-800 py-3">Financing:</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleRowClick("liabilities", "Increase / decrease in Credit Cards")}
                >
                  <TableCell className="pl-6 py-2">Increase / decrease in Credit Cards</TableCell>
                  <TableCell className="text-right py-2">
                    {formatNumber(financingActivities.increaseInLiabilities)}
                  </TableCell>
                </TableRow>
                <TableRow
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleRowClick("liabilities", "Increases in Liabilities (e.g. new loans)")}
                >
                  <TableCell className="pl-6 py-2">Increases in Liabilities (e.g. new loans)</TableCell>
                  <TableCell className="text-right py-2">
                    {formatNumber(financingActivities.increaseInLiabilities)}
                  </TableCell>
                </TableRow>
                <TableRow
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleRowClick("liabilities", "Decreases in Liabilities (e.g. loan repayments)")}
                >
                  <TableCell className="pl-6 py-2">Decreases in Liabilities (e.g. loan repayments)</TableCell>
                  <TableCell className="text-right py-2">{formatNumber(0)}</TableCell>
                </TableRow>
                <TableRow
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleRowClick("equity", "Owner contributions (Equity increases)")}
                >
                  <TableCell className="pl-6 py-2">Owner contributions (Equity increases)</TableCell>
                  <TableCell className="text-right py-2">
                    {formatNumber(financingActivities.ownerContributions)}
                  </TableCell>
                </TableRow>
                <TableRow
                  className="hover:bg-slate-50 cursor-pointer"
                  onClick={() => handleRowClick("equity", "Owner distributions (Equity decreases)")}
                >
                  <TableCell className="pl-6 py-2">Owner distributions (Equity decreases)</TableCell>
                  <TableCell className="text-right py-2">
                    {formatNumber(financingActivities.ownerDistributions)}
                  </TableCell>
                </TableRow>
                <TableRow className="border-b border-slate-200">
                  <TableCell className="font-medium pl-4 py-3">Financing Change:</TableCell>
                  <TableCell className="text-right font-medium py-3">
                    {formatNumber(financingActivities.netFinancingChange)}
                  </TableCell>
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
                        return (
                          <TableCell key={month} className="text-right font-bold text-slate-900 py-4">
                            {formatNumber(balance)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-bold text-slate-900 py-4">
                        {formatNumber(endingBankBalance)}
                      </TableCell>
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
                          <TableCell key={quarter} className="text-right font-bold text-slate-900 py-4">
                            {formatNumber(balance)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right font-bold text-slate-900 py-4">
                        {formatNumber(endingBankBalance)}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell className="text-right font-bold text-slate-900 py-4">
                      {formatNumber(endingBankBalance)}
                    </TableCell>
                  )}
                </TableRow>
              </TableBody>
            </Table>
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
          selectedCategoryTransactions={viewerModal.category ? getTransactionsForCategory(viewerModal.category.id) : []}
          startDate={startDate}
          endDate={endDate}
          companyName={currentCompany.name}
          getCategoryName={getCategoryName}
        />
      </div>
    </div>
  );
}
