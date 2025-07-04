"use client";

import React, { useMemo } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// import { Check } from "lucide-react";
// import { useSearchParams } from "next/navigation";

// Shared imports
// import { Account, Transaction, ViewerModalState } from "../_types";
import {
  formatDateForDisplay,
  formatNumber,
  // formatPercentage,
  // getMonthsInRange,
  // getQuartersInRange,
  // formatMonth,
  // formatQuarter,
  getAllAccountIds,
  // getAllGroupAccountIds,
} from "../_utils";
import { useFinancialData } from "../_hooks/useFinancialData";
import { usePeriodSelection } from "../_hooks/usePeriodSelection";
// import { useAccountOperations } from "../_hooks/useAccountOperations";
import { ReportHeader } from "../_components/ReportHeader";
// import { TransactionViewer } from "../_components/TransactionViewer";
// import { SaveReportModal } from "../_components/SaveReportModal";
// import { api } from "@/lib/api";
import { useAccountOperations } from "../_hooks/useAccountOperations";

export default function CashFlowPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;

  const {
    selectedPeriod,
    selectedPrimaryDisplay,
    selectedSecondaryDisplay,
    startDate,
    endDate,
    // showPercentages,
    // isMonthlyView,
    // isQuarterlyView,
    setStartDate,
    setEndDate,
    handlePeriodChange,
    handlePrimaryDisplayChange,
    handleSecondaryDisplayChange,
  } = usePeriodSelection();

  // For cash flow, we need accounts that affect cash (Assets, Liabilities, Equity)
  const { accounts, journalEntries, loading } = useFinancialData({
    companyId: currentCompany?.id || null,
    startDate: startDate,
    endDate: endDate,
    accountTypes: ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense"],
  });

  // const { collapsedAccounts, toggleAccount, getTopLevelAccounts, collapseAllParentCategories } = useAccountOperations({
  //   accounts,
  //   journalEntries,
  // });

  // const [viewerModal, setViewerModal] = useState<ViewerModalState>({
  //   isOpen: false,
  //   category: null,
  // });

  const { getTopLevelAccounts, collapseAllParentCategories } = useAccountOperations({
    accounts,
    journalEntries,
  });

  // const [showSaveDialog, setShowSaveDialog] = useState(false);
  // // const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  // // const [loadingSavedReport, setLoadingSavedReport] = useState(false);
  // const [saving, setSaving] = useState(false);

  // const searchParams = useSearchParams();
  // const reportId = searchParams.get("reportId");

  // Load saved report if reportId is provided
  // useEffect(() => {
  //   const loadSavedReport = async () => {
  //     if (!reportId || !currentCompany?.id) return;

  //     setLoadingSavedReport(true);
  //     try {
  //       const response = await api.get(`/api/reports/saved/${reportId}`);

  //       if (response.ok) {
  //         const savedReport = await response.json();
  //         if (savedReport.type === "cash-flow") {
  //           // Apply saved parameters
  //           setStartDate(savedReport.parameters.startDate);
  //           setEndDate(savedReport.parameters.endDate);
  //           handlePrimaryDisplayChange(savedReport.parameters.primaryDisplay);
  //           handleSecondaryDisplayChange(savedReport.parameters.secondaryDisplay);
  //         }
  //       }
  //     } catch (error) {
  //       console.error("Failed to load saved report:", error);
  //     } finally {
  //       setLoadingSavedReport(false);
  //     }
  //   };

  //   loadSavedReport();
  // }, [
  //   reportId,
  //   currentCompany?.id,
  //   setStartDate,
  //   setEndDate,
  //   handlePrimaryDisplayChange,
  //   handleSecondaryDisplayChange,
  // ]);

  // Cash flow calculations - focusing on cash and cash equivalents
  const calculateCashFlow = (accountType: string, startDate: string, endDate: string): number => {
    const relevantAccounts = accounts.filter((acc) => acc.type === accountType);

    return relevantAccounts.reduce((total, account) => {
      const accountTransactions = journalEntries.filter(
        (tx) => tx.chart_account_id === account.id && tx.date >= startDate && tx.date <= endDate
      );

      if (accountType === "Asset") {
        // For assets, positive cash flow = decrease in asset (credit), negative = increase (debit)
        if (
          account.name.toLowerCase().includes("cash") ||
          account.name.toLowerCase().includes("bank") ||
          account.name.toLowerCase().includes("checking") ||
          account.name.toLowerCase().includes("savings")
        ) {
          // For cash accounts, debit increases cash, credit decreases cash
          return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.debit) - Number(tx.credit), 0);
        } else {
          // For other assets, decrease = positive cash flow
          return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
        }
      } else if (accountType === "Liability" || accountType === "Equity") {
        // For liabilities/equity, increase = positive cash flow
        return total + accountTransactions.reduce((sum, tx) => sum + Number(tx.credit) - Number(tx.debit), 0);
      }
      return total;
    }, 0);
  };

  // Operating activities (Revenue and Expenses)
  const operatingCashFlow = useMemo(() => {
    const revenueAccounts = getTopLevelAccounts("Revenue");
    const expenseAccounts = getTopLevelAccounts("Expense");
    const cogsAccounts = getTopLevelAccounts("COGS");

    const revenue = revenueAccounts.reduce((sum, account) => {
      const transactions = journalEntries.filter((tx) =>
        getAllAccountIds(accounts, account).includes(tx.chart_account_id)
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.credit) - Number(tx.debit), 0);
    }, 0);

    const expenses = [...expenseAccounts, ...cogsAccounts].reduce((sum, account) => {
      const transactions = journalEntries.filter((tx) =>
        getAllAccountIds(accounts, account).includes(tx.chart_account_id)
      );
      return sum + transactions.reduce((txSum, tx) => txSum + Number(tx.debit) - Number(tx.credit), 0);
    }, 0);

    return revenue - expenses;
  }, [accounts, journalEntries, getTopLevelAccounts]);

  // Investing activities (non-current assets)
  const investingCashFlow = useMemo(() => {
    return calculateCashFlow("Asset", startDate, endDate) - calculateCashFlow("Asset", startDate, endDate); // Simplified for now
  }, [accounts, journalEntries, startDate, endDate]);

  // Financing activities (Liabilities and Equity)
  const financingCashFlow = useMemo(() => {
    return calculateCashFlow("Liability", startDate, endDate) + calculateCashFlow("Equity", startDate, endDate);
  }, [accounts, journalEntries, startDate, endDate]);

  const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

  // const saveReport = async (name: string) => {
  //   if (!name.trim() || !currentCompany?.id) return;

  //   setSaving(true);
  //   try {
  //     const response = await api.post("/api/reports/saved", {
  //       name: name.trim(),
  //       type: "cash-flow",
  //       description: `Cash Flow Statement from ${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`,
  //       parameters: {
  //         startDate,
  //         endDate,
  //         primaryDisplay: selectedPrimaryDisplay,
  //         secondaryDisplay: selectedSecondaryDisplay,
  //       },
  //     });

  //     if (response.ok) {
  //       setShowSaveDialog(false);
  //       setShowSuccessMessage(true);
  //       setTimeout(() => setShowSuccessMessage(false), 3000);
  //     }
  //   } catch (error) {
  //     console.error("Failed to save report:", error);
  //   } finally {
  //     setSaving(false);
  //   }
  // };

  const exportToXLSX = async () => {
    // This would be implemented similar to the other export functions
    console.log("Export Cash Flow to XLSX");
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
          exportToXLSX={exportToXLSX}
          // onSaveReport={() => setShowSaveDialog(true)}
          loading={loading}
        />

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
                  <TableHead className="text-right font-bold text-slate-700">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Operating Activities */}
                <TableRow className="border-b-2 border-slate-200">
                  <TableCell className="font-semibold text-slate-800 py-3">Operating Activities</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 py-2">Net Income from Operations</TableCell>
                  <TableCell className="text-right py-2">{formatNumber(operatingCashFlow)}</TableCell>
                </TableRow>
                <TableRow className="border-b border-slate-200">
                  <TableCell className="font-medium pl-4 py-3">Net Cash from Operating Activities</TableCell>
                  <TableCell className="text-right font-medium py-3">{formatNumber(operatingCashFlow)}</TableCell>
                </TableRow>

                {/* Investing Activities */}
                <TableRow className="border-b-2 border-slate-200">
                  <TableCell className="font-semibold text-slate-800 py-3">Investing Activities</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 py-2">Investment Activities</TableCell>
                  <TableCell className="text-right py-2">{formatNumber(investingCashFlow)}</TableCell>
                </TableRow>
                <TableRow className="border-b border-slate-200">
                  <TableCell className="font-medium pl-4 py-3">Net Cash from Investing Activities</TableCell>
                  <TableCell className="text-right font-medium py-3">{formatNumber(investingCashFlow)}</TableCell>
                </TableRow>

                {/* Financing Activities */}
                <TableRow className="border-b-2 border-slate-200">
                  <TableCell className="font-semibold text-slate-800 py-3">Financing Activities</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 py-2">Financing Activities</TableCell>
                  <TableCell className="text-right py-2">{formatNumber(financingCashFlow)}</TableCell>
                </TableRow>
                <TableRow className="border-b border-slate-200">
                  <TableCell className="font-medium pl-4 py-3">Net Cash from Financing Activities</TableCell>
                  <TableCell className="text-right font-medium py-3">{formatNumber(financingCashFlow)}</TableCell>
                </TableRow>

                {/* Net Cash Flow */}
                <TableRow className="border-b-2 border-slate-400">
                  <TableCell className="font-bold text-slate-900 py-4">Net Change in Cash</TableCell>
                  <TableCell className="text-right font-bold text-slate-900 py-4">
                    {formatNumber(netCashFlow)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Save Dialog */}
        {/* <SaveReportModal
          isOpen={showSaveDialog}
          onClose={() => setShowSaveDialog(false)}
          onSave={saveReport}
          reportType="cash-flow"
          isLoading={saving}
        /> */}

        {/* Transaction Viewer Modal */}
        {/* <TransactionViewer
          viewerModal={viewerModal}
          setViewerModal={setViewerModal}
          transactions={[]} // Would be populated based on selected category
          accounts={accounts}
          startDate={startDate}
          endDate={endDate}
          companyName={currentCompany?.name || ""}
        /> */}
      </div>
    </div>
  );
}
