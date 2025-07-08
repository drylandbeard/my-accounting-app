"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  getAllGroupAccountIds,
} from "../_utils";
import { useFinancialData } from "../_hooks/useFinancialData";
import { usePeriodSelection } from "../_hooks/usePeriodSelection";
import { useAccountOperations } from "../_hooks/useAccountOperations";
import { useExportBalanceSheet } from "../_hooks/useExportBalanceSheet";
import { ReportHeader } from "../_components/ReportHeader";
import { TransactionViewer } from "../_components/TransactionViewer";
import { AccountRowRenderer } from "../_components/AccountRowRenderer";
import { SaveReportModal } from "../_components/SaveReportModal";
import { api } from "@/lib/api";

export default function BalanceSheetPage() {
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
    handlePeriodChange,
    handlePrimaryDisplayChange,
    handleSecondaryDisplayChange,
  } = usePeriodSelection();

  // For balance sheet, we use endDate as the "as of" date, but also manage it separately
  const [asOfDate, setAsOfDate] = useState<string>(endDate);

  // Sync asOfDate with endDate when period selection changes
  React.useEffect(() => {
    setAsOfDate(endDate);
  }, [endDate]);

  // For balance sheet, we need all journal entries up to the as-of date
  const { accounts, journalEntries, loading } = useFinancialData({
    companyId: currentCompany?.id || null,
    startDate: "1900-01-01", // Get all historical data
    endDate: asOfDate,
    accountTypes: ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense"],
  });

  const {
    collapsedAccounts,
    toggleAccount,
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
            setAsOfDate(savedReport.parameters.endDate);
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
        description: `Balance Sheet as of ${formatDateForDisplay(asOfDate)}`,
        parameters: {
          startDate,
          endDate: asOfDate,
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
  const calculateBalanceSheetAccountTotal = (account: Account): number => {
    if (account.type === "Asset") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (account.type === "Liability" || account.type === "Equity") {
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      return totalCredits - totalDebits;
    }
    return 0;
  };

  // Balance sheet calculation for specific month (cumulative up to end of month)
  const calculateBalanceSheetAccountTotalForMonth = (account: Account, month: string): number => {
    const endOfMonth = new Date(month + "-31").toISOString().split("T")[0];
    const monthTransactions = journalEntries.filter(
      (tx) => tx.chart_account_id === account.id && tx.date <= endOfMonth
    );

    if (account.type === "Asset") {
      const totalDebits = monthTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = monthTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (account.type === "Liability" || account.type === "Equity") {
      const totalCredits = monthTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = monthTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      return totalCredits - totalDebits;
    }
    return 0;
  };

  // Balance sheet calculation for specific quarter (cumulative up to end of quarter)
  const calculateBalanceSheetAccountTotalForQuarter = (account: Account, quarter: string): number => {
    const [year, q] = quarter.split("-Q");
    const endMonth = parseInt(q) * 3;
    const endOfQuarter = new Date(parseInt(year), endMonth - 1, 31).toISOString().split("T")[0];
    const quarterTransactions = journalEntries.filter(
      (tx) => tx.chart_account_id === account.id && tx.date <= endOfQuarter
    );

    if (account.type === "Asset") {
      const totalDebits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (account.type === "Liability" || account.type === "Equity") {
      const totalCredits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      return totalCredits - totalDebits;
    }
    return 0;
  };

  // Recursive function to calculate account total including subaccounts for balance sheet
  const calculateBalanceSheetAccountTotalWithSubaccounts = (account: Account): number => {
    let total = calculateBalanceSheetAccountTotal(account);
    const subaccounts = accounts.filter((acc) => acc.parent_id === account.id);
    for (const sub of subaccounts) {
      total += calculateBalanceSheetAccountTotalWithSubaccounts(sub);
    }
    return total;
  };

  // Recursive function for month with subaccounts
  const calculateBalanceSheetAccountTotalForMonthWithSubaccounts = (account: Account, month: string): number => {
    let total = calculateBalanceSheetAccountTotalForMonth(account, month);
    const subaccounts = accounts.filter((acc) => acc.parent_id === account.id);
    for (const sub of subaccounts) {
      total += calculateBalanceSheetAccountTotalForMonthWithSubaccounts(sub, month);
    }
    return total;
  };

  // Recursive function for quarter with subaccounts
  const calculateBalanceSheetAccountTotalForQuarterWithSubaccounts = (account: Account, quarter: string): number => {
    let total = calculateBalanceSheetAccountTotalForQuarter(account, quarter);
    const subaccounts = accounts.filter((acc) => acc.parent_id === account.id);
    for (const sub of subaccounts) {
      total += calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(sub, quarter);
    }
    return total;
  };

  // Account groups for balance sheet
  const assetAccounts = getTopLevelAccounts("Asset");
  const liabilityAccounts = getTopLevelAccounts("Liability");
  const equityAccounts = getTopLevelAccounts("Equity");

  // P&L accounts for retained earnings calculation
  const revenueAccounts = getTopLevelAccounts("Revenue");
  const cogsAccounts = getTopLevelAccounts("COGS");
  const expenseAccounts = getTopLevelAccounts("Expense");

  // Calculate P&L totals for retained earnings
  const totalRevenue = revenueAccounts.reduce((sum, a) => {
    return (
      sum +
      journalEntries
        .filter((tx) => getAllAccountIds(accounts, a).includes(tx.chart_account_id))
        .reduce((txSum, tx) => txSum + Number(tx.credit) - Number(tx.debit), 0)
    );
  }, 0);

  const totalCOGS = cogsAccounts.reduce((sum, a) => {
    const totalDebits = journalEntries
      .filter((tx) => getAllAccountIds(accounts, a).includes(tx.chart_account_id))
      .reduce((txSum, tx) => txSum + Number(tx.debit), 0);
    const totalCredits = journalEntries
      .filter((tx) => getAllAccountIds(accounts, a).includes(tx.chart_account_id))
      .reduce((txSum, tx) => txSum + Number(tx.credit), 0);
    return sum + (totalDebits - totalCredits);
  }, 0);

  const totalExpenses = expenseAccounts.reduce((sum, a) => {
    const totalDebits = journalEntries
      .filter((tx) => getAllAccountIds(accounts, a).includes(tx.chart_account_id))
      .reduce((txSum, tx) => txSum + Number(tx.debit), 0);
    const totalCredits = journalEntries
      .filter((tx) => getAllAccountIds(accounts, a).includes(tx.chart_account_id))
      .reduce((txSum, tx) => txSum + Number(tx.credit), 0);
    return sum + (totalDebits - totalCredits);
  }, 0);

  const retainedEarnings = totalRevenue - totalCOGS - totalExpenses;

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
    }, 0) + retainedEarnings;

  // Helper functions
  const getCategoryName = (tx: Transaction) => {
    return accounts.find((a) => a.id === tx.chart_account_id)?.name || "";
  };

  // Calculate total columns for proper column spanning
  const getTotalColumns = (): number => {
    if (isMonthlyView) {
      const monthCount = getMonthsInRange(startDate, asOfDate).length;
      // Account column + month columns + (percentage columns if enabled) + Total column + (Total percentage if enabled)
      return 1 + monthCount + (showPercentages ? monthCount : 0) + 1 + (showPercentages ? 1 : 0);
    } else if (isQuarterlyView) {
      const quarterCount = getQuartersInRange(startDate, asOfDate).length;
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

  // Transaction filtering for viewer
  const selectedCategoryTransactions = useMemo(() => {
    if (!viewerModal.category) return [];

    const category = viewerModal.category;
    const transactions =
      category.id === "ASSETS_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(accounts, assetAccounts).includes(tx.chart_account_id))
        : category.id === "LIABILITIES_GROUP"
        ? journalEntries.filter((tx) =>
            getAllGroupAccountIds(accounts, liabilityAccounts).includes(tx.chart_account_id)
          )
        : category.id === "EQUITY_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(accounts, equityAccounts).includes(tx.chart_account_id))
        : category.id === "RETAINED_EARNINGS"
        ? journalEntries.filter((tx) =>
            getAllGroupAccountIds(accounts, [...revenueAccounts, ...cogsAccounts, ...expenseAccounts]).includes(
              tx.chart_account_id
            )
          )
        : journalEntries.filter((tx) => getAllAccountIds(accounts, category).includes(tx.chart_account_id));

    return transactions;
  }, [
    viewerModal,
    journalEntries,
    accounts,
    assetAccounts,
    liabilityAccounts,
    equityAccounts,
    revenueAccounts,
    cogsAccounts,
    expenseAccounts,
  ]);

  // Export hook
  const { exportToXLSX } = useExportBalanceSheet({
    accounts,
    journalEntries,
    assetAccounts,
    liabilityAccounts,
    equityAccounts,
    currentCompany,
    isMonthlyView,
    isQuarterlyView,
    showPercentages,
    startDate,
    asOfDate,
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
    retainedEarnings,
    formatPercentageForAccount,
    calculatePercentageForMonth,
    calculatePercentageForQuarter,
  });

  // Render account row helper for balance sheet
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
        endDate={asOfDate}
        collapsedAccounts={collapsedAccounts}
        toggleAccount={toggleAccount}
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
          getMonthsInRange(startDate, asOfDate).length > 6 ? "max-w-full" : "max-w-7xl"
        } animate-in fade-in`}
      >
        <ReportHeader
          startDate={startDate}
          endDate={asOfDate}
          setStartDate={setStartDate}
          setEndDate={setAsOfDate} // Update the as of date when changed
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
          isBalanceSheet={true}
        />

        <Card className="pt-3 pb-0">
          <CardContent className="p-0">
            <h1 className="text-xl font-bold text-slate-800 mb-1 text-center">{currentCompany.name}</h1>
            <p className="text-lg text-slate-700 mb-1 text-center font-medium">Balance Sheet</p>
            <p className="text-sm text-slate-600 mb-3 text-center">
              {isMonthlyView || isQuarterlyView
                ? `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(asOfDate)}`
                : `As of ${formatDateForDisplay(asOfDate)}`}
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
                        {getMonthsInRange(startDate, asOfDate).map((month) => (
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
                        {getQuartersInRange(startDate, asOfDate).map((quarter) => (
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
                  {loading || loadingSavedReport ? (
                    <TableRow>
                      <TableCell colSpan={getTotalColumns()} className="border p-4 text-center">
                        <div className="flex flex-col items-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                          <span className="text-xs">Loading financial data...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {/* Assets Section */}
                      <TableRow isSummaryLineItem>
                        <TableCell colSpan={getTotalColumns()} isLineItem>
                          ASSETS
                        </TableCell>
                      </TableRow>
                      {assetAccounts.map((account) => renderAccountRow(account))}

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
                        <TableCell isLineItem>TOTAL ASSETS</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, asOfDate).map((month) => (
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
                                {showPercentages && <TableCell isValue>100.0%</TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalAssets)}</TableCell>
                            {showPercentages && <TableCell isValue>100.0%</TableCell>}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, asOfDate).map((quarter) => (
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
                                {showPercentages && <TableCell isValue>100.0%</TableCell>}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalAssets)}</TableCell>
                            {showPercentages && <TableCell isValue>100.0%</TableCell>}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(totalAssets)}</TableCell>
                            {showPercentages && <TableCell isValue>100.0%</TableCell>}
                          </>
                        )}
                      </TableRow>

                      {/* Liabilities Section */}
                      <TableRow isSummaryLineItem>
                        <TableCell colSpan={getTotalColumns()} isLineItem>
                          LIABILITIES
                        </TableCell>
                      </TableRow>
                      {liabilityAccounts.map((account) => renderAccountRow(account))}

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
                        <TableCell isLineItem>TOTAL LIABILITIES</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, asOfDate).map((month) => (
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
                            {getQuartersInRange(startDate, asOfDate).map((quarter) => (
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
                          EQUITY
                        </TableCell>
                      </TableRow>
                      {equityAccounts.map((account) => renderAccountRow(account))}

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
                            {getMonthsInRange(startDate, asOfDate).map((month) => (
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
                            {getQuartersInRange(startDate, asOfDate).map((quarter) => (
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
                        <TableCell isLineItem>TOTAL EQUITY</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, asOfDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
                                  {formatNumber(
                                    equityAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) + retainedEarnings
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForMonth(
                                      equityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      ) + retainedEarnings,
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
                            {getQuartersInRange(startDate, asOfDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    equityAccounts.reduce(
                                      (sum, a) =>
                                        sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    ) + retainedEarnings
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(
                                      equityAccounts.reduce(
                                        (sum, a) =>
                                          sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ) + retainedEarnings,
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
                        <TableCell isLineItem>TOTAL LIABILITIES & EQUITY</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, asOfDate).map((month) => (
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
                                      retainedEarnings
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
                                        retainedEarnings,
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
                            {getQuartersInRange(startDate, asOfDate).map((quarter) => (
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
                                      retainedEarnings
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
                                        retainedEarnings,
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
          startDate="1900-01-01"
          endDate={asOfDate}
          companyName={currentCompany.name}
          getCategoryName={getCategoryName}
        />
      )}
    </div>
  );
}
