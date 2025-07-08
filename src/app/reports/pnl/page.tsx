"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useAuthStore } from "@/zustand/authStore";
import { useTransactionsStore } from "@/zustand/transactionsStore";
import { useCategoriesStore } from "@/zustand/categoriesStore";
import { usePayeesStore } from "@/zustand/payeesStore";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TransactionModal, { EditJournalModalState as TransactionModalState, JournalEntryLine } from "@/components/TransactionModal";
import ManualJeModal, { EditJournalModalState as ManualJeModalState, NewJournalEntry } from "@/components/ManualJeModal";

import { useSearchParams } from "next/navigation";

// Shared imports
import { Account, Category, Transaction, ViewerModalState } from "../_types";
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
import { AccountRowRenderer } from "../_components/AccountRowRenderer";
import { SaveReportModal } from "../_components/SaveReportModal";
import { useExportProfitLoss } from "../_hooks/useExportProfitLoss";
import { api } from "@/lib/api";

export default function PnLPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;
  
  // Store hooks for modal functionality
  const { accounts: bankAccounts } = useTransactionsStore();
  const { categories } = useCategoriesStore();
  const { payees } = usePayeesStore();
  
  // Modal states
  const [editJournalModal, setEditJournalModal] = useState<TransactionModalState & { selectedAccountId?: string; selectedAccountCategoryId?: string }>({
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
    referenceNumber: '',
    editEntry: { date: '', description: '', jeName: '', lines: [] },
    saving: false,
    error: null,
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

  const { categories, journalEntries, loading } = useFinancialData({
    companyId: currentCompany?.id || null,
    startDate: startDate,
    endDate: endDate,
    accountTypes: ["Revenue", "COGS", "Expense"],
  });

  const {
    collapsedAccounts,
    toggleCategory,
    getTopLevelAccounts,
    calculateAccountDirectTotal,
    calculateAccountTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts,
    calculateAccountTotalForQuarter,
    calculateAccountTotalForQuarterWithSubaccounts,
    collapseAllParentCategories,
    expandAllParentCategories,
    getParentAccounts,
  } = useAccountOperations({ categories, journalEntries });
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
      console.log("reportId", reportId);
      if (!reportId || !currentCompany?.id) return;

      setLoadingSavedReport(true);
      try {
        const response = await api.get(`/api/reports/saved/${reportId}`);

        if (response.ok) {
          const savedReport = await response.json();
          if (savedReport.type === "pnl") {
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
    } else if (isQuarterlyView) {
      const quarterCount = getQuartersInRange(startDate, endDate).length;
      // Account column + quarter columns + (percentage columns if enabled) + Total column + (Total percentage if enabled)
      return 1 + quarterCount + (showPercentages ? quarterCount : 0) + 1 + (showPercentages ? 1 : 0);
    } else {
      // Account column + Total column + (Percentage column if enabled)
      return showPercentages ? 3 : 2;
    }
  };

  // Helper functions
  const getCategoryName = (tx: Transaction) => {
    return categories.find((a) => a.id === tx.chart_account_id)?.name || "";
  };

  const formatPercentageForAccount = (num: number, category?: Category): string => {
    if (!category) return formatPercentage(num, totalRevenue);

    const base =
      totalRevenue !== 0
        ? totalRevenue
        : category.type === "Expense"
        ? totalExpenses
        : category.type === "COGS"
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

  const calculatePercentageForQuarter = (amount: number, quarter: string): string => {
    const quarterRevenue = revenueRows.reduce(
      (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
      0
    );
    return formatPercentage(amount, quarterRevenue);
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
          .from('manual_journal_entries')
          .select('*')
          .eq('reference_number', transaction.transaction_id)
          .eq('company_id', currentCompany?.id);

        if (error) throw error;

        if (manualEntries && manualEntries.length > 0) {
          // For manual journal entries, each row is a separate line in the journal entry
          // Can be 2 lines (normal) or 3+ lines (split)
          const lines = manualEntries.map((entry: { description: string; chart_account_id: string; payee_id?: string; debit: number; credit: number }, index: number) => ({
            id: (index + 1).toString(),
            description: entry.description,
            categoryId: entry.chart_account_id,
            payeeId: entry.payee_id || "",
            debit: entry.debit.toString(),
            credit: entry.credit.toString(),
          }));

          setEditManualModal(prev => ({
            ...prev,
            editEntry: {
              ...prev.editEntry,
              lines,
            },
          }));
        }
      } catch (error) {
        console.error('Error fetching manual journal entry:', error);
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
          .from('journal')
          .select('*')
          .eq('transaction_id', transaction.transaction_id)
          .eq('company_id', currentCompany?.id);

        if (error) throw error;

        if (journalEntries && journalEntries.length > 0) {
          // Get the transaction data to find the corresponding account
          const { data: transactionData } = await supabase
            .from('transactions')
            .select('corresponding_category_id, plaid_account_id')
            .eq('id', transaction.transaction_id)
            .single();
          
          // Map all journal entries to lines (TransactionModal will handle filtering)
          const lines = journalEntries.map((entry: { description: string; chart_account_id: string; debit: number; credit: number }, index: number) => ({
            id: (index + 1).toString(),
            description: entry.description,
            categoryId: entry.chart_account_id,
            payeeId: "", // Journal entries don't have payee_id directly
            debit: entry.debit.toString(),
            credit: entry.credit.toString(),
          }));

          setEditJournalModal(prev => ({
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
          setEditJournalModal(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error('Error fetching journal entry:', error);
        setEditJournalModal(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Failed to load transaction details' 
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
        lines: [...prev.editEntry.lines, {
          id: newLineId,
          description: "",
          categoryId: "",
          payeeId: "",
          debit: "0.00",
          credit: "0.00",
        }],
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

  // Save report function
  const saveReport = async (name: string) => {
    if (!name.trim() || !currentCompany?.id) return;

    setSaving(true);
    try {
      const response = await api.post("/api/reports/saved", {
        name: name.trim(),
        type: "pnl",
        description: `Profit & Loss from ${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`,
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

  // Export hook
  const { exportToXLSX } = useExportProfitLoss({
    categories,
    journalEntries,
    revenueRows,
    cogsRows,
    expenseRows,
    currentCompany,
    isMonthlyView,
    isQuarterlyView,
    showPercentages,
    startDate,
    endDate,
    collapsedAccounts,
    calculateAccountTotal,
    calculateAccountDirectTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts,
    calculateAccountTotalForQuarter,
    calculateAccountTotalForQuarterWithSubaccounts,
    formatPercentageForAccount,
    calculatePercentageForMonth,
    calculatePercentageForQuarter,
  });

  // Render account row using the reusable component
  const renderAccountRow = (category: Category, level = 0): React.ReactElement | null => {
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
        calculateAccountTotal={calculateAccountTotal}
        calculateAccountDirectTotal={calculateAccountDirectTotal}
        calculateAccountTotalForMonth={calculateAccountTotalForMonth}
        calculateAccountTotalForMonthWithSubaccounts={calculateAccountTotalForMonthWithSubaccounts}
        calculateAccountTotalForQuarter={calculateAccountTotalForQuarter}
        calculateAccountTotalForQuarterWithSubaccounts={calculateAccountTotalForQuarterWithSubaccounts}
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
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, revenueRows).includes(tx.chart_account_id))
        : category.id === "COGS_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, cogsRows).includes(tx.chart_account_id))
        : category.id === "EXPENSE_GROUP"
        ? journalEntries.filter((tx) => getAllGroupAccountIds(categories, expenseRows).includes(tx.chart_account_id))
        : journalEntries.filter((tx) => getAllAccountIds(categories, category).includes(tx.chart_account_id));

    if (viewerModal.selectedMonth) {
      transactions = transactions.filter((tx) => tx.date.startsWith(viewerModal.selectedMonth!));
    }

    return transactions;
  }, [viewerModal, journalEntries, categories, revenueRows, cogsRows, expenseRows]);

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
            <p className="text-lg text-slate-700 mb-1 text-center font-medium">Profit & Loss</p>
            <p className="text-sm text-slate-600 mb-3 text-center">
              {formatDateForDisplay(startDate)} to {formatDateForDisplay(endDate)}
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
                            {showPercentages && <TableHead className="whitespace-nowrap min-w-11">%</TableHead>}
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
                            {showPercentages && (
                              <TableHead className="whitespace-nowrap" style={{ width: "6%" }}>
                                %
                              </TableHead>
                            )}
                          </React.Fragment>
                        ))}
                        <TableHead style={{ width: showPercentages ? "7%" : "10%" }}>Total</TableHead>
                        {showPercentages && <TableHead style={{ width: "6%" }}>%</TableHead>}
                      </>
                    ) : (
                      <>
                        <TableHead>Total</TableHead>
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
                      {/* Revenue Section */}
                      <TableRow isSummaryLineItem>
                        <TableCell colSpan={getTotalColumns()} isLineItem>
                          Revenue
                        </TableCell>
                      </TableRow>
                      {revenueRows.map((row) => renderAccountRow(row))}

                      {/* Total Revenue */}
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setViewerModal({
                            isOpen: true,
                            category: { id: "REVENUE_GROUP", name: "Total Revenue", type: "Revenue", parent_id: null },
                          })
                        }
                      >
                        <TableCell isLineItem>Total Revenue</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
                                  {formatNumber(
                                    revenueRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
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
                            <TableCell isValue>{formatNumber(totalRevenue)}</TableCell>
                            {showPercentages && <TableCell isValue>{totalRevenue !== 0 ? "100.0%" : "—"}</TableCell>}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    revenueRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(
                                      revenueRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ),
                                      quarter
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalRevenue)}</TableCell>
                            {showPercentages && <TableCell isValue>{totalRevenue !== 0 ? "100.0%" : "—"}</TableCell>}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(totalRevenue)}</TableCell>
                            {showPercentages && <TableCell isValue>{totalRevenue !== 0 ? "100.0%" : "—"}</TableCell>}
                          </>
                        )}
                      </TableRow>

                      {/* COGS Section */}
                      <TableRow isSummaryLineItem>
                        <TableCell colSpan={getTotalColumns()} isLineItem>
                          Cost of Goods Sold
                        </TableCell>
                      </TableRow>
                      {cogsRows.map((row) => renderAccountRow(row))}

                      {/* Total COGS */}
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setViewerModal({
                            isOpen: true,
                            category: {
                              id: "COGS_GROUP",
                              name: "Total Cost of Goods Sold",
                              type: "COGS",
                              parent_id: null,
                            },
                          })
                        }
                      >
                        <TableCell isLineItem>Total Cost of Goods Sold</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
                                  {formatNumber(
                                    cogsRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
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
                            <TableCell isValue>{formatNumber(totalCOGS)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {totalRevenue !== 0
                                  ? formatPercentage(totalCOGS, totalRevenue)
                                  : totalCOGS !== 0
                                  ? "100.0%"
                                  : "—"}
                              </TableCell>
                            )}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    cogsRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(
                                      cogsRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ),
                                      quarter
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalCOGS)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
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
                            <TableCell isValue>{formatNumber(totalCOGS)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
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
                      <TableRow>
                        <TableCell isLineItem>Gross Profit</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
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
                                  <TableCell isValue>
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
                            <TableCell isValue>{formatNumber(grossProfit)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentage(grossProfit, totalRevenue)}</TableCell>
                            )}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    revenueRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    ) -
                                      cogsRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(
                                      revenueRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ) -
                                        cogsRows.reduce(
                                          (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                          0
                                        ),
                                      quarter
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(grossProfit)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentage(grossProfit, totalRevenue)}</TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(grossProfit)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentage(grossProfit, totalRevenue)}</TableCell>
                            )}
                          </>
                        )}
                      </TableRow>

                      {/* Expenses Section */}
                      <TableRow isSummaryLineItem>
                        <TableCell colSpan={getTotalColumns()} isLineItem>
                          Expenses
                        </TableCell>
                      </TableRow>
                      {expenseRows.map((row) => renderAccountRow(row))}

                      {/* Total Expenses */}
                      <TableRow
                        className="cursor-pointer"
                        isSummaryLineItem
                        onClick={() =>
                          setViewerModal({
                            isOpen: true,
                            category: { id: "EXPENSE_GROUP", name: "Total Expenses", type: "Expense", parent_id: null },
                          })
                        }
                      >
                        <TableCell isLineItem>Total Expenses</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
                                  {formatNumber(
                                    expenseRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
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
                            <TableCell isValue>{formatNumber(totalExpenses)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
                                {totalRevenue !== 0
                                  ? formatPercentage(totalExpenses, totalRevenue)
                                  : totalExpenses !== 0
                                  ? "100.0%"
                                  : "—"}
                              </TableCell>
                            )}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    expenseRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(
                                      expenseRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ),
                                      quarter
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(totalExpenses)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
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
                            <TableCell isValue>{formatNumber(totalExpenses)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>
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
                      <TableRow isSummaryLineItem>
                        <TableCell isLineItem>Net Income</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange(startDate, endDate).map((month) => (
                              <React.Fragment key={month}>
                                <TableCell isValue>
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
                                  <TableCell isValue>
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
                            <TableCell isValue>{formatNumber(netIncome)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentage(netIncome, totalRevenue)}</TableCell>
                            )}
                          </>
                        ) : isQuarterlyView ? (
                          <>
                            {getQuartersInRange(startDate, endDate).map((quarter) => (
                              <React.Fragment key={quarter}>
                                <TableCell isValue>
                                  {formatNumber(
                                    revenueRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                      0
                                    ) -
                                      cogsRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ) -
                                      expenseRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      )
                                  )}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell isValue>
                                    {calculatePercentageForQuarter(
                                      revenueRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                        0
                                      ) -
                                        cogsRows.reduce(
                                          (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                          0
                                        ) -
                                        expenseRows.reduce(
                                          (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
                                          0
                                        ),
                                      quarter
                                    )}
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell isValue>{formatNumber(netIncome)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentage(netIncome, totalRevenue)}</TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell isValue>{formatNumber(netIncome)}</TableCell>
                            {showPercentages && (
                              <TableCell isValue>{formatPercentage(netIncome, totalRevenue)}</TableCell>
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
        reportType="pnl"
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
        />
      )}
      
      {/* Transaction Modals */}
      {editJournalModal.isOpen && (
        <TransactionModal
          modalState={editJournalModal}
          categories={categories}
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
          onOpenCategoryModal={() => {}}
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
          categoryOptions={categories.map(c => ({ value: c.id, label: c.name }))}
          payees={payees}
          setNewCategoryModal={() => {}}
        />
      )}
    </div>
  );
}
