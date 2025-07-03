"use client";

import React, { useState, useMemo } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Shared imports
import { Account, Transaction, ViewerModalState } from "../_types";
import {
  formatDateForDisplay,
  formatNumber,
  formatPercentage,
  getMonthsInRange,
  formatMonth,
  getAllAccountIds,
  getAllGroupAccountIds,
} from "../_utils";
import { useFinancialData } from "../_hooks/useFinancialData";
import { usePeriodSelection } from "../_hooks/usePeriodSelection";
import { useAccountOperations } from "../_hooks/useAccountOperations";
import { ReportHeader } from "../_components/ReportHeader";
import { TransactionViewer } from "../_components/TransactionViewer";
import { AccountRowRenderer } from "../_components/AccountRowRenderer";
import { useExportProfitLoss } from "../_hooks/useExportProfitLoss";

export default function PnLPage() {
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
    setStartDate,
    setEndDate,
    handlePeriodChange,
    handlePrimaryDisplayChange,
    handleSecondaryDisplayChange,
  } = usePeriodSelection();

  const { accounts, journalEntries, loading } = useFinancialData({
    companyId: currentCompany?.id || null,
    startDate: startDate,
    endDate: endDate,
    accountTypes: ["Revenue", "COGS", "Expense"],
  });

  const {
    collapsedAccounts,
    toggleAccount,
    getTopLevelAccounts,
    calculateAccountDirectTotal,
    calculateAccountTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts,
    collapseAllParentCategories,
    hasCollapsedCategories,
  } = useAccountOperations({ accounts, journalEntries });
  const [viewerModal, setViewerModal] = useState<ViewerModalState>({
    isOpen: false,
    category: null,
  });

  // Account groups
  const revenueRows = getTopLevelAccounts("Revenue");
  const cogsRows = getTopLevelAccounts("COGS");
  const expenseRows = getTopLevelAccounts("Expense");

  // Totals
  const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const totalCOGS = cogsRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const totalExpenses = expenseRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netIncome = grossProfit - totalExpenses;

  // Calculate total columns for proper column spanning
  const getTotalColumns = (): number => {
    if (isMonthlyView) {
      const monthCount = getMonthsInRange(startDate, endDate).length;
      // Account column + month columns + (percentage columns if enabled) + Total column + (Total percentage if enabled)
      return 1 + monthCount + (showPercentages ? monthCount : 0) + 1 + (showPercentages ? 1 : 0);
    } else {
      // Account column + Total column + (Percentage column if enabled)
      return showPercentages ? 3 : 2;
    }
  };

  // Helper functions
  const getCategoryName = (tx: Transaction) => {
    return accounts.find((a) => a.id === tx.chart_account_id)?.name || "";
  };

  const formatPercentageForAccount = (num: number, account?: Account): string => {
    if (!account) return formatPercentage(num, totalRevenue);

    const base =
      totalRevenue !== 0
        ? totalRevenue
        : account.type === "Expense"
        ? totalExpenses
        : account.type === "COGS"
        ? totalCOGS
        : totalRevenue;
    return formatPercentage(num, base);
  };

  const calculatePercentageForMonth = (amount: number, month: string): string => {
    const monthRevenue = revenueRows.reduce(
      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
      0
    );
    return formatPercentage(amount, monthRevenue);
  };

  // Export hook
  const { exportToXLSX } = useExportProfitLoss({
    accounts,
    journalEntries,
    revenueRows,
    cogsRows,
    expenseRows,
    currentCompany,
    isMonthlyView,
    showPercentages,
    startDate,
    endDate,
    collapsedAccounts,
    calculateAccountTotal,
    calculateAccountDirectTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts,
    formatPercentageForAccount,
    calculatePercentageForMonth,
  });

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
        showPercentages={showPercentages}
        startDate={startDate}
        endDate={endDate}
        collapsedAccounts={collapsedAccounts}
        toggleAccount={toggleAccount}
        calculateAccountTotal={calculateAccountTotal}
        calculateAccountDirectTotal={calculateAccountDirectTotal}
        calculateAccountTotalForMonth={calculateAccountTotalForMonth}
        calculateAccountTotalForMonthWithSubaccounts={calculateAccountTotalForMonthWithSubaccounts}
        setViewerModal={setViewerModal}
        formatPercentageForAccount={formatPercentageForAccount}
      />
    );
  };

  // Transaction filtering for viewer
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

  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-xs font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-xs text-yellow-700">
            Please select a company from the dropdown in the navigation bar to view profit & loss reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <ReportHeader
          title="Profit & Loss"
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
          hasCollapsedCategories={hasCollapsedCategories}
          exportToXLSX={exportToXLSX}
          loading={loading}
        />

        <Card className="pt-3 pb-0">
          <CardContent className="p-0">
            <h1 className="text-xl font-bold text-slate-800 mb-1 text-center">{currentCompany.name}</h1>
            <p className="text-lg text-slate-700 mb-1 text-center font-medium">Profit & Loss</p>
            <p className="text-sm text-slate-600 mb-3 text-center">
              {formatDateForDisplay(startDate)} to {formatDateForDisplay(endDate)}
            </p>

            <Table className="border border-gray-300">
              <TableHeader className="bg-gray-100">
                <TableRow>
                  <TableHead
                    className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                    style={{
                      width:
                        isMonthlyView && showPercentages
                          ? "25%"
                          : isMonthlyView
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
                            className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                            style={{ width: showPercentages ? "7%" : "10%" }}
                          >
                            {formatMonth(month)}
                          </TableHead>
                          {showPercentages && (
                            <TableHead className="border p-1 text-center font-medium text-xs whitespace-nowrap">
                              %
                            </TableHead>
                          )}
                        </React.Fragment>
                      ))}
                      <TableHead
                        className="border p-1 text-center font-medium text-xs"
                        style={{ width: showPercentages ? "7%" : "10%" }}
                      >
                        Total
                      </TableHead>
                      {showPercentages && (
                        <TableHead className="border p-1 text-center font-medium text-xs">%</TableHead>
                      )}
                    </>
                  ) : (
                    <>
                      <TableHead className="border p-1 text-center font-medium text-xs">Total</TableHead>
                      {showPercentages && (
                        <TableHead className="border p-1 text-center font-medium text-xs">%</TableHead>
                      )}
                    </>
                  )}
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
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
                    {/* Revenue Section */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={getTotalColumns()} className="border p-1 font-semibold text-xs">
                        Revenue
                      </TableCell>
                    </TableRow>
                    {revenueRows.map((row) => renderAccountRow(row))}

                    {/* Total Revenue */}
                    <TableRow
                      className="cursor-pointer hover:bg-blue-50"
                      onClick={() =>
                        setViewerModal({
                          isOpen: true,
                          category: { id: "REVENUE_GROUP", name: "Total Revenue", type: "Revenue", parent_id: null },
                        })
                      }
                    >
                      <TableCell className="border p-1 text-xs font-semibold">Total Revenue</TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange(startDate, endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  revenueRows.reduce(
                                    (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  )
                                )}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    revenueRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ),
                                    month
                                  )}
                                </TableCell>
                              )}
                            </React.Fragment>
                          ))}
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(totalRevenue)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {totalRevenue !== 0 ? "100.0%" : "—"}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(totalRevenue)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs text-slate-600">
                              {totalRevenue !== 0 ? "100.0%" : "—"}
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* COGS Section */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={getTotalColumns()} className="border p-1 font-semibold text-xs">
                        Cost of Goods Sold (COGS)
                      </TableCell>
                    </TableRow>
                    {cogsRows.map((row) => renderAccountRow(row))}

                    {/* Total COGS */}
                    <TableRow
                      className="cursor-pointer hover:bg-blue-50"
                      onClick={() =>
                        setViewerModal({
                          isOpen: true,
                          category: { id: "COGS_GROUP", name: "Total COGS", type: "COGS", parent_id: null },
                        })
                      }
                    >
                      <TableCell className="border p-1 text-xs font-semibold">Total COGS</TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange(startDate, endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  cogsRows.reduce(
                                    (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  )
                                )}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    cogsRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ),
                                    month
                                  )}
                                </TableCell>
                              )}
                            </React.Fragment>
                          ))}
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(totalCOGS)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {totalRevenue !== 0
                                ? formatPercentage(totalCOGS, totalRevenue)
                                : totalCOGS !== 0
                                ? "100.0%"
                                : "—"}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(totalCOGS)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {totalRevenue !== 0
                                ? formatPercentage(totalCOGS, totalRevenue)
                                : totalCOGS !== 0
                                ? "100.0%"
                                : "—"}
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* Gross Profit */}
                    <TableRow className="font-semibold">
                      <TableCell className="border p-1 text-xs font-semibold">Gross Profit</TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange(startDate, endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  revenueRows.reduce(
                                    (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  ) -
                                    cogsRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    )
                                )}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    revenueRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) -
                                      cogsRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      ),
                                    month
                                  )}
                                </TableCell>
                              )}
                            </React.Fragment>
                          ))}
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(grossProfit)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(grossProfit, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right text-xs">{formatNumber(grossProfit)}</TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(grossProfit, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* Expenses Section */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={getTotalColumns()} className="border p-1 font-semibold text-xs">
                        Expenses
                      </TableCell>
                    </TableRow>
                    {expenseRows.map((row) => renderAccountRow(row))}

                    {/* Total Expenses */}
                    <TableRow
                      className="cursor-pointer hover:bg-blue-50 bg-muted/50 font-bold"
                      onClick={() =>
                        setViewerModal({
                          isOpen: true,
                          category: { id: "EXPENSE_GROUP", name: "Total Expenses", type: "Expense", parent_id: null },
                        })
                      }
                    >
                      <TableCell className="border p-1 text-xs font-semibold">Total Expenses</TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange(startDate, endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  expenseRows.reduce(
                                    (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  )
                                )}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    expenseRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ),
                                    month
                                  )}
                                </TableCell>
                              )}
                            </React.Fragment>
                          ))}
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(totalExpenses)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {totalRevenue !== 0
                                ? formatPercentage(totalExpenses, totalRevenue)
                                : totalExpenses !== 0
                                ? "100.0%"
                                : "—"}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(totalExpenses)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {totalRevenue !== 0
                                ? formatPercentage(totalExpenses, totalRevenue)
                                : totalExpenses !== 0
                                ? "100.0%"
                                : "—"}
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* Net Income */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="border p-1 text-xs font-semibold">Net Income</TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange(startDate, endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  revenueRows.reduce(
                                    (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  ) -
                                    cogsRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) -
                                    expenseRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    )
                                )}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    revenueRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) -
                                      cogsRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      ) -
                                      expenseRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      ),
                                    month
                                  )}
                                </TableCell>
                              )}
                            </React.Fragment>
                          ))}
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(netIncome)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(netIncome, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right text-xs">{formatNumber(netIncome)}</TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(netIncome, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

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
        />
      )}
    </div>
  );
}
