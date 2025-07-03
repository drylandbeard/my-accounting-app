"use client";

import React, { useState, useMemo } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ExcelJS from "exceljs";

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

export default function PnLPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;

  // Modular hooks
  const periodData = usePeriodSelection();
  const { accounts, journalEntries, loading } = useFinancialData({
    companyId: currentCompany?.id || null,
    startDate: periodData.startDate,
    endDate: periodData.endDate,
    accountTypes: ["Revenue", "COGS", "Expense"],
  });

  const accountOps = useAccountOperations({ accounts, journalEntries });
  const [viewerModal, setViewerModal] = useState<ViewerModalState>({
    isOpen: false,
    category: null,
  });

  // Account groups
  const revenueRows = accountOps.getTopLevelAccounts("Revenue");
  const cogsRows = accountOps.getTopLevelAccounts("COGS");
  const expenseRows = accountOps.getTopLevelAccounts("Expense");

  // Totals
  const totalRevenue = revenueRows.reduce((sum, a) => sum + accountOps.calculateAccountTotal(a), 0);
  const totalCOGS = cogsRows.reduce((sum, a) => sum + accountOps.calculateAccountTotal(a), 0);
  const totalExpenses = expenseRows.reduce((sum, a) => sum + accountOps.calculateAccountTotal(a), 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netIncome = grossProfit - totalExpenses;

  // Calculate total columns for proper column spanning
  const getTotalColumns = (): number => {
    if (periodData.isMonthlyView) {
      const monthCount = getMonthsInRange(periodData.startDate, periodData.endDate).length;
      // Account column + month columns + (percentage columns if enabled) + Total column + (Total percentage if enabled)
      return 1 + monthCount + (periodData.showPercentages ? monthCount : 0) + 1 + (periodData.showPercentages ? 1 : 0);
    } else {
      // Account column + Total column + (Percentage column if enabled)
      return periodData.showPercentages ? 3 : 2;
    }
  };

  // Helper functions
  const getCategoryName = (tx: Transaction) => {
    return accounts.find((a) => a.id === tx.chart_account_id)?.name || "";
  };

  const formatPercentageForAccount = (num: number, account: Account): string => {
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
      (sum, a) => sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
      0
    );
    return formatPercentage(amount, monthRevenue);
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

  // Excel export function
  const exportToXLSX = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Profit & Loss");

    const months = periodData.isMonthlyView ? getMonthsInRange(periodData.startDate, periodData.endDate) : [];
    const totalColumns = periodData.isMonthlyView
      ? 1 + months.length * (periodData.showPercentages ? 2 : 1) + (periodData.showPercentages ? 2 : 1)
      : periodData.showPercentages
      ? 3
      : 2;

    let currentRow = 1;

    // Title
    if (currentCompany) {
      worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = currentCompany.name;
      worksheet.getCell(`A${currentRow}`).style = {
        font: { size: 12, bold: true },
        alignment: { horizontal: "center" as const },
      };
      currentRow++;
    }

    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = "Profit & Loss";
    worksheet.getCell(`A${currentRow}`).style = {
      font: { size: 10 },
      alignment: { horizontal: "center" as const },
    };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `${formatDateForDisplay(
      periodData.startDate
    )} to ${formatDateForDisplay(periodData.endDate)}`;
    worksheet.getCell(`A${currentRow}`).style = {
      font: { size: 10 },
      alignment: { horizontal: "center" as const },
    };
    currentRow++;

    // Headers
    let colIndex = 1;
    worksheet.getCell(currentRow, colIndex++).value = "Account";

    if (periodData.isMonthlyView) {
      months.forEach((month) => {
        worksheet.getCell(currentRow, colIndex++).value = formatMonth(month);
        if (periodData.showPercentages) {
          worksheet.getCell(currentRow, colIndex++).value = "%";
        }
      });
      worksheet.getCell(currentRow, colIndex++).value = "Total";
      if (periodData.showPercentages) {
        worksheet.getCell(currentRow, colIndex++).value = "%";
      }
    } else {
      worksheet.getCell(currentRow, colIndex++).value = "Total";
      if (periodData.showPercentages) {
        worksheet.getCell(currentRow, colIndex++).value = "%";
      }
    }
    currentRow++;

    // Save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentCompany?.name}-Profit-Loss-${periodData.startDate}-to-${periodData.endDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Render account row helper
  const renderAccountRow = (account: Account, level = 0): React.ReactElement | null => {
    const subaccounts = accounts.filter(
      (acc) =>
        acc.parent_id === account.id &&
        journalEntries.some((tx) => getAllAccountIds(accounts, acc).includes(tx.chart_account_id))
    );
    const isParent = subaccounts.length > 0;
    const isCollapsed = accountOps.collapsedAccounts.has(account.id);
    const accountTotal = accountOps.calculateAccountTotal(account);
    const directTotal = accountOps.calculateAccountDirectTotal(account);

    if (Math.abs(isParent && isCollapsed ? accountTotal : directTotal) < 0.01 && !isParent) return null;

    return (
      <React.Fragment key={account.id}>
        <TableRow
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => setViewerModal({ isOpen: true, category: account })}
        >
          <TableCell className="border p-1 text-xs" style={{ paddingLeft: `${level * 20 + 8}px` }}>
            <div className="flex items-center">
              {level > 0 && <span className="text-gray-400 mr-2 text-xs">└</span>}
              {isParent && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    accountOps.toggleAccount(account.id);
                  }}
                  className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  {isCollapsed ? "▶" : "▼"}
                </button>
              )}
              <span className="font-semibold">{account.name}</span>
            </div>
          </TableCell>

          {periodData.isMonthlyView ? (
            <>
              {getMonthsInRange(periodData.startDate, periodData.endDate).map((month) => (
                <React.Fragment key={month}>
                  <TableCell
                    className="border p-1 text-right text-xs cursor-pointer hover:bg-gray-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerModal({ isOpen: true, category: account, selectedMonth: month });
                    }}
                  >
                    {formatNumber(
                      isParent && isCollapsed
                        ? accountOps.calculateAccountTotalForMonthWithSubaccounts(account, month)
                        : accountOps.calculateAccountTotalForMonth(account, month)
                    )}
                  </TableCell>
                  {periodData.showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600">
                      {formatPercentageForAccount(
                        isParent && isCollapsed
                          ? accountOps.calculateAccountTotalForMonthWithSubaccounts(account, month)
                          : accountOps.calculateAccountTotalForMonth(account, month),
                        account
                      )}
                    </TableCell>
                  )}
                </React.Fragment>
              ))}
              <TableCell className="border p-1 text-right font-semibold text-xs">
                {formatNumber(isParent && isCollapsed ? accountTotal : directTotal)}
              </TableCell>
              {periodData.showPercentages && (
                <TableCell className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal, account)}
                </TableCell>
              )}
            </>
          ) : (
            <>
              <TableCell className="border p-1 text-right text-xs">
                {formatNumber(isParent && isCollapsed ? accountTotal : directTotal)}
              </TableCell>
              {periodData.showPercentages && (
                <TableCell className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal, account)}
                </TableCell>
              )}
            </>
          )}
        </TableRow>

        {!isCollapsed && subaccounts.map((sub) => renderAccountRow(sub, level + 1))}

        {isParent && !isCollapsed && (
          <TableRow
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => setViewerModal({ isOpen: true, category: account })}
          >
            <TableCell className="border p-1 text-xs bg-gray-50" style={{ paddingLeft: `${level * 20 + 8}px` }}>
              <span className="font-semibold">Total {account.name}</span>
            </TableCell>
            {periodData.isMonthlyView ? (
              <>
                {getMonthsInRange(periodData.startDate, periodData.endDate).map((month) => (
                  <React.Fragment key={month}>
                    <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                      {formatNumber(accountOps.calculateAccountTotalForMonthWithSubaccounts(account, month))}
                    </TableCell>
                    {periodData.showPercentages && (
                      <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                        {formatPercentageForAccount(
                          accountOps.calculateAccountTotalForMonthWithSubaccounts(account, month),
                          account
                        )}
                      </TableCell>
                    )}
                  </React.Fragment>
                ))}
                <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                  {formatNumber(accountTotal)}
                </TableCell>
                {periodData.showPercentages && (
                  <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                    {formatPercentageForAccount(accountTotal, account)}
                  </TableCell>
                )}
              </>
            ) : (
              <>
                <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                  {formatNumber(accountTotal)}
                </TableCell>
                {periodData.showPercentages && (
                  <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                    {formatPercentageForAccount(accountTotal, account)}
                  </TableCell>
                )}
              </>
            )}
          </TableRow>
        )}
      </React.Fragment>
    );
  };

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
          startDate={periodData.startDate}
          endDate={periodData.endDate}
          setStartDate={periodData.setStartDate}
          setEndDate={periodData.setEndDate}
          selectedPeriod={periodData.selectedPeriod}
          selectedDisplay={periodData.selectedDisplay}
          handlePeriodChange={periodData.handlePeriodChange}
          handleDisplayChange={periodData.handleDisplayChange}
          exportToXLSX={exportToXLSX}
          loading={loading}
        />

        <Card className="pt-3 pb-0">
          <CardContent className="p-0">
            <h1 className="text-xl font-bold text-slate-800 mb-1 text-center">{currentCompany.name}</h1>
            <p className="text-lg text-slate-700 mb-1 text-center font-medium">Profit & Loss</p>
            <p className="text-sm text-slate-600 mb-3 text-center">
              {formatDateForDisplay(periodData.startDate)} to {formatDateForDisplay(periodData.endDate)}
            </p>

            <Table className="border border-gray-300">
              <TableHeader className="bg-gray-100">
                <TableRow>
                  <TableHead
                    className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                    style={{ width: "25%" }}
                  ></TableHead>
                  {periodData.isMonthlyView ? (
                    <>
                      {getMonthsInRange(periodData.startDate, periodData.endDate).map((month) => (
                        <TableHead key={month} className="border p-1 text-center font-medium text-xs whitespace-nowrap">
                          {formatMonth(month)}
                        </TableHead>
                      ))}
                      <TableHead className="border p-1 text-center font-medium text-xs whitespace-nowrap">
                        Total
                      </TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="border p-1 text-center font-medium text-xs">Total</TableHead>
                      {periodData.showPercentages && (
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
                      {periodData.isMonthlyView ? (
                        <>
                          {getMonthsInRange(periodData.startDate, periodData.endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  revenueRows.reduce(
                                    (sum, a) => sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  )
                                )}
                              </TableCell>
                              {periodData.showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    revenueRows.reduce(
                                      (sum, a) =>
                                        sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
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
                          {periodData.showPercentages && (
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
                          {periodData.showPercentages && (
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
                      {periodData.isMonthlyView ? (
                        <>
                          {getMonthsInRange(periodData.startDate, periodData.endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  cogsRows.reduce(
                                    (sum, a) => sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  )
                                )}
                              </TableCell>
                              {periodData.showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    cogsRows.reduce(
                                      (sum, a) =>
                                        sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
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
                          {periodData.showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(totalCOGS, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(totalCOGS)}
                          </TableCell>
                          {periodData.showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(totalCOGS, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* Gross Profit */}
                    <TableRow className="font-semibold">
                      <TableCell className="border p-1 text-xs font-semibold">Gross Profit</TableCell>
                      {periodData.isMonthlyView ? (
                        <>
                          {getMonthsInRange(periodData.startDate, periodData.endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  revenueRows.reduce(
                                    (sum, a) => sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  ) -
                                    cogsRows.reduce(
                                      (sum, a) =>
                                        sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    )
                                )}
                              </TableCell>
                              {periodData.showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    revenueRows.reduce(
                                      (sum, a) =>
                                        sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) -
                                      cogsRows.reduce(
                                        (sum, a) =>
                                          sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
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
                          {periodData.showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(grossProfit, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right text-xs">{formatNumber(grossProfit)}</TableCell>
                          {periodData.showPercentages && (
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
                      className="cursor-pointer hover:bg-blue-50"
                      onClick={() =>
                        setViewerModal({
                          isOpen: true,
                          category: { id: "EXPENSE_GROUP", name: "Total Expenses", type: "Expense", parent_id: null },
                        })
                      }
                    >
                      <TableCell className="border p-1 text-xs font-semibold">Total Expenses</TableCell>
                      {periodData.isMonthlyView ? (
                        <>
                          {getMonthsInRange(periodData.startDate, periodData.endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  expenseRows.reduce(
                                    (sum, a) => sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  )
                                )}
                              </TableCell>
                              {periodData.showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    expenseRows.reduce(
                                      (sum, a) =>
                                        sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
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
                          {periodData.showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(totalExpenses, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(totalExpenses)}
                          </TableCell>
                          {periodData.showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(totalExpenses, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* Net Income */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="border p-1 text-xs font-semibold">Net Income</TableCell>
                      {periodData.isMonthlyView ? (
                        <>
                          {getMonthsInRange(periodData.startDate, periodData.endDate).map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  revenueRows.reduce(
                                    (sum, a) => sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  ) -
                                    cogsRows.reduce(
                                      (sum, a) =>
                                        sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) -
                                    expenseRows.reduce(
                                      (sum, a) =>
                                        sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    )
                                )}
                              </TableCell>
                              {periodData.showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {calculatePercentageForMonth(
                                    revenueRows.reduce(
                                      (sum, a) =>
                                        sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) -
                                      cogsRows.reduce(
                                        (sum, a) =>
                                          sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      ) -
                                      expenseRows.reduce(
                                        (sum, a) =>
                                          sum + accountOps.calculateAccountTotalForMonthWithSubaccounts(a, month),
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
                          {periodData.showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {formatPercentage(netIncome, totalRevenue)}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right text-xs">{formatNumber(netIncome)}</TableCell>
                          {periodData.showPercentages && (
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
          startDate={periodData.startDate}
          endDate={periodData.endDate}
          companyName={currentCompany.name}
          getCategoryName={getCategoryName}
        />
      )}
    </div>
  );
}
