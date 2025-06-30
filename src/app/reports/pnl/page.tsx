"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { v4 as uuidv4 } from "uuid";
import { useAuthStore } from "@/zustand/authStore";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodSelector } from "@/components/ui/period-selector";

type Account = {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  parent_id?: string | null;
};

type Transaction = {
  id: string;
  date: string;
  description: string;
  chart_account_id: string;
  debit: number;
  credit: number;
  transaction_id: string;
};

export default function Page() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<Transaction[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<Account | null>(null);
  const [isMonthlyView, setIsMonthlyView] = useState(true);
  const [showPreviousPeriod, setShowPreviousPeriod] = useState(false);
  const [showPercentages, setShowPercentages] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Period Selector state
  const [selectedPeriod, setSelectedPeriod] = useState("thisYearToLastMonth");
  const [selectedDisplay, setSelectedDisplay] = useState("byMonth");
  const [selectedComparison, setSelectedComparison] = useState("none");
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    transaction: Transaction | null;
  }>({
    isOpen: false,
    transaction: null,
  });
  const [viewerModal, setViewerModal] = useState<{
    isOpen: boolean;
    category: Account | null;
  }>({
    isOpen: false,
    category: null,
  });
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set());

  // Toggle function for collapse/expand accounts
  const toggleAccount = (accountId: string) => {
    const newCollapsed = new Set(collapsedAccounts);
    if (newCollapsed.has(accountId)) {
      newCollapsed.delete(accountId);
    } else {
      newCollapsed.add(accountId);
    }
    setCollapsedAccounts(newCollapsed);
  };

  // Helper: format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper: get first and last day of month
  const getMonthRange = (date: Date): { start: Date; end: Date } => {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start, end };
  };

  // Helper: get first and last day of quarter
  const getQuarterRange = (date: Date): { start: Date; end: Date } => {
    const quarter = Math.floor(date.getMonth() / 3);
    const start = new Date(date.getFullYear(), quarter * 3, 1);
    const end = new Date(date.getFullYear(), (quarter + 1) * 3, 0);
    return { start, end };
  };

  // Helper: get first and last day of year
  const getYearRange = (date: Date): { start: Date; end: Date } => {
    const start = new Date(date.getFullYear(), 0, 1);
    const end = new Date(date.getFullYear(), 11, 31);
    return { start, end };
  };

  // Handle period selector changes
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    
    switch (period) {
      case "thisMonth":
        handleDateRangeSelect("currentMonth");
        break;
      case "lastMonth":
        handleDateRangeSelect("previousMonth");
        break;
      case "last4Months":
        // Last 4 months
        const today = new Date();
        const fourMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 4, 1);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        setStartDate(formatDate(fourMonthsAgo));
        setEndDate(formatDate(endOfLastMonth));
        break;
      case "last12Months":
        // Last 12 months
        const todayFor12 = new Date();
        const twelveMonthsAgo = new Date(todayFor12.getFullYear(), todayFor12.getMonth() - 12, 1);
        const endOfCurrentMonth = new Date(todayFor12.getFullYear(), todayFor12.getMonth() + 1, 0);
        setStartDate(formatDate(twelveMonthsAgo));
        setEndDate(formatDate(endOfCurrentMonth));
        break;
      case "thisQuarter":
        handleDateRangeSelect("currentQuarter");
        break;
      case "lastQuarter":
        handleDateRangeSelect("previousQuarter");
        break;
      case "thisYearToLastMonth":
        handleDateRangeSelect("yearToLastMonth");
        break;
      case "thisYearToToday":
        handleDateRangeSelect("ytd");
        break;
      default:
        handleDateRangeSelect("yearToLastMonth");
    }
  };

  const handleDisplayChange = (display: string) => {
    setSelectedDisplay(display);
    // Map display options to existing view state
    setIsMonthlyView(display === "byMonth");
    setShowPercentages(display === "withPercentages");
  };

  const handleComparisonChange = (comparison: string) => {
    setSelectedComparison(comparison);
    // Map comparison options to existing state
    setShowPreviousPeriod(comparison === "previousPeriod" || comparison === "previousYear");
  };





  const handleDateRangeSelect = (
    range:
      | "currentMonth"
      | "currentQuarter"
      | "previousMonth"
      | "previousQuarter"
      | "previousYear"
      | "currentYear"
      | "yearToLastMonth"
      | "ytd"
  ) => {
    // Create a date object for the current date in local timezone
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day

    let start: Date;
    let end: Date;

    switch (range) {
      case "currentMonth": {
        const range = getMonthRange(today);
        start = range.start;
        end = range.end;
        break;
      }
      case "currentQuarter": {
        const range = getQuarterRange(today);
        start = range.start;
        end = range.end;
        break;
      }
      case "previousMonth": {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const range = getMonthRange(lastMonth);
        start = range.start;
        end = range.end;
        break;
      }
      case "previousQuarter": {
        const lastQuarter = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        const range = getQuarterRange(lastQuarter);
        start = range.start;
        end = range.end;
        break;
      }
      case "previousYear": {
        const lastYear = new Date(today.getFullYear() - 1, 0, 1);
        const range = getYearRange(lastYear);
        start = range.start;
        end = range.end;
        break;
      }
      case "currentYear": {
        const range = getYearRange(today);
        start = range.start;
        end = range.end;
        break;
      }
      case "yearToLastMonth": {
        start = new Date(today.getFullYear(), 0, 1); // January 1st of current year
        const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of previous month
        end = lastMonth;
        break;
      }
      case "ytd": {
        start = new Date(today.getFullYear(), 0, 1); // January 1st of current year
        end = today; // Today
        break;
      }
    }

    // Ensure dates are set to start and end of day in local timezone
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };

  // Calculate today's date once
  const today = React.useMemo(() => new Date().toISOString().split('T')[0], []);

  useEffect(() => {
    setStartDate("2025-01-01");
    setEndDate(today);
  }, [today]);

  useEffect(() => {
    const fetchData = async () => {
      if (!hasCompanyContext) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const { data: accountsData } = await supabase
          .from("chart_of_accounts")
          .select("*")
          .eq("company_id", currentCompany!.id)
          .in("type", ["Revenue", "COGS", "Expense"]);
        setAccounts(accountsData || []);

        let journalQuery = supabase.from("journal").select("*").eq("company_id", currentCompany!.id);
        if (startDate && endDate) {
          journalQuery = journalQuery.gte("date", startDate).lte("date", endDate);
        }
        const { data: journalData } = await journalQuery;
        setJournalEntries(journalData || []);
      } catch (error) {
        console.error("Error fetching P&L data:", error);
      } finally {
        setLoading(false);
      }
    };
    if (startDate && endDate) fetchData();
  }, [startDate, endDate, currentCompany?.id, hasCompanyContext]);

  // Helper: get all subaccounts for a parent
  const getSubaccounts = (parentId: string) => accounts.filter((acc) => acc.parent_id === parentId);

  // Helper: calculate direct total for an account (only its own transactions)
  const calculateAccountDirectTotal = (account: Account): number => {
    if (account.type === "Revenue") {
      return journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
    } else if (account.type === "Expense" || account.type === "COGS") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    }
    return 0;
  };

  // Helper: calculate roll-up total for an account (including subaccounts)
  const calculateAccountTotal = (account: Account): number => {
    let total = calculateAccountDirectTotal(account);
    const subaccounts = getSubaccounts(account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotal(sub);
    }
    return total;
  };

  // Helper: get all account IDs in a subtree (for viewer)
  const getAllAccountIds = (account: Account): string[] => {
    const subaccounts = getSubaccounts(account.id);
    return [account.id, ...subaccounts.flatMap(getAllAccountIds)];
  };

  // Helper: get all account IDs for a group (e.g., all revenue accounts)
  const getAllGroupAccountIds = (accounts: Account[]) => accounts.flatMap((acc) => getAllAccountIds(acc));

  // Helper: check if an account or its subaccounts have any transactions
  const hasTransactions = (account: Account): boolean => {
    const directTransactions = journalEntries.some((tx) => tx.chart_account_id === account.id);
    if (directTransactions) return true;

    const subaccounts = getSubaccounts(account.id);
    return subaccounts.some((sub) => hasTransactions(sub));
  };

  // Top-level accounts (no parent) with transactions
  const topLevel = (type: string) => accounts.filter((a) => a.type === type && !a.parent_id).filter(hasTransactions);

  // For COGS, Expense, Revenue
  const revenueRows = topLevel("Revenue");
  const cogsRows = topLevel("COGS");
  const expenseRows = topLevel("Expense");

  // Totals
  const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const totalCOGS = cogsRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const totalExpenses = expenseRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const grossProfit = totalRevenue - totalCOGS;
  const netIncome = grossProfit - totalExpenses;

  // Helper: get category name for a transaction
  const getCategoryName = (tx: Transaction, selectedCategory: Account) => {
    if (selectedCategory.type === "Revenue") {
      return accounts.find((a) => a.id === tx.chart_account_id)?.name || "";
    } else {
      return accounts.find((a) => a.id === tx.chart_account_id)?.name || "";
    }
  };

  // Quick view: transactions for selected category or total line (all subaccounts included)
  const selectedCategoryTransactions = selectedCategory
    ? selectedCategory.id === "REVENUE_GROUP"
      ? journalEntries.filter((tx) => getAllGroupAccountIds(revenueRows).includes(tx.chart_account_id))
      : selectedCategory.id === "COGS_GROUP"
      ? journalEntries.filter((tx) => getAllGroupAccountIds(cogsRows).includes(tx.chart_account_id))
      : selectedCategory.id === "EXPENSE_GROUP"
      ? journalEntries.filter((tx) => getAllGroupAccountIds(expenseRows).includes(tx.chart_account_id))
      : journalEntries.filter((tx) => getAllAccountIds(selectedCategory).includes(tx.chart_account_id))
    : [];

  const handleSaveTransaction = async (updatedTx: Transaction) => {
    try {
      // Delete existing journal entries for this transaction
      await supabase.from("journal").delete().eq("transaction_id", updatedTx.transaction_id);

      // Create new journal entries
      const { error } = await supabase.from("journal").insert([
        {
          id: uuidv4(),
          transaction_id: updatedTx.transaction_id,
          date: updatedTx.date,
          description: updatedTx.description,
          chart_account_id: updatedTx.chart_account_id,
          debit: updatedTx.debit,
          credit: updatedTx.credit,
        },
      ]);

      if (error) throw error;

      setEditModal({ isOpen: false, transaction: null });

      // Refresh data
      const { data: accountsData } = await supabase
        .from("chart_of_accounts")
        .select("*")
        .in("type", ["Revenue", "COGS", "Expense"]);
      setAccounts(accountsData || []);

      let journalQuery = supabase.from("journal").select("*");
      if (startDate && endDate) {
        journalQuery = journalQuery.gte("date", startDate).lte("date", endDate);
      }
      const { data: journalData } = await journalQuery;
      setJournalEntries(journalData || []);
    } catch (error) {
      console.error("Error updating transaction:", error);
      alert("Failed to update transaction. Please try again.");
    }
  };

  // Helper: get months between start and end date
  const getMonthsInRange = () => {
    const months: string[] = [];
    
    // Parse dates as local dates to avoid timezone issues
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    
    const start = new Date(startYear, startMonth - 1, startDay); // Month is 0-indexed
    const end = new Date(endYear, endMonth - 1, endDay);

    // Start from the first day of the start month
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    
    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0'); // Convert back to 1-indexed
      months.push(`${year}-${month}`); // Format: YYYY-MM
      
      // Move to next month
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    return months;
  };

  // Helper: format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  };

  // Helper: calculate account total for a specific month
  const calculateAccountTotalForMonth = (account: Account, month: string): number => {
    if (account.type === "Revenue") {
      return journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date.startsWith(month))
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
    } else if (account.type === "Expense" || account.type === "COGS") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date.startsWith(month))
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date.startsWith(month))
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    }
    return 0;
  };

  // Helper: calculate roll-up total for an account for a specific month
  const calculateAccountTotalForMonthWithSubaccounts = (account: Account, month: string): number => {
    let total = calculateAccountTotalForMonth(account, month);
    const subaccounts = getSubaccounts(account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotalForMonthWithSubaccounts(sub, month);
    }
    return total;
  };

  // Helper: get previous period date range
  const getPreviousPeriodRange = (start: Date, end: Date): { start: Date; end: Date } => {
    const duration = end.getTime() - start.getTime();
    const previousStart = new Date(start.getTime() - duration);
    const previousEnd = new Date(start.getTime() - 1); // One day before current period starts

    // Ensure dates are set to start and end of day in local timezone
    previousStart.setHours(0, 0, 0, 0);
    previousEnd.setHours(23, 59, 59, 999);

    return { start: previousStart, end: previousEnd };
  };

  // Helper: calculate account total for a date range
  const calculateAccountTotalForRange = (account: Account, start: Date, end: Date): number => {
    const startStr = formatDate(start);
    const endStr = formatDate(end);

    if (account.type === "Revenue") {
      return journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date >= startStr && tx.date <= endStr)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
    } else if (account.type === "Expense" || account.type === "COGS") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date >= startStr && tx.date <= endStr)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date >= startStr && tx.date <= endStr)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    }
    return 0;
  };

  // Helper: calculate roll-up total for an account for a date range
  const calculateAccountTotalForRangeWithSubaccounts = (account: Account, start: Date, end: Date): number => {
    let total = calculateAccountTotalForRange(account, start, end);
    const subaccounts = getSubaccounts(account.id).filter(hasTransactions);
    for (const sub of subaccounts) {
      total += calculateAccountTotalForRangeWithSubaccounts(sub, start, end);
    }
    return total;
  };

  // Calculate previous period totals for a group of accounts
  const calculatePreviousPeriodTotal = (accounts: Account[]): number => {
    const previousRange = getPreviousPeriodRange(new Date(startDate), new Date(endDate));
    return accounts.reduce(
      (sum, a) => sum + calculateAccountTotalForRangeWithSubaccounts(a, previousRange.start, previousRange.end),
      0
    );
  };

  // Calculate previous period variance
  const calculatePreviousPeriodVariance = (currentTotal: number, accounts: Account[]): number => {
    const previousTotal = calculatePreviousPeriodTotal(accounts);
    return currentTotal - previousTotal;
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercentage = (num: number, base: number): string => {
    if (base === 0) return "—";
    const percentage = (num / Math.abs(base)) * 100;
    return `${percentage.toFixed(1)}%`;
  };

  // Helper function to get appropriate base for percentage calculation
  const getPercentageBase = (accountType: string): number => {
    if (totalRevenue !== 0) {
      return totalRevenue; // Normal case: use revenue as base
    }
    // When revenue is zero, use appropriate totals
    switch (accountType) {
      case "Expense":
        return totalExpenses;
      case "COGS":
        return totalCOGS;
      default:
        return totalRevenue;
    }
  };

  const formatPercentageForAccount = (num: number, account: Account): string => {
    const base = getPercentageBase(account.type);
    if (base === 0) return "—";
    const percentage = (num / Math.abs(base)) * 100;
    return `${percentage.toFixed(1)}%`;
  };

  const calculatePercentageForMonth = (amount: number, month: string): string => {
    const monthRevenue = revenueRows.reduce(
      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
      0
    );
    return formatPercentage(amount, monthRevenue);
  };

  // Helper: calculate display amount for P&L transactions
  const getTransactionDisplayAmount = (tx: Transaction, accountType: string): number => {
    if (accountType === "Revenue") {
      // For revenue: credits are positive, debits are negative
      return Number(tx.credit) - Number(tx.debit);
    } else if (accountType === "Expense" || accountType === "COGS") {
      // For expenses/COGS: debits are positive, credits are negative
      return Number(tx.debit) - Number(tx.credit);
    }
    return Number(tx.debit); // fallback
  };

  // Export function
  const exportToCSV = () => {
    const csvData = [];
    csvData.push(["Profit & Loss", `${startDate} to ${endDate}`]);
    csvData.push([""]);

    // Revenue
    csvData.push(["REVENUE", ""]);
    revenueRows.forEach((account) => {
      csvData.push([account.name, calculateAccountTotal(account).toFixed(2)]);
      getSubaccounts(account.id)
        .filter(hasTransactions)
        .forEach((sub) => {
          csvData.push([`  ${sub.name}`, calculateAccountTotal(sub).toFixed(2)]);
        });
    });
    csvData.push(["Total Revenue", totalRevenue.toFixed(2)]);
    csvData.push([""]);

    // COGS
    if (cogsRows.length > 0) {
      csvData.push(["COST OF GOODS SOLD", ""]);
      cogsRows.forEach((account) => {
        csvData.push([account.name, calculateAccountTotal(account).toFixed(2)]);
        getSubaccounts(account.id)
          .filter(hasTransactions)
          .forEach((sub) => {
            csvData.push([`  ${sub.name}`, calculateAccountTotal(sub).toFixed(2)]);
          });
      });
      csvData.push(["Total COGS", totalCOGS.toFixed(2)]);
      csvData.push([""]);
      csvData.push(["Gross Profit", grossProfit.toFixed(2)]);
      csvData.push([""]);
    }

    // Expenses
    csvData.push(["EXPENSES", ""]);
    expenseRows.forEach((account) => {
      csvData.push([account.name, calculateAccountTotal(account).toFixed(2)]);
      getSubaccounts(account.id)
        .filter(hasTransactions)
        .forEach((sub) => {
          csvData.push([`  ${sub.name}`, calculateAccountTotal(sub).toFixed(2)]);
        });
    });
    csvData.push(["Total Expenses", totalExpenses.toFixed(2)]);
    csvData.push([""]);
    csvData.push(["Net Income", netIncome.toFixed(2)]);

    const csvContent = csvData.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `profit-loss-${startDate}-to-${endDate}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper: render account row with monthly totals
  const renderAccountRowWithMonthlyTotals = (account: Account, level = 0) => {
    const subaccounts = getSubaccounts(account.id).filter(hasTransactions);
    const isParent = subaccounts.length > 0;
    const isCollapsed = collapsedAccounts.has(account.id);
    const months = getMonthsInRange();

    // If this account and all its subaccounts have no transactions in any month, do not render
    const hasAnyTransactions = months.some(
      (month) => calculateAccountTotalForMonthWithSubaccounts(account, month) !== 0
    );
    if (!hasAnyTransactions) return null;

    return (
      <React.Fragment key={account.id}>
        <tr
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => {
            setSelectedCategory(account);
            setViewerModal({ isOpen: true, category: account });
          }}
        >
          <td className="border p-1" style={{ paddingLeft: `${level * 20 + 8}px` }}>
            <div className="flex items-center">
              {level > 0 && <span className="text-gray-400 mr-2 text-xs">└</span>}
              {isParent ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAccount(account.id);
                  }}
                  className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-gray-600" />
                  )}
                </button>
              ) : (
                !level && <div className="mr-2 w-5"></div>
              )}
              <span>{account.name}</span>
            </div>
          </td>
          {months.map((month) => (
            <React.Fragment key={month}>
              <td className="border p-1 text-right">
                {formatNumber(
                  isParent && isCollapsed
                    ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                    : calculateAccountTotalForMonth(account, month)
                )}
              </td>
              {showPercentages && (
                <td className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentageForAccount(
                    isParent && isCollapsed
                      ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                      : calculateAccountTotalForMonth(account, month),
                    account
                  )}
                </td>
              )}
            </React.Fragment>
          ))}
          <td className="border p-1 text-right font-semibold">
            {formatNumber(
              isParent && isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)
            )}
          </td>
                        {showPercentages && (
                <td className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentageForAccount(
                    isParent && isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
                    account
                  )}
                </td>
              )}
        </tr>
        {!isCollapsed && subaccounts.map((sub) => renderAccountRowWithMonthlyTotals(sub, level + 1))}
        {isParent && !isCollapsed && (
          <tr
            key={`${account.id}-total`}
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => {
              setSelectedCategory(account);
              setViewerModal({ isOpen: true, category: account });
            }}
          >
            <td className="border p-1 font-semibold bg-gray-50" style={{ paddingLeft: `${level * 20 + 8}px` }}>
              <div className="flex items-center">
                <div className="mr-2 w-5"></div>
                <span>Total {account.name}</span>
              </div>
            </td>
            {months.map((month) => (
              <React.Fragment key={month}>
                <td className="border p-1 text-right font-semibold bg-gray-50">
                  {formatNumber(calculateAccountTotalForMonthWithSubaccounts(account, month))}
                </td>
                {showPercentages && (
                  <td className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                    {formatPercentageForAccount(calculateAccountTotalForMonthWithSubaccounts(account, month), account)}
                  </td>
                )}
              </React.Fragment>
            ))}
            <td className="border p-1 text-right font-semibold bg-gray-50">
              {formatNumber(calculateAccountTotal(account))}
            </td>
            {showPercentages && (
              <td className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                {formatPercentageForAccount(calculateAccountTotal(account), account)}
              </td>
            )}
          </tr>
        )}
      </React.Fragment>
    );
  };

  // Helper: render account row for regular view
  const renderAccountRowWithPreviousPeriod = (account: Account, level = 0) => {
    const subaccounts = getSubaccounts(account.id).filter(hasTransactions);
    const isParent = subaccounts.length > 0;
    const isCollapsed = collapsedAccounts.has(account.id);
    const currentTotal = calculateAccountTotal(account);
    const directTotal = calculateAccountDirectTotal(account);
    const previousRange = showPreviousPeriod ? getPreviousPeriodRange(new Date(startDate), new Date(endDate)) : null;
    const previousTotal = previousRange
      ? calculateAccountTotalForRangeWithSubaccounts(account, previousRange.start, previousRange.end)
      : 0;
    const directPreviousTotal = previousRange
      ? calculateAccountTotalForRange(account, previousRange.start, previousRange.end)
      : 0;
    const variance =
      (isParent && isCollapsed ? currentTotal : directTotal) -
      (isParent && isCollapsed ? previousTotal : directPreviousTotal);

    return (
      <React.Fragment key={account.id}>
        <tr
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => {
            setSelectedCategory(account);
            setViewerModal({ isOpen: true, category: account });
          }}
        >
          <td className="border p-1" style={{ paddingLeft: `${level * 20 + 8}px`, width: "30%" }}>
            <div className="flex items-center">
              {level > 0 && <span className="text-gray-400 mr-2 text-xs">└</span>}
              {isParent ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAccount(account.id);
                  }}
                  className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-gray-600" />
                  )}
                </button>
              ) : (
                !level && <div className="mr-2 w-5"></div>
              )}
              <span>{account.name}</span>
            </div>
          </td>
          <td className="border p-1 text-right" style={{ width: "20%" }}>
            {formatNumber(isParent && isCollapsed ? currentTotal : directTotal)}
          </td>
          {showPercentages && (
            <td className="border p-1 text-right text-sm text-slate-600">
              {formatPercentageForAccount(isParent && isCollapsed ? currentTotal : directTotal, account)}
            </td>
          )}
          {showPreviousPeriod && (
            <>
              <td className="border p-1 text-right" style={{ width: "20%" }}>
                {formatNumber(isParent && isCollapsed ? previousTotal : directPreviousTotal)}
              </td>
              {showPercentages && (
                <td className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentage(isParent && isCollapsed ? previousTotal : directPreviousTotal, calculatePreviousPeriodTotal(revenueRows))}
                </td>
              )}
              <td className="border p-1 text-right" style={{ width: "20%" }}>
                {formatNumber(variance)}
              </td>
            </>
          )}
        </tr>
        {!isCollapsed && subaccounts.map((sub) => renderAccountRowWithPreviousPeriod(sub, level + 1))}
        {isParent && !isCollapsed && (
          <tr
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => {
              setSelectedCategory(account);
              setViewerModal({ isOpen: true, category: account });
            }}
          >
            <td
              className="border p-1 font-semibold bg-gray-50"
              style={{ paddingLeft: `${level * 20 + 8}px`, width: "30%" }}
            >
              <div className="flex items-center">
                <div className="mr-2 w-5"></div>
                <span>Total {account.name}</span>
              </div>
            </td>
            <td className="border p-1 text-right font-semibold bg-gray-50" style={{ width: "20%" }}>
              {formatNumber(currentTotal)}
            </td>
            {showPercentages && (
              <td className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                {formatPercentageForAccount(currentTotal, account)}
              </td>
            )}
            {showPreviousPeriod && (
              <>
                <td className="border p-1 text-right font-semibold bg-gray-50" style={{ width: "20%" }}>
                  {formatNumber(previousTotal)}
                </td>
                {showPercentages && (
                  <td className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                    {formatPercentage(previousTotal, calculatePreviousPeriodTotal(revenueRows))}
                  </td>
                )}
                <td className="border p-1 text-right font-semibold bg-gray-50" style={{ width: "20%" }}>
                  {formatNumber(currentTotal - previousTotal)}
                </td>
              </>
            )}
          </tr>
        )}
      </React.Fragment>
    );
  };

  // Check if user has company context
  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-sm text-yellow-700">
            Please select a company from the dropdown in the navigation bar to view profit & loss reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-3">Profit & Loss</h1>
          {/* Period Selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex justify-center">
                <PeriodSelector
                  selectedPeriod={selectedPeriod}
                  onPeriodChange={handlePeriodChange}
                  selectedDisplay={selectedDisplay}
                  onDisplayChange={handleDisplayChange}
                  selectedComparison={selectedComparison}
                  onComparisonChange={handleComparisonChange}
                />
              </div>

                              {/* Manual date override option */}
                <div className="flex items-center justify-center gap-4 text-sm">
                  
                  <Input 
                    type="date" 
                    value={startDate} 
                    max={endDate || today}
                    onChange={(e) => {
                      const newStartDate = e.target.value;
                      setStartDate(newStartDate);
                      // If start date is after end date, update end date
                      if (endDate && newStartDate > endDate) {
                        setEndDate(newStartDate);
                      }
                    }} 
                    className="w-auto text-sm h-8 transition-none" 
                  />
                  <span className="text-slate-600">to</span>
                  <Input 
                    type="date" 
                    value={endDate} 
                    min={startDate}
                    max={today}
                    onChange={(e) => {
                      const newEndDate = e.target.value;
                      
                      // Prevent setting end date in the future
                      if (newEndDate > today) {
                        setEndDate(today);
                        return;
                      }
                      
                      setEndDate(newEndDate);
                      // If end date is before start date, update start date
                      if (startDate && newEndDate < startDate) {
                        setStartDate(newEndDate);
                      }
                    }} 
                    className="w-auto text-sm h-8 transition-none" 
                  />
                </div>
            </div>

            <div className="flex justify-center">
              <Button onClick={exportToCSV} className="text-sm font-medium">
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* P&L Table */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700" style={{ width: "25%" }}>Account</th>
                  {isMonthlyView ? (
                    <>
                      {getMonthsInRange().map((month) => (
                        <React.Fragment key={month}>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700" style={{ width: showPercentages ? `${35 / ((getMonthsInRange().length + 1) * 2)}%` : `${75 / (getMonthsInRange().length + 1)}%` }}>
                            {formatMonth(month)}
                          </th>
                          {showPercentages && (
                            <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs" style={{ width: `${40 / ((getMonthsInRange().length + 1) * 2)}%` }}>
                              %
                            </th>
                          )}
                        </React.Fragment>
                      ))}
                      <th className="px-4 py-3 text-right font-semibold text-slate-700" style={{ width: showPercentages ? `${35 / ((getMonthsInRange().length + 1) * 2)}%` : `${75 / (getMonthsInRange().length + 1)}%` }}>Total</th>
                      {showPercentages && (
                        <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs" style={{ width: `${40 / ((getMonthsInRange().length + 1) * 2)}%` }}>
                          %
                        </th>
                      )}
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700" style={{ width: showPercentages ? "20%" : "25%" }}>Total</th>
                      {showPercentages && (
                        <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs" style={{ width: "15%" }}>%</th>
                      )}
                      {showPreviousPeriod && (
                        <>
                          <th className="px-4 py-3 text-right font-semibold text-slate-700" style={{ width: showPercentages ? "20%" : "25%" }}>Previous Period</th>
                          {showPercentages && (
                            <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs" style={{ width: "15%" }}>%</th>
                          )}
                          <th className="px-4 py-3 text-right font-semibold text-slate-700" style={{ width: showPercentages ? "20%" : "25%" }}>Difference</th>
                        </>
                      )}
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  /* Loading State */
                  <>
                    {/* REVENUE SECTION */}
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <td 
                        colSpan={
                          isMonthlyView 
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod 
                              ? (showPercentages ? 6 : 4)
                              : (showPercentages ? 3 : 2)
                        }
                        className="px-4 py-3 font-bold text-slate-800 text-sm tracking-wide"
                      >
                        REVENUE
                      </td>
                    </tr>
                    <tr>
                      <td 
                        colSpan={
                          isMonthlyView 
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod 
                              ? (showPercentages ? 6 : 4)
                              : (showPercentages ? 3 : 2)
                        }
                        className="px-4 py-8 text-center border-b border-slate-100"
                      >
                        <div className="flex flex-col items-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                          <span className="text-sm text-slate-500">Loading revenue accounts...</span>
                        </div>
                      </td>
                    </tr>

                    {/* COGS SECTION */}
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <td 
                        colSpan={
                          isMonthlyView 
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod 
                              ? (showPercentages ? 6 : 4)
                              : (showPercentages ? 3 : 2)
                        }
                        className="px-4 py-3 font-bold text-slate-800 text-sm tracking-wide"
                      >
                        COST OF GOODS SOLD
                      </td>
                    </tr>
                    <tr>
                      <td 
                        colSpan={
                          isMonthlyView 
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod 
                              ? (showPercentages ? 6 : 4)
                              : (showPercentages ? 3 : 2)
                        }
                        className="px-4 py-8 text-center border-b border-slate-100"
                      >
                        <div className="flex flex-col items-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                          <span className="text-sm text-slate-500">Loading COGS accounts...</span>
                        </div>
                      </td>
                    </tr>

                    {/* EXPENSES SECTION */}
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <td 
                        colSpan={
                          isMonthlyView 
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod 
                              ? (showPercentages ? 6 : 4)
                              : (showPercentages ? 3 : 2)
                        }
                        className="px-4 py-3 font-bold text-slate-800 text-sm tracking-wide"
                      >
                        EXPENSES
                      </td>
                    </tr>
                    <tr>
                      <td 
                        colSpan={
                          isMonthlyView 
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod 
                              ? (showPercentages ? 6 : 4)
                              : (showPercentages ? 3 : 2)
                        }
                        className="px-4 py-8 text-center border-b border-slate-100"
                      >
                        <div className="flex flex-col items-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
                          <span className="text-sm text-slate-500">Loading expense accounts...</span>
                        </div>
                      </td>
                    </tr>
                  </>
                ) : (
                  /* Normal Content */
                  <>
                {/* Revenue */}
                <tr className="bg-slate-100 border-b border-slate-200">
                  <td
                    colSpan={
                      isMonthlyView 
                        ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                        : showPreviousPeriod 
                          ? (showPercentages ? 6 : 4)
                          : (showPercentages ? 3 : 2)
                    }
                    className="px-4 py-3 font-bold text-slate-800 text-sm tracking-wide"
                  >
                    REVENUE
                  </td>
                </tr>
                {revenueRows.map((row) => {
                  if (isMonthlyView) {
                    return renderAccountRowWithMonthlyTotals(row);
                  } else {
                    return renderAccountRowWithPreviousPeriod(row);
                  }
                })}
                {/* Total Revenue */}
                <tr
                  className="cursor-pointer hover:bg-blue-50"
                  onClick={() => {
                    setSelectedCategory({
                      id: "REVENUE_GROUP",
                      name: "Total Revenue",
                      type: "Revenue",
                      parent_id: null,
                    });
                    setViewerModal({
                      isOpen: true,
                      category: { id: "REVENUE_GROUP", name: "Total Revenue", type: "Revenue", parent_id: null },
                    });
                  }}
                >
                  <td className="border p-1 font-semibold" style={{ width: "30%" }}>
                    Total Revenue
                  </td>
                            {isMonthlyView ? (
            <>
              {getMonthsInRange().map((month) => (
                <React.Fragment key={month}>
                  <td className="border p-1 text-right font-semibold">
                    {formatNumber(
                      revenueRows.reduce(
                        (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                        0
                      )
                    )}
                  </td>
                  {showPercentages && (
                    <td className="border p-1 text-right text-xs text-slate-600">
                      {calculatePercentageForMonth(
                        revenueRows.reduce(
                          (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                          0
                        ),
                        month
                      )}
                    </td>
                  )}
                </React.Fragment>
              ))}
              <td className="border p-1 text-right font-semibold">{formatNumber(totalRevenue)}</td>
              {showPercentages && (
                <td className="border p-1 text-right text-sm font-bold text-slate-600">
                  {totalRevenue !== 0 ? "100.0%" : "—"}
                </td>
              )}
            </>
          ) : (
                                <>
              <td className="border p-1 text-right font-semibold" style={{ width: "20%" }}>
                {formatNumber(totalRevenue)}
              </td>
              {showPercentages && (
                <td className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentage(totalRevenue, totalRevenue)}
                </td>
              )}
              {showPreviousPeriod && (
                <>
                  <td className="border p-1 text-right font-semibold" style={{ width: "20%" }}>
                    {formatNumber(calculatePreviousPeriodTotal(revenueRows))}
                  </td>
                                {showPercentages && (
                <td className="border p-1 text-right text-sm font-bold text-slate-600">
                  {calculatePreviousPeriodTotal(revenueRows) !== 0 ? "100.0%" : "—"}
                </td>
              )}
                  <td className="border p-1 text-right font-semibold" style={{ width: "20%" }}>
                    {formatNumber(calculatePreviousPeriodVariance(totalRevenue, revenueRows))}
                  </td>
                </>
              )}
            </>
                  )}
                </tr>

                {/* COGS */}
                <tr>
                  <td
                    colSpan={
                      isMonthlyView 
                        ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                        : showPreviousPeriod 
                          ? (showPercentages ? 6 : 4)
                          : (showPercentages ? 3 : 2)
                    }
                    className="border p-1 font-semibold"
                  >
                    Cost of Goods Sold (COGS)
                  </td>
                </tr>
                {cogsRows.map((row) => {
                  if (isMonthlyView) {
                    return renderAccountRowWithMonthlyTotals(row);
                  } else {
                    return renderAccountRowWithPreviousPeriod(row);
                  }
                })}
                {/* Total COGS */}
                <tr
                  className="cursor-pointer hover:bg-blue-50"
                  onClick={() => {
                    setSelectedCategory({ id: "COGS_GROUP", name: "Total COGS", type: "COGS", parent_id: null });
                    setViewerModal({
                      isOpen: true,
                      category: { id: "COGS_GROUP", name: "Total COGS", type: "COGS", parent_id: null },
                    });
                  }}
                >
                  <td className="border p-1 font-semibold">Total COGS</td>
                  {isMonthlyView ? (
                    <>
                      {getMonthsInRange().map((month) => (
                        <React.Fragment key={month}>
                          <td className="border p-1 text-right font-semibold">
                            {formatNumber(
                              cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0)
                            )}
                          </td>
                          {showPercentages && (
                            <td className="border p-1 text-right text-xs text-slate-600">
                              {calculatePercentageForMonth(
                                cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0),
                                month
                              )}
                            </td>
                          )}
                        </React.Fragment>
                      ))}
                      <td className="border p-1 text-right font-semibold">{formatNumber(totalCOGS)}</td>
                      {showPercentages && (
                        <td className="border p-1 text-right text-sm font-bold text-slate-600">
                          {totalRevenue !== 0 ? formatPercentage(totalCOGS, totalRevenue) : (totalCOGS !== 0 ? "100.0%" : "—")}
                        </td>
                      )}
                    </>
                  ) : (
                    <>
                      <td className="border p-1 text-right font-semibold w-[150px]">{formatNumber(totalCOGS)}</td>
                      {showPercentages && (
                        <td className="border p-1 text-right text-sm font-bold text-slate-600">
                          {totalRevenue !== 0 ? formatPercentage(totalCOGS, totalRevenue) : (totalCOGS !== 0 ? "100.0%" : "—")}
                        </td>
                      )}
                      {showPreviousPeriod && (
                        <>
                          <td className="border p-1 text-right font-semibold w-[150px]">
                            {formatNumber(calculatePreviousPeriodTotal(cogsRows))}
                          </td>
                          {showPercentages && (
                            <td className="border p-1 text-right text-xs text-slate-600">
                              {formatPercentage(calculatePreviousPeriodTotal(cogsRows), calculatePreviousPeriodTotal(revenueRows))}
                            </td>
                          )}
                          <td className="border p-1 text-right font-semibold w-[150px]">
                            {formatNumber(calculatePreviousPeriodVariance(totalCOGS, cogsRows))}
                          </td>
                        </>
                      )}
                    </>
                  )}
                </tr>

                {/* Gross Profit */}
                <tr className="bg-gray-50 font-semibold">
                  <td className="border p-1" style={{ width: "25%" }}>
                    Gross Profit
                  </td>
                  {isMonthlyView &&
                    getMonthsInRange().map((month) => (
                      <React.Fragment key={month}>
                        <td className="border p-1 text-right" style={{ width: "15%" }}>
                          {formatNumber(
                            revenueRows.reduce(
                              (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                              0
                            ) -
                              cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0)
                          )}
                        </td>
                        {showPercentages && (
                          <td className="border p-1 text-right text-xs text-slate-600">
                            {calculatePercentageForMonth(
                              revenueRows.reduce(
                                (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                0
                              ) -
                                cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0),
                              month
                            )}
                          </td>
                        )}
                      </React.Fragment>
                    ))}
                  <td className="border p-1 text-right" style={{ width: "15%" }}>
                    {formatNumber(grossProfit)}
                  </td>
                  {showPercentages && isMonthlyView && (
                    <td className="border p-1 text-right text-sm font-bold text-slate-600">
                      {totalRevenue !== 0 ? formatPercentage(grossProfit, totalRevenue) : "—"}
                    </td>
                  )}
                </tr>

                {/* Expenses */}
                <tr>
                  <td
                    colSpan={
                      isMonthlyView 
                        ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                        : showPreviousPeriod 
                          ? (showPercentages ? 6 : 4)
                          : (showPercentages ? 3 : 2)
                    }
                    className="border p-1 font-semibold"
                  >
                    Expenses
                  </td>
                </tr>
                {expenseRows.map((row) => {
                  if (isMonthlyView) {
                    return renderAccountRowWithMonthlyTotals(row);
                  } else {
                    return renderAccountRowWithPreviousPeriod(row);
                  }
                })}
                {/* Total Expenses */}
                <tr
                  className="cursor-pointer hover:bg-blue-50"
                  onClick={() => {
                    setSelectedCategory({
                      id: "EXPENSE_GROUP",
                      name: "Total Expenses",
                      type: "Expense",
                      parent_id: null,
                    });
                    setViewerModal({
                      isOpen: true,
                      category: { id: "EXPENSE_GROUP", name: "Total Expenses", type: "Expense", parent_id: null },
                    });
                  }}
                >
                  <td className="border p-1 font-semibold">Total Expenses</td>
                  {isMonthlyView ? (
                    <>
                      {getMonthsInRange().map((month) => (
                        <React.Fragment key={month}>
                          <td className="border p-1 text-right font-semibold">
                            {formatNumber(
                              expenseRows.reduce(
                                (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                0
                              )
                            )}
                          </td>
                          {showPercentages && (
                            <td className="border p-1 text-right text-xs text-slate-600">
                              {calculatePercentageForMonth(
                                expenseRows.reduce(
                                  (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                  0
                                ),
                                month
                              )}
                            </td>
                          )}
                        </React.Fragment>
                      ))}
                      <td className="border p-1 text-right font-semibold">{formatNumber(totalExpenses)}</td>
                      {showPercentages && (
                        <td className="border p-1 text-right text-sm font-bold text-slate-600">
                          {totalRevenue !== 0 ? formatPercentage(totalExpenses, totalRevenue) : (totalExpenses !== 0 ? "100.0%" : "—")}
                        </td>
                      )}
                    </>
                  ) : (
                    <>
                      <td className="border p-1 text-right font-semibold w-[150px]">{formatNumber(totalExpenses)}</td>
                      {showPercentages && (
                        <td className="border p-1 text-right text-sm font-bold text-slate-600">
                          {totalRevenue !== 0 ? formatPercentage(totalExpenses, totalRevenue) : (totalExpenses !== 0 ? "100.0%" : "—")}
                        </td>
                      )}
                      {showPreviousPeriod && (
                        <>
                          <td className="border p-1 text-right font-semibold w-[150px]">
                            {formatNumber(calculatePreviousPeriodTotal(expenseRows))}
                          </td>
                          {showPercentages && (
                            <td className="border p-1 text-right text-xs text-slate-600">
                              {formatPercentage(calculatePreviousPeriodTotal(expenseRows), calculatePreviousPeriodTotal(revenueRows))}
                            </td>
                          )}
                          <td className="border p-1 text-right font-semibold w-[150px]">
                            {formatNumber(calculatePreviousPeriodVariance(totalExpenses, expenseRows))}
                          </td>
                        </>
                      )}
                    </>
                  )}
                </tr>

                {/* Net Income */}
                <tr className="bg-gray-50 font-bold">
                  <td className="border p-1" style={{ width: "25%" }}>
                    Net Income
                  </td>
                  {isMonthlyView ? (
                    <>
                      {getMonthsInRange().map((month) => (
                        <React.Fragment key={month}>
                          <td className="border p-1 text-right" style={{ width: "15%" }}>
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
                          </td>
                          {showPercentages && (
                            <td className="border p-1 text-right text-xs text-slate-600">
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
                            </td>
                          )}
                        </React.Fragment>
                      ))}
                      <td className="border p-1 text-right" style={{ width: "15%" }}>
                        {formatNumber(netIncome)}
                      </td>
                      {showPercentages && (
                        <td className="border p-1 text-right text-sm font-bold text-slate-600">
                          {totalRevenue !== 0 ? formatPercentage(netIncome, totalRevenue) : "—"}
                        </td>
                      )}
                    </>
                  ) : (
                    <>
                      <td className="border p-1 text-right w-[150px]">{formatNumber(netIncome)}</td>
                      {showPercentages && (
                        <td className="border p-1 text-right text-sm font-bold text-slate-600">
                          {totalRevenue !== 0 ? formatPercentage(netIncome, totalRevenue) : "—"}
                        </td>
                      )}
                      {showPreviousPeriod && (
                        <>
                          <td className="border p-1 text-right w-[150px]">
                            {formatNumber(
                              (() => {
                                const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
                                const previousCOGS = calculatePreviousPeriodTotal(cogsRows);
                                const previousExpenses = calculatePreviousPeriodTotal(expenseRows);
                                return previousRevenue - previousCOGS - previousExpenses;
                              })()
                            )}
                          </td>
                          {showPercentages && (
                            <td className="border p-1 text-right text-xs text-slate-600">
                              {formatPercentage(
                                (() => {
                                  const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
                                  const previousCOGS = calculatePreviousPeriodTotal(cogsRows);
                                  const previousExpenses = calculatePreviousPeriodTotal(expenseRows);
                                  return previousRevenue - previousCOGS - previousExpenses;
                                })(),
                                calculatePreviousPeriodTotal(revenueRows)
                              )}
                            </td>
                          )}
                          <td className="border p-1 text-right w-[150px]">
                            {formatNumber(
                              (() => {
                                const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
                                const previousCOGS = calculatePreviousPeriodTotal(cogsRows);
                                const previousExpenses = calculatePreviousPeriodTotal(expenseRows);
                                const previousNetIncome = previousRevenue - previousCOGS - previousExpenses;
                                return netIncome - previousNetIncome;
                              })()
                            )}
                          </td>
                        </>
                      )}
                    </>
                  )}
                </tr>
                  </>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Viewer Modal */}
      {viewerModal.isOpen && viewerModal.category && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[800px] max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">{viewerModal.category.name} Transactions</h2>
              <button
                onClick={() => setViewerModal({ isOpen: false, category: null })}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <div className="p-4 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2">Category</th>
                    <th className="text-right p-2">Amount</th>
                    <th className="text-center p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCategoryTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      {editingTransaction?.id === tx.id ? (
                        <>
                          <td className="p-2">
                            <input
                              type="date"
                              value={editingTransaction.date}
                              onChange={(e) =>
                                setEditingTransaction((prev) => (prev ? { ...prev, date: e.target.value } : null))
                              }
                              className="w-full border px-2 py-1 rounded"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editingTransaction.description}
                              onChange={(e) =>
                                setEditingTransaction((prev) =>
                                  prev ? { ...prev, description: e.target.value } : null
                                )
                              }
                              className="w-full border px-2 py-1 rounded"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={
                                viewerModal.category?.type === "Revenue"
                                  ? editingTransaction.chart_account_id
                                  : editingTransaction.chart_account_id
                              }
                              onChange={(e) => {
                                const accountId = e.target.value;
                                setEditingTransaction((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        ...(viewerModal.category?.type === "Revenue"
                                          ? { chart_account_id: accountId }
                                          : { chart_account_id: accountId }),
                                      }
                                    : null
                                );
                              }}
                              className="w-full border px-2 py-1 rounded"
                            >
                              <option value="">Select Category</option>
                              {accounts
                                .filter((a) => a.type === viewerModal.category?.type)
                                .map((account) => (
                                  <option key={account.id} value={account.id}>
                                    {account.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editingTransaction.debit === 0 ? "" : editingTransaction.debit.toString()}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === "" || value === "-" || /^-?\d*\.?\d{0,2}$/.test(value)) {
                                  setEditingTransaction((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          debit: value === "" || value === "-" ? 0 : parseFloat(value),
                                        }
                                      : null
                                  );
                                }
                              }}
                              className="w-full border px-2 py-1 rounded text-right"
                            />
                          </td>
                          <td className="p-2 text-center space-x-2">
                            <button
                              onClick={() => handleSaveTransaction(editingTransaction)}
                              className="text-green-600 hover:text-green-800"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingTransaction(null)}
                              className="text-gray-600 hover:text-gray-800"
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2">{tx.date}</td>
                          <td className="p-2">{tx.description}</td>
                          <td className="p-2">
                            {viewerModal.category ? getCategoryName(tx, viewerModal.category) : ""}
                          </td>
                          <td className="p-2 text-right">
                            {formatNumber(getTransactionDisplayAmount(tx, viewerModal.category?.type || ""))}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => setEditingTransaction(tx)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {selectedCategoryTransactions.length > 0 && (
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={3} className="p-2 text-right">
                        Total
                      </td>
                      <td className="p-2 text-right">
                        {formatNumber(
                          selectedCategoryTransactions.reduce(
                            (sum, tx) => sum + getTransactionDisplayAmount(tx, viewerModal.category?.type || ""),
                            0
                          )
                        )}
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
              {selectedCategoryTransactions.length === 0 && (
                <div className="text-gray-500 text-center py-4">No transactions in this category.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editModal.isOpen && editModal.transaction && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-[500px] shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Transaction</h2>
              <button
                onClick={() => setEditModal({ isOpen: false, transaction: null })}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input
                  type="date"
                  value={editModal.transaction.date}
                  onChange={(e) =>
                    setEditModal((prev) => ({
                      ...prev,
                      transaction: prev.transaction
                        ? {
                            ...prev.transaction,
                            date: e.target.value,
                          }
                        : null,
                    }))
                  }
                  className="w-full border px-2 py-1 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={editModal.transaction.description}
                  onChange={(e) =>
                    setEditModal((prev) => ({
                      ...prev,
                      transaction: prev.transaction
                        ? {
                            ...prev.transaction,
                            description: e.target.value,
                          }
                        : null,
                    }))
                  }
                  className="w-full border px-2 py-1 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={
                    selectedCategory?.type === "Revenue"
                      ? editModal.transaction.chart_account_id
                      : editModal.transaction.chart_account_id
                  }
                  onChange={(e) => {
                    const accountId = e.target.value;
                    setEditModal((prev) => ({
                      ...prev,
                      transaction: prev.transaction
                        ? {
                            ...prev.transaction,
                            ...(selectedCategory?.type === "Revenue"
                              ? { chart_account_id: accountId }
                              : { chart_account_id: accountId }),
                          }
                        : null,
                    }));
                  }}
                  className="w-full border px-2 py-1 rounded"
                >
                  <option value="">Select Category</option>
                  {accounts
                    .filter((a) => a.type === selectedCategory?.type)
                    .map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Amount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editModal.transaction.debit === 0 ? "" : editModal.transaction.debit.toString()}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty string, minus sign, and numbers with up to 2 decimal places
                    if (value === "" || value === "-" || /^-?\d*\.?\d{0,2}$/.test(value)) {
                      setEditModal((prev) => ({
                        ...prev,
                        transaction: prev.transaction
                          ? {
                              ...prev.transaction,
                              debit: value === "" || value === "-" ? 0 : parseFloat(value),
                            }
                          : null,
                      }));
                    }
                  }}
                  className="w-full border px-2 py-1 rounded"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setEditModal({ isOpen: false, transaction: null })}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => editModal.transaction && handleSaveTransaction(editModal.transaction)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
