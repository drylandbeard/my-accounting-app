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
  getAllAccountIds,
  getAllGroupAccountIds,
} from "../_utils";
import { useFinancialData } from "../_hooks/useFinancialData";
import { usePeriodSelection } from "../_hooks/usePeriodSelection";
import { useAccountOperations } from "../_hooks/useAccountOperations";
import { ReportHeader } from "../_components/ReportHeader";
import { TransactionViewer } from "../_components/TransactionViewer";

export default function BalanceSheetPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;

  // Use period selection for as-of date
  const periodData = usePeriodSelection();

  // For balance sheet, we need all journal entries up to the as-of date
  const [asOfDate, setAsOfDate] = useState<string>(periodData.endDate);

  const { accounts, journalEntries, loading } = useFinancialData({
    companyId: currentCompany?.id || null,
    startDate: "1900-01-01", // Get all historical data
    endDate: asOfDate,
    accountTypes: ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense"],
  });

  const accountOps = useAccountOperations({ accounts, journalEntries });
  const [viewerModal, setViewerModal] = useState<ViewerModalState>({
    isOpen: false,
    category: null,
  });

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

  // Recursive function to calculate account total including subaccounts for balance sheet
  const calculateBalanceSheetAccountTotalWithSubaccounts = (account: Account): number => {
    let total = calculateBalanceSheetAccountTotal(account);
    const subaccounts = accounts.filter((acc) => acc.parent_id === account.id);
    for (const sub of subaccounts) {
      total += calculateBalanceSheetAccountTotalWithSubaccounts(sub);
    }
    return total;
  };

  // Account groups for balance sheet
  const assetAccounts = accountOps.getTopLevelAccounts("Asset");
  const liabilityAccounts = accountOps.getTopLevelAccounts("Liability");
  const equityAccounts = accountOps.getTopLevelAccounts("Equity");

  // P&L accounts for retained earnings calculation
  const revenueAccounts = accountOps.getTopLevelAccounts("Revenue");
  const cogsAccounts = accountOps.getTopLevelAccounts("COGS");
  const expenseAccounts = accountOps.getTopLevelAccounts("Expense");

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
  const getCategoryName = (tx: Transaction, selectedCategory: Account) => {
    return accounts.find((a) => a.id === tx.chart_account_id)?.name || "";
  };

  const formatPercentageForAccount = (num: number): string => {
    return formatPercentage(num, Math.abs(totalAssets));
  };

  // Transaction filtering for viewer
  const selectedCategoryTransactions = useMemo(() => {
    if (!viewerModal.category) return [];

    const transactions =
      viewerModal.category.id === "ASSETS_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(accounts, assetAccounts).includes(tx.chart_account_id))
        : viewerModal.category.id === "LIABILITIES_GROUP"
        ? journalEntries.filter((tx) =>
            getAllGroupAccountIds(accounts, liabilityAccounts).includes(tx.chart_account_id)
          )
        : viewerModal.category.id === "EQUITY_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(accounts, equityAccounts).includes(tx.chart_account_id))
        : viewerModal.category.id === "RETAINED_EARNINGS"
        ? journalEntries.filter((tx) =>
            getAllGroupAccountIds(accounts, [...revenueAccounts, ...cogsAccounts, ...expenseAccounts]).includes(
              tx.chart_account_id
            )
          )
        : journalEntries.filter((tx) => getAllAccountIds(accounts, viewerModal.category).includes(tx.chart_account_id));

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

  // Excel export function
  const exportToXLSX = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Balance Sheet");

    let currentRow = 1;

    // Title
    if (currentCompany) {
      worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = currentCompany.name;
      worksheet.getCell(`A${currentRow}`).style = {
        font: { size: 12, bold: true },
        alignment: { horizontal: "center" as const },
      };
      currentRow++;
    }

    worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = "Balance Sheet";
    worksheet.getCell(`A${currentRow}`).style = {
      font: { size: 10 },
      alignment: { horizontal: "center" as const },
    };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `As of ${formatDateForDisplay(asOfDate)}`;
    worksheet.getCell(`A${currentRow}`).style = {
      font: { size: 10 },
      alignment: { horizontal: "center" as const },
    };
    currentRow++;

    // Headers
    worksheet.getCell(currentRow, 1).value = "Account";
    worksheet.getCell(currentRow, 2).value = "Amount";
    worksheet.getCell(currentRow, 3).value = "%";
    currentRow++;

    // Save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentCompany?.name}-Balance-Sheet-${asOfDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Update as-of date when period changes
  React.useEffect(() => {
    setAsOfDate(periodData.endDate);
  }, [periodData.endDate]);

  // Render account row helper for balance sheet
  const renderAccountRow = (account: Account, level = 0): React.ReactElement | null => {
    const subaccounts = accounts.filter(
      (acc) => acc.parent_id === account.id && Math.abs(calculateBalanceSheetAccountTotalWithSubaccounts(acc)) >= 0.01
    );
    const isParent = subaccounts.length > 0;
    const isCollapsed = accountOps.collapsedAccounts.has(account.id);
    const accountTotal = calculateBalanceSheetAccountTotalWithSubaccounts(account);
    const directTotal = calculateBalanceSheetAccountTotal(account);

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
          <TableCell className="border p-1 text-right text-xs">
            {formatNumber(isParent && isCollapsed ? accountTotal : directTotal)}
          </TableCell>
          <TableCell className="border p-1 text-right text-xs text-slate-600">
            {formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal)}
          </TableCell>
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
            <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
              {formatNumber(accountTotal)}
            </TableCell>
            <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
              {formatPercentageForAccount(accountTotal)}
            </TableCell>
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
            Please select a company from the dropdown in the navigation bar to view balance sheet reports.
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
          endDate={asOfDate}
          setStartDate={periodData.setStartDate}
          setEndDate={setAsOfDate}
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
            <p className="text-lg text-slate-700 mb-1 text-center font-medium">Balance Sheet</p>
            <p className="text-sm text-slate-600 mb-3 text-center">As of {formatDateForDisplay(asOfDate)}</p>

            <Table className="border border-gray-300">
              <TableHeader className="bg-gray-100">
                <TableRow>
                  <TableHead className="border p-1 text-center font-medium text-xs" style={{ width: "60%" }}>
                    Account
                  </TableHead>
                  <TableHead className="border p-1 text-center font-medium text-xs" style={{ width: "25%" }}>
                    Amount
                  </TableHead>
                  <TableHead className="border p-1 text-center font-medium text-xs" style={{ width: "15%" }}>
                    %
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="border p-4 text-center">
                      <div className="flex flex-col items-center space-y-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                        <span className="text-xs">Loading balance sheet data...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {/* Assets Section */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={3} className="border p-1 font-semibold text-xs">
                        ASSETS
                      </TableCell>
                    </TableRow>
                    {assetAccounts.map((account) => renderAccountRow(account))}

                    {/* Total Assets */}
                    <TableRow
                      className="cursor-pointer hover:bg-blue-50 font-semibold"
                      onClick={() =>
                        setViewerModal({
                          isOpen: true,
                          category: { id: "ASSETS_GROUP", name: "Total Assets", type: "Asset", parent_id: null },
                        })
                      }
                    >
                      <TableCell className="border p-1 text-xs font-semibold">TOTAL ASSETS</TableCell>
                      <TableCell className="border p-1 text-right font-semibold text-xs">
                        {formatNumber(totalAssets)}
                      </TableCell>
                      <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">100.0%</TableCell>
                    </TableRow>

                    {/* Spacing */}
                    <TableRow>
                      <TableCell colSpan={3} className="border p-1"></TableCell>
                    </TableRow>

                    {/* Liabilities Section */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={3} className="border p-1 font-semibold text-xs">
                        LIABILITIES
                      </TableCell>
                    </TableRow>
                    {liabilityAccounts.map((account) => renderAccountRow(account))}

                    {/* Total Liabilities */}
                    <TableRow
                      className="cursor-pointer hover:bg-blue-50 font-semibold"
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
                      <TableCell className="border p-1 text-xs font-semibold">TOTAL LIABILITIES</TableCell>
                      <TableCell className="border p-1 text-right font-semibold text-xs">
                        {formatNumber(totalLiabilities)}
                      </TableCell>
                      <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                        {formatPercentageForAccount(totalLiabilities)}
                      </TableCell>
                    </TableRow>

                    {/* Equity Section */}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={3} className="border p-1 font-semibold text-xs">
                        EQUITY
                      </TableCell>
                    </TableRow>
                    {equityAccounts.map((account) => renderAccountRow(account))}

                    {/* Retained Earnings */}
                    <TableRow
                      className="cursor-pointer hover:bg-gray-100"
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
                      <TableCell className="border p-1 text-xs font-semibold">Retained Earnings</TableCell>
                      <TableCell className="border p-1 text-right text-xs">{formatNumber(retainedEarnings)}</TableCell>
                      <TableCell className="border p-1 text-right text-xs text-slate-600">
                        {formatPercentageForAccount(retainedEarnings)}
                      </TableCell>
                    </TableRow>

                    {/* Total Equity */}
                    <TableRow
                      className="cursor-pointer hover:bg-blue-50 font-semibold"
                      onClick={() =>
                        setViewerModal({
                          isOpen: true,
                          category: { id: "EQUITY_GROUP", name: "Total Equity", type: "Equity", parent_id: null },
                        })
                      }
                    >
                      <TableCell className="border p-1 text-xs font-semibold">TOTAL EQUITY</TableCell>
                      <TableCell className="border p-1 text-right font-semibold text-xs">
                        {formatNumber(totalEquity)}
                      </TableCell>
                      <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                        {formatPercentageForAccount(totalEquity)}
                      </TableCell>
                    </TableRow>

                    {/* Total Liabilities & Equity */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="border p-1 text-xs font-semibold">TOTAL LIABILITIES & EQUITY</TableCell>
                      <TableCell className="border p-1 text-right text-xs">
                        {formatNumber(totalLiabilities + totalEquity)}
                      </TableCell>
                      <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                        {formatPercentageForAccount(totalLiabilities + totalEquity)}
                      </TableCell>
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
          startDate="1900-01-01"
          endDate={asOfDate}
          companyName={currentCompany.name}
          getCategoryName={getCategoryName}
        />
      )}
    </div>
  );
}
