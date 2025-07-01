"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "@/zustand/authStore";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodSelector } from "@/components/ui/period-selector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ExcelJS from "exceljs";

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
  source: "journal" | "manual";
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
  // eslint-disable-next-line
  const [showPreviousPeriod, setShowPreviousPeriod] = useState(false);
  const [showPercentages, setShowPercentages] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);

  // Period Selector state
  const [selectedPeriod, setSelectedPeriod] = useState("thisYearToLastMonth");
  const [selectedDisplay, setSelectedDisplay] = useState("byMonth");
  // const [selectedComparison, setSelectedComparison] = useState("none");
  const [viewerModal, setViewerModal] = useState<{
    isOpen: boolean;
    category: Account | null;
    selectedMonth?: string;
  }>({
    isOpen: false,
    category: null,
  });
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

  // Helper: parse date string and format for display without timezone issues
  const formatDateForDisplay = (dateString: string): string => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

  // const handleComparisonChange = (comparison: string) => {
  //   setSelectedComparison(comparison);
  //   // Map comparison options to existing state
  //   setShowPreviousPeriod(comparison === "previousPeriod" || comparison === "previousYear");
  // };

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
  const today = React.useMemo(() => new Date().toISOString().split("T")[0], []);

  useEffect(() => {
    // Initialize with the default period setting instead of hardcoded dates
    handlePeriodChange("thisYearToLastMonth");
  }, []); // Empty dependency array so it only runs once on mount

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

        // Fetch ALL journal entries with pagination to handle more than 1000 rows
        let allJournalData: Array<{
          id: string;
          date: string;
          description: string;
          chart_account_id: string;
          debit: number;
          credit: number;
          transaction_id: string;
          company_id: string;
        }> = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        
        // Base query
        let baseQuery = supabase
          .from("journal")
          .select("*")
          .eq("company_id", currentCompany!.id);
          
        // Add date range if provided  
        if (startDate && endDate) {
          baseQuery = baseQuery.gte("date", startDate).lte("date", endDate);
        }
        
        // Fetch all pages of data
        while (hasMore) {
          const { data: journalData, error } = await baseQuery
            .range(page * pageSize, (page + 1) * pageSize - 1)
            .order('date', { ascending: true });
            
          if (error) {
            console.error("Error fetching journal data:", error);
            break;
          }
          
          if (journalData && journalData.length > 0) {
            allJournalData = [...allJournalData, ...journalData];
            page++;
            hasMore = journalData.length === pageSize;
          } else {
            hasMore = false;
          }
        }
        
        console.log(`Total journal entries fetched: ${allJournalData.length}`);

        // Fetch manual journal entries with pagination
        let allManualJournalData: Array<{
          id: string;
          date: string;
          description?: string;
          je_name?: string;
          chart_account_id: string;
          debit: number;
          credit: number;
          reference_number?: string;
          company_id: string;
        }> = [];
        page = 0;
        hasMore = true;
        
        // Base query for manual entries
        let baseManualQuery = supabase
          .from("manual_journal_entries")
          .select("*")
          .eq("company_id", currentCompany!.id);
          
        // Add date range if provided  
        if (startDate && endDate) {
          baseManualQuery = baseManualQuery.gte("date", startDate).lte("date", endDate);
        }
        
        // Fetch all pages of manual journal data
        while (hasMore) {
          const { data: manualJournalData, error } = await baseManualQuery
            .range(page * pageSize, (page + 1) * pageSize - 1)
            .order('date', { ascending: true });
            
          if (error) {
            console.error("Error fetching manual journal data:", error);
            break;
          }
          
          if (manualJournalData && manualJournalData.length > 0) {
            allManualJournalData = [...allManualJournalData, ...manualJournalData];
            page++;
            hasMore = manualJournalData.length === pageSize;
          } else {
            hasMore = false;
          }
        }
        
        console.log(`Total manual journal entries fetched: ${allManualJournalData.length}`);

        // Transform and combine both datasets
        const regularEntries: Transaction[] = allJournalData.map((entry) => ({
          id: entry.id,
          date: entry.date,
          description: entry.description,
          chart_account_id: entry.chart_account_id,
          debit: entry.debit,
          credit: entry.credit,
          transaction_id: entry.transaction_id,
          source: "journal" as const,
        }));

        const manualEntries: Transaction[] = allManualJournalData.map((entry) => ({
          id: entry.id,
          date: entry.date,
          description: entry.description || entry.je_name || "Manual Entry",
          chart_account_id: entry.chart_account_id,
          debit: entry.debit,
          credit: entry.credit,
          transaction_id: entry.reference_number || entry.id,
          source: "manual" as const,
        }));

        // Combine all entries
        const allEntries = [...regularEntries, ...manualEntries];
        setJournalEntries(allEntries);
      } catch (error) {
        console.error("Error fetching P&L data:", error);
      } finally {
        setLoading(false);
      }
    };
    if (startDate && endDate) fetchData();
  }, [startDate, endDate, currentCompany?.id, hasCompanyContext]);

  // Helper: get all subaccounts for a parent, sorted alphabetically
  const getSubaccounts = (parentId: string) => 
    accounts
      .filter((acc) => acc.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));

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
    // Check if the account has any direct transactions at all
    const directTransactions = journalEntries.some((tx) => tx.chart_account_id === account.id);
    if (directTransactions) return true;

    // Check subaccounts recursively
    const subaccounts = getSubaccounts(account.id);
    return subaccounts.some((sub) => hasTransactions(sub));
  };

  // Top-level accounts (no parent) with transactions, sorted alphabetically
  const topLevel = (type: string) => 
    accounts
      .filter((a) => a.type === type && !a.parent_id)
      .filter(hasTransactions)
      .sort((a, b) => a.name.localeCompare(b.name));

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
    ? (() => {
        let transactions =
          selectedCategory.id === "REVENUE_GROUP"
            ? journalEntries.filter((tx) => getAllGroupAccountIds(revenueRows).includes(tx.chart_account_id))
            : selectedCategory.id === "COGS_GROUP"
            ? journalEntries.filter((tx) => getAllGroupAccountIds(cogsRows).includes(tx.chart_account_id))
            : selectedCategory.id === "EXPENSE_GROUP"
            ? journalEntries.filter((tx) => getAllGroupAccountIds(expenseRows).includes(tx.chart_account_id))
            : journalEntries.filter((tx) => getAllAccountIds(selectedCategory).includes(tx.chart_account_id));

        // If a specific month is selected, filter transactions for that month only
        const selectedMonth = viewerModal.selectedMonth;
        if (selectedMonth && typeof selectedMonth === "string") {
          transactions = transactions.filter((tx) => tx.date.startsWith(selectedMonth));
        }

        return transactions;
      })()
    : [];

  // Helper: get months between start and end date
  const getMonthsInRange = () => {
    const months: string[] = [];

    // Parse dates as local dates to avoid timezone issues
    const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
    const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

    const start = new Date(startYear, startMonth - 1, startDay); // Month is 0-indexed
    const end = new Date(endYear, endMonth - 1, endDay);

    // Start from the first day of the start month
    let current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0"); // Convert back to 1-indexed
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
    if (Math.abs(num) < 0.01) return "—"; // Em dash for zero values
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
  const exportToXLSX = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Profit & Loss");

    // Set basic styles
    const companyStyle = { font: { size: 12, bold: true }, alignment: { horizontal: "center" as const } };
    const headerStyle = { 
      font: { bold: true, size: 10 }, 
      alignment: { horizontal: "center" as const }
    };
    const sectionStyle = { 
      font: { bold: true, size: 10 }
    };
    const numberStyle = { 
      font: { size: 10 },
      numFmt: "#,##0.00;(#,##0.00);\"—\"", // Format to show dash for zero values
      alignment: { horizontal: "right" as const }
    };
    // Note: percentStyle is used as the base for other percentage styles
    const totalStyle = { 
      font: { bold: true, size: 10 }, 
      numFmt: "#,##0.00;(#,##0.00);\"—\"", // Format to show dash for zero values
      alignment: { horizontal: "right" as const }
    };
    
    let currentRow = 1;
    const months = isMonthlyView ? getMonthsInRange() : [];
    const totalColumns = isMonthlyView 
      ? 1 + months.length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1)
      : showPercentages ? 3 : 2;

    if (currentCompany) {
      worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = currentCompany.name;
      worksheet.getCell(`A${currentRow}`).style = companyStyle;
      currentRow++;
    }

    // Title and company info at top
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = "Profit & Loss";
    worksheet.getCell(`A${currentRow}`).style = {
      font: { size: 10 },
      alignment: { horizontal: "center" as const },
    };
    currentRow++;
    
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;
    worksheet.getCell(`A${currentRow}`).style = { font: { size: 10 }, alignment: { horizontal: "center" as const } };
    currentRow++;

    // Table headers
    let colIndex = 1;
    worksheet.getCell(currentRow, colIndex++).value = "Account";
    worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;

    if (isMonthlyView) {
      months.forEach((month) => {
        worksheet.getCell(currentRow, colIndex++).value = formatMonth(month);
        worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
          if (showPercentages) {
          worksheet.getCell(currentRow, colIndex++).value = "%";
          worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
        }
      });
      worksheet.getCell(currentRow, colIndex++).value = "Total";
      worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
        if (showPercentages) {
        worksheet.getCell(currentRow, colIndex++).value = "%";
        worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
      }
    } else {
      worksheet.getCell(currentRow, colIndex++).value = "Total";
      worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
        if (showPercentages) {
        worksheet.getCell(currentRow, colIndex++).value = "%";
        worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
      }
    }
    currentRow++;

    // Helper function to add account rows
    const addAccountRows = (accounts: Account[], sectionName: string, level = 0) => {
      if (accounts.length === 0) return 0;

      // Section header
      worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = sectionName;
      worksheet.getCell(`A${currentRow}`).style = sectionStyle;
      currentRow++;

      // Account rows
      accounts.forEach((account) => {
        const addAccountRow = (acc: Account, accountLevel: number) => {
          const subaccounts = getSubaccounts(acc.id).filter(hasTransactions);
          const isParent = subaccounts.length > 0;
          const isCollapsed = collapsedAccounts.has(acc.id);
          const accountTotal = calculateAccountTotal(acc);
          const directTotal = calculateAccountDirectTotal(acc);

          if (Math.abs(isParent && isCollapsed ? accountTotal : directTotal) < 0.01 && !isParent) return;

          let colIndex = 1;
          const indent = "  ".repeat(accountLevel);
          worksheet.getCell(currentRow, colIndex++).value = `${indent}${acc.name}`;
          worksheet.getCell(currentRow, 1).style = { font: { size: 10 } };

      if (isMonthlyView) {
            months.forEach((month) => {
              const monthlyTotal = isParent && isCollapsed 
                ? calculateAccountTotalForMonthWithSubaccounts(acc, month)
                : calculateAccountTotalForMonth(acc, month);
              
              worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
              worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

            if (showPercentages) {
                const percentValue = formatPercentageForAccount(monthlyTotal, acc);
                worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
                worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
            }
          });

          // Total column
            worksheet.getCell(currentRow, colIndex++).value = isParent && isCollapsed ? accountTotal : directTotal;
            worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

          if (showPercentages) {
              const percentValue = formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal, acc);
              worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
              worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
            }
          } else {
            worksheet.getCell(currentRow, colIndex++).value = isParent && isCollapsed ? accountTotal : directTotal;
            worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;
            
                  if (showPercentages) {
              const percentValue = formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal, acc);
              worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
              worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
            }
          }
          currentRow++;

          // Add subaccounts if not collapsed
          if (isParent && !isCollapsed) {
            subaccounts.forEach((sub) => {
              addAccountRow(sub, accountLevel + 1);
            });

            // Add total row for parent
            colIndex = 1;
            const indentTotal = "  ".repeat(accountLevel);
            worksheet.getCell(currentRow, colIndex++).value = `${indentTotal}Total ${acc.name}`;
            worksheet.getCell(currentRow, 1).style = totalStyle;

            if (isMonthlyView) {
              months.forEach((month) => {
                const monthlyTotal = calculateAccountTotalForMonthWithSubaccounts(acc, month);
                worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
                  const percentValue = formatPercentageForAccount(monthlyTotal, acc);
                  worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
                }
              });
              
              // Total column
              worksheet.getCell(currentRow, colIndex++).value = accountTotal;
              worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
                const percentValue = formatPercentageForAccount(accountTotal, acc);
                worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
                worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
              }
      } else {
              worksheet.getCell(currentRow, colIndex++).value = accountTotal;
              worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
                const percentValue = formatPercentageForAccount(accountTotal, acc);
                worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
                worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
              }
            }
            currentRow++;
          }
        };

        addAccountRow(account, level);
      });

      // Section total
      const sectionTotal = accounts.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
      colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = `Total ${sectionName}`;
      worksheet.getCell(currentRow, 1).style = totalStyle;

    if (isMonthlyView) {
        months.forEach((month) => {
          const monthlyTotal = accounts.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0);
          worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const percentValue = sectionName === "Revenue" 
              ? "100.0%" 
              : calculatePercentageForMonth(monthlyTotal, month);
            worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = sectionTotal;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const percentValue = sectionName === "Revenue" && totalRevenue !== 0 ? "100.0%" : formatPercentage(sectionTotal, totalRevenue);
          worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
        }
    } else {
        worksheet.getCell(currentRow, colIndex++).value = sectionTotal;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const percentValue = sectionName === "Revenue" && totalRevenue !== 0 ? "100.0%" : formatPercentage(sectionTotal, totalRevenue);
          worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
        }
      }
      currentRow++;

      return sectionTotal;
    };

    // Add sections
    const totalRevenue = addAccountRows(revenueRows, "Revenue");
    const totalCOGS = addAccountRows(cogsRows, "Cost of Goods Sold (COGS)");
    
    // Gross Profit
    const grossProfit = totalRevenue - totalCOGS;
    colIndex = 1;
    worksheet.getCell(currentRow, colIndex++).value = "Gross Profit";
    worksheet.getCell(currentRow, 1).style = totalStyle;

    if (isMonthlyView) {
      months.forEach((month) => {
        const monthlyGrossProfit = 
          revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
          cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0);
        worksheet.getCell(currentRow, colIndex++).value = monthlyGrossProfit;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                if (showPercentages) {
          const percentValue = calculatePercentageForMonth(monthlyGrossProfit, month);
          worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
        }
      });
      
      // Total column
      worksheet.getCell(currentRow, colIndex++).value = grossProfit;
      worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

      if (showPercentages) {
        const percentValue = formatPercentage(grossProfit, totalRevenue);
        worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
        worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
      }
    } else {
      worksheet.getCell(currentRow, colIndex++).value = grossProfit;
      worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
        const percentValue = formatPercentage(grossProfit, totalRevenue);
        worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
        worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: "0.0%;-0.0%;\"—\"" };
        }
      }
    currentRow++;

    const totalExpenses = addAccountRows(expenseRows, "Expenses");

    // Net Income
    const netIncome = totalRevenue - totalCOGS - totalExpenses;
    colIndex = 1;
    worksheet.getCell(currentRow, colIndex++).value = "Net Income";
    worksheet.getCell(currentRow, 1).style = { 
      font: { bold: true, color: { argb: netIncome >= 0 ? "FF006100" : "FF9C0006" } }, 
      alignment: { horizontal: "left" as const },
      fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: netIncome >= 0 ? "FFF0FFF0" : "FFFEF2F2" } }
    };

    if (isMonthlyView) {
      months.forEach((month) => {
        const monthlyNetIncome =
          revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
          cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
          expenseRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0);
        worksheet.getCell(currentRow, colIndex++).value = monthlyNetIncome;
        worksheet.getCell(currentRow, colIndex - 1).style = { 
          font: { bold: true, color: { argb: monthlyNetIncome >= 0 ? "FF006100" : "FF9C0006" } }, 
          numFmt: "#,##0.00;(#,##0.00);\"—\"", // Correct number format with dash for zero values
          alignment: { horizontal: "right" as const },
          fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: monthlyNetIncome >= 0 ? "FFF0FFF0" : "FFFEF2F2" } }
        };

        if (showPercentages) {
          const percentValue = calculatePercentageForMonth(monthlyNetIncome, month);
          worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { 
            font: { bold: true, color: { argb: monthlyNetIncome >= 0 ? "FF006100" : "FF9C0006" } }, 
            numFmt: "0.0%", 
            alignment: { horizontal: "right" as const },
              fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: monthlyNetIncome >= 0 ? "FFF0FFF0" : "FFFEF2F2" } }
          };
        }
      });
      
      // Total column
      worksheet.getCell(currentRow, colIndex++).value = netIncome;
      worksheet.getCell(currentRow, colIndex - 1).style = { 
        font: { bold: true, color: { argb: netIncome >= 0 ? "FF006100" : "FF9C0006" } }, 
        numFmt: "#,##0.00;(#,##0.00);\"—\"", // Correct number format with dash for zero values
        alignment: { horizontal: "right" as const },
        fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: netIncome >= 0 ? "FFF0FFF0" : "FFFEF2F2" } }
      };
      
      if (showPercentages) {
        const percentValue = formatPercentage(netIncome, totalRevenue);
        worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
        worksheet.getCell(currentRow, colIndex - 1).style = { 
          font: { bold: true, color: { argb: netIncome >= 0 ? "FF006100" : "FF9C0006" } }, 
          numFmt: "0.0%", 
          alignment: { horizontal: "right" as const },
          fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: netIncome >= 0 ? "FFF0FFF0" : "FFFEF2F2" } }
        };
      }
    } else {
      worksheet.getCell(currentRow, colIndex++).value = netIncome;
      worksheet.getCell(currentRow, colIndex - 1).style = { 
        font: { bold: true, color: { argb: netIncome >= 0 ? "FF006100" : "FF9C0006" } }, 
        numFmt: "#,##0.00;(#,##0.00);\"—\"", // Correct number format with dash for zero values
        alignment: { horizontal: "right" as const },
        fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: netIncome >= 0 ? "FFF0FFF0" : "FFFEF2F2" } }
      };

      if (showPercentages) {
        const percentValue = formatPercentage(netIncome, totalRevenue);
        worksheet.getCell(currentRow, colIndex++).value = percentValue === "—" ? null : parseFloat(percentValue.replace('%', '')) / 100;
        worksheet.getCell(currentRow, colIndex - 1).style = { 
          font: { bold: true, color: { argb: netIncome >= 0 ? "FF006100" : "FF9C0006" } }, 
          numFmt: "0.0%", 
          alignment: { horizontal: "right" as const },
          fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: netIncome >= 0 ? "FFF0FFF0" : "FFFEF2F2" } }
        };
      }
    }

    // Set column widths
    worksheet.getColumn("A").width = 35;
    for (let i = 2; i <= totalColumns; i++) {
      worksheet.getColumn(i).width = 15;
    }
    
    // Add footer
    currentRow += 3;
    
    const today = new Date();
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `switch | ${currentCompany?.name} | ${formatDateForDisplay(
      today.toISOString().split("T")[0]
    )} ${today.toLocaleTimeString()}`;
    worksheet.getCell(`A${currentRow}`).style = { font: { size: 9, color: { argb: "FF666666" } },
      alignment: { horizontal: "center" as const } };

    // Save the file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profit-loss-${startDate}-to-${endDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Export modal transactions function
  const exportModalTransactions = async () => {
    if (!viewerModal.category || selectedCategoryTransactions.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Transactions");

    // Set styles
    const headerStyle = { font: { bold: true, size: 10 } };
    const numberStyle = { 
      font: { size: 10 }, 
      numFmt: "#,##0.00;(#,##0.00);\"—\"", // Format to show dash for zero values
      alignment: { horizontal: "right" as const } 
    };
    const dateStyle = { font: { size: 10 }, alignment: { horizontal: "left" as const } };
    
    let currentRow = 1;

    // Title and company info
    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `${viewerModal.category.name} Transactions`;
    worksheet.getCell(`A${currentRow}`).style = { font: { size: 12, bold: true }, alignment: { horizontal: "center" as const } };
    currentRow++;

    if (currentCompany) {
      worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = currentCompany.name;
      worksheet.getCell(`A${currentRow}`).style = { font: { size: 10 }, alignment: { horizontal: "center" as const } };
      currentRow++;
    }
    
    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = viewerModal.selectedMonth 
      ? `for ${formatMonth(viewerModal.selectedMonth)}` 
      : `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;
    worksheet.getCell(`A${currentRow}`).style = { font: { size: 10 }, alignment: { horizontal: "center" as const } };
    currentRow++; // Empty row

    // Headers
    worksheet.getCell(`A${currentRow}`).value = "Date";
    worksheet.getCell(`A${currentRow}`).style = headerStyle;
    worksheet.getCell(`B${currentRow}`).value = "Description";
    worksheet.getCell(`B${currentRow}`).style = headerStyle;
    worksheet.getCell(`C${currentRow}`).value = "Category";
    worksheet.getCell(`C${currentRow}`).style = headerStyle;
    worksheet.getCell(`D${currentRow}`).value = "Source";
    worksheet.getCell(`D${currentRow}`).style = headerStyle;
    worksheet.getCell(`E${currentRow}`).value = "Amount";
    worksheet.getCell(`E${currentRow}`).style = headerStyle;
    currentRow++;

    // Transaction rows
    selectedCategoryTransactions.forEach((tx) => {
      const displayAmount = getTransactionDisplayAmount(tx, viewerModal.category?.type || "");
      const categoryName = viewerModal.category ? getCategoryName(tx, viewerModal.category) : "";
      const source = tx.source === "manual" ? "Manual" : "Journal";

      worksheet.getCell(`A${currentRow}`).value = tx.date;
      worksheet.getCell(`A${currentRow}`).style = dateStyle;
      worksheet.getCell(`B${currentRow}`).value = tx.description;
      worksheet.getCell(`B${currentRow}`).style = dateStyle;
      worksheet.getCell(`C${currentRow}`).value = categoryName;
      worksheet.getCell(`C${currentRow}`).style = dateStyle;
      worksheet.getCell(`D${currentRow}`).value = source;
      worksheet.getCell(`D${currentRow}`).style = dateStyle;
      worksheet.getCell(`E${currentRow}`).value = displayAmount;
      worksheet.getCell(`E${currentRow}`).style = numberStyle;
      currentRow++;
    });

    // Total row
    const total = selectedCategoryTransactions.reduce(
      (sum, tx) => sum + getTransactionDisplayAmount(tx, viewerModal.category?.type || ""),
      0
    );

    currentRow++; // Empty row
    worksheet.getCell(`A${currentRow}`).value = "Total";
    worksheet.getCell(`A${currentRow}`).style = { font: { bold: true, size: 10 } };
    worksheet.getCell(`E${currentRow}`).value = total;
    worksheet.getCell(`E${currentRow}`).style = { font: { bold: true, size: 10 }, numFmt: "#,##0.00;(#,##0.00);\"—\"", alignment: { horizontal: "right" as const } };
    
    // Add footer
    currentRow += 3;
    
    const today = new Date();
    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `switch | ${currentCompany?.name} | ${formatDateForDisplay(
      today.toISOString().split("T")[0]
    )} ${today.toLocaleTimeString()}`;
    worksheet.getCell(`A${currentRow}`).style = { font: { size: 9, color: { argb: "FF666666" } }, 
      alignment: { horizontal: "center" as const } };

    // Set column widths
    worksheet.getColumn("A").width = 12;
    worksheet.getColumn("B").width = 30;
    worksheet.getColumn("C").width = 20;
    worksheet.getColumn("D").width = 10;
    worksheet.getColumn("E").width = 15;

    // Save the file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${viewerModal.category.name.replace(/[^a-zA-Z0-9]/g, "-")}-transactions-${startDate}-to-${endDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  // Helper: render account row with monthly totals
  const renderAccountRowWithMonthlyTotals = (account: Account, level = 0) => {
    const subaccounts = getSubaccounts(account.id).filter(hasTransactions);
    const isParent = subaccounts.length > 0;
    const isCollapsed = collapsedAccounts.has(account.id);
    const months = getMonthsInRange();

    // Check if this account has any transactions in the journalEntries (not limited to displayed months)
    const hasDirectTransactions = journalEntries.some(tx => tx.chart_account_id === account.id);
    
    // Check if account has any transactions in displayed months
    const hasTransactionsInMonths = months.some(
      (month) => calculateAccountTotalForMonthWithSubaccounts(account, month) !== 0
    );
    
    // Either display if it has transactions in the selected months OR it has direct transactions in journalEntries
    if (!hasTransactionsInMonths && !hasDirectTransactions && !isParent) return null;

    return (
      <React.Fragment key={account.id}>
        <TableRow
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => {
            setSelectedCategory(account);
            setViewerModal({ isOpen: true, category: account });
          }}
        >
          <TableCell className="border p-1 text-xs" style={{ paddingLeft: `${level * 20 + 8}px` }}>
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
              <span className="font-semibold">{account.name}</span>
            </div>
          </TableCell>
          {months.map((month) => (
            <React.Fragment key={month}>
              <TableCell
                className="border p-1 text-right text-xs cursor-pointer hover:bg-gray-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedCategory(account);
                  setViewerModal({ isOpen: true, category: account, selectedMonth: month });
                }}
              >
                {formatNumber(
                  isParent && isCollapsed
                    ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                    : calculateAccountTotalForMonth(account, month)
                )}
              </TableCell>
              {showPercentages && (
                <TableCell
                  className="border p-1 text-right text-xs text-slate-600 cursor-pointer hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCategory(account);
                    setViewerModal({ isOpen: true, category: account, selectedMonth: month });
                  }}
                >
                  {formatPercentageForAccount(
                    isParent && isCollapsed
                      ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                      : calculateAccountTotalForMonth(account, month),
                    account
                  )}
                </TableCell>
              )}
            </React.Fragment>
          ))}
          <TableCell className="border p-1 text-right font-semibold text-xs">
            {formatNumber(
              isParent && isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)
            )}
          </TableCell>
          {showPercentages && (
            <TableCell className="border p-1 text-right text-xs text-slate-600">
              {formatPercentageForAccount(
                isParent && isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
                account
              )}
            </TableCell>
          )}
        </TableRow>
        {!isCollapsed && subaccounts.map((sub) => renderAccountRowWithMonthlyTotals(sub, level + 1))}
        {isParent && !isCollapsed && (
          <TableRow
            key={`${account.id}-total`}
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => {
              setSelectedCategory(account);
              setViewerModal({ isOpen: true, category: account });
            }}
          >
            <TableCell className="border p-1 text-xs bg-gray-50" style={{ paddingLeft: `${level * 20 + 8}px` }}>
              <div className="flex items-center">
                <div className="mr-2 w-5"></div>
                <span className="font-semibold">Total {account.name}</span>
              </div>
            </TableCell>
            {months.map((month) => (
              <React.Fragment key={month}>
                <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                  {formatNumber(calculateAccountTotalForMonthWithSubaccounts(account, month))}
                </TableCell>
                {showPercentages && (
                  <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                    {formatPercentageForAccount(calculateAccountTotalForMonthWithSubaccounts(account, month), account)}
                  </TableCell>
                )}
              </React.Fragment>
            ))}
            <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
              {formatNumber(calculateAccountTotal(account))}
            </TableCell>
            {showPercentages && (
              <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                {formatPercentageForAccount(calculateAccountTotal(account), account)}
              </TableCell>
            )}
          </TableRow>
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
      
    // If this account has no transactions in the current period and no transactions overall, don't render
    const hasDirectTransactions = journalEntries.some(tx => tx.chart_account_id === account.id);
    if (currentTotal === 0 && !hasDirectTransactions && !isParent) return null;

    return (
      <React.Fragment key={account.id}>
        <TableRow
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => {
            setSelectedCategory(account);
            setViewerModal({ isOpen: true, category: account });
          }}
        >
          <TableCell className="border p-1 text-xs" style={{ paddingLeft: `${level * 20 + 8}px`, width: "30%" }}>
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
              <span className="font-semibold">{account.name}</span>
            </div>
          </TableCell>
          <TableCell className="border p-1 text-right text-xs" style={{ width: "20%" }}>
            {formatNumber(isParent && isCollapsed ? currentTotal : directTotal)}
          </TableCell>
          {showPercentages && (
            <TableCell className="border p-1 text-right text-xs text-slate-600">
              {formatPercentageForAccount(isParent && isCollapsed ? currentTotal : directTotal, account)}
            </TableCell>
          )}
          {showPreviousPeriod && (
            <>
              <TableCell className="border p-1 text-right text-xs" style={{ width: "20%" }}>
                {formatNumber(isParent && isCollapsed ? previousTotal : directPreviousTotal)}
              </TableCell>
              {showPercentages && (
                <TableCell className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentage(
                    isParent && isCollapsed ? previousTotal : directPreviousTotal,
                    calculatePreviousPeriodTotal(revenueRows)
                  )}
                </TableCell>
              )}
              <TableCell className="border p-1 text-right text-xs" style={{ width: "20%" }}>
                {formatNumber(variance)}
              </TableCell>
            </>
          )}
        </TableRow>
        {!isCollapsed && subaccounts.map((sub) => renderAccountRowWithPreviousPeriod(sub, level + 1))}
        {isParent && !isCollapsed && (
          <TableRow
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => {
              setSelectedCategory(account);
              setViewerModal({ isOpen: true, category: account });
            }}
          >
            <TableCell
              className="border p-1 text-xs bg-gray-50"
              style={{ paddingLeft: `${level * 20 + 8}px`, width: "30%" }}
            >
              <div className="flex items-center">
                <div className="mr-2 w-5"></div>
                <span className="font-semibold">Total {account.name}</span>
              </div>
            </TableCell>
            <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs" style={{ width: "20%" }}>
              {formatNumber(currentTotal)}
            </TableCell>
            {showPercentages && (
              <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                {formatPercentageForAccount(currentTotal, account)}
              </TableCell>
            )}
            {showPreviousPeriod && (
              <>
                <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs" style={{ width: "20%" }}>
                  {formatNumber(previousTotal)}
                </TableCell>
                {showPercentages && (
                  <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                    {formatPercentage(previousTotal, calculatePreviousPeriodTotal(revenueRows))}
                  </TableCell>
                )}
                <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs" style={{ width: "20%" }}>
                  {formatNumber(currentTotal - previousTotal)}
                </TableCell>
              </>
            )}
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  // Check if user has company context
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
        <div className="text-center mb-6">
          {/* Period Selector */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex justify-center">
                <PeriodSelector
                  selectedPeriod={selectedPeriod}
                  onPeriodChange={handlePeriodChange}
                  selectedDisplay={selectedDisplay}
                  onDisplayChange={handleDisplayChange}
                  // selectedComparison={selectedComparison}
                  // onComparisonChange={handleComparisonChange}
                />
              </div>

              {/* Manual date override option */}
              <div className="flex items-center justify-center gap-4 text-xs">
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
                  className="w-auto text-xs h-8 transition-none"
                />
                <span className="text-slate-600">to</span>
                <Input
                  type="date"
                  value={endDate}
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
                  className="w-auto text-xs h-8 transition-none"
                />
              </div>
            </div>

            <div className="flex justify-center">
              <Button onClick={exportToXLSX} disabled={loading} className="text-xs font-medium min-w-17">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Export"}
              </Button>
            </div>
          </div>
        </div>

        {/* P&L Table */}
        <Card className="pt-3 pb-0">
          <CardContent className="p-0">
            <h1 className="text-2xl font-bold text-slate-800 mb-1 text-center">{currentCompany.name}</h1>
            {currentCompany && (
              <p className="text-lg text-slate-700 mb-1 text-center font-medium">Profit & Loss</p>
            )}
            <p className="text-sm text-slate-600 mb-3 text-center">
              {formatDateForDisplay(startDate)} to {formatDateForDisplay(endDate)}
            </p>
            <Table className="border border-gray-300">
              <TableHeader className="bg-gray-100">
                <TableRow>
                  <TableHead
                    className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                    style={{ width: "25%" }}
                  >
                  </TableHead>
                  {isMonthlyView ? (
                    <>
                      {getMonthsInRange().map((month) => (
                        <React.Fragment key={month}>
                          <TableHead
                            className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                            style={{ width: `${65 / (getMonthsInRange().length + 1)}%` }}
                          >
                            {formatMonth(month)}
                          </TableHead>
                        </React.Fragment>
                      ))}
                      <TableHead
                        className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                        style={{ width: `${65 / (getMonthsInRange().length + 1)}%` }}
                      >
                        Total
                      </TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead
                        className="border p-1 text-center font-medium text-xs"
                        style={{ width: showPercentages ? "20%" : "25%" }}
                      >
                        Total
                      </TableHead>
                      {showPercentages && (
                        <TableHead className="border p-1 text-center font-medium text-xs" style={{ width: "15%" }}>
                          %
                        </TableHead>
                      )}
                      {showPreviousPeriod && (
                        <>
                          <TableHead
                            className="border p-1 text-center font-medium text-xs"
                            style={{ width: showPercentages ? "20%" : "25%" }}
                          >
                            Previous Period
                          </TableHead>
                          {showPercentages && (
                            <TableHead className="border p-1 text-center font-medium text-xs" style={{ width: "15%" }}>
                              %
                            </TableHead>
                          )}
                          <TableHead
                            className="border p-1 text-center font-medium text-xs"
                            style={{ width: showPercentages ? "20%" : "25%" }}
                          >
                            Difference
                          </TableHead>
                        </>
                      )}
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  /* Loading State */
                  <>
                    {/* Revenue SECTION */}
                    <TableRow className="bg-gray-100">
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod
                            ? showPercentages
                              ? 6
                              : 4
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="border p-1 font-semibold text-xs"
                      >
                        Revenue
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod
                            ? showPercentages
                              ? 6
                              : 4
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="border p-1 text-center"
                      >
                        <div className="flex flex-col items-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                          <span className="text-xs">Loading revenue accounts...</span>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* COGS SECTION */}
                    <TableRow className="bg-gray-100">
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod
                            ? showPercentages
                              ? 6
                              : 4
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="border p-1 font-semibold text-xs"
                      >
                        Cost of Goods Sold (COGS)
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod
                            ? showPercentages
                              ? 6
                              : 4
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="border p-1 text-center"
                      >
                        <div className="flex flex-col items-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                          <span className="text-xs">Loading COGS accounts...</span>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* EXPENSES SECTION */}
                    <TableRow className="bg-gray-100">
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod
                            ? showPercentages
                              ? 6
                              : 4
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="border p-1 font-semibold text-xs"
                      >
                        Expenses
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod
                            ? showPercentages
                              ? 6
                              : 4
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="border p-1 text-center"
                      >
                        <div className="flex flex-col items-center space-y-3">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
                          <span className="text-xs">Loading expense accounts...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </>
                ) : (
                  /* Normal Content */
                  <>
                    {/* Revenue */}
                    <TableRow className="bg-gray-100">
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod
                            ? showPercentages
                              ? 6
                              : 4
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="border p-1 font-semibold text-xs"
                      >
                        Revenue
                      </TableCell>
                    </TableRow>
                    {revenueRows.map((row) => {
                      if (isMonthlyView) {
                        return renderAccountRowWithMonthlyTotals(row);
                      } else {
                        return renderAccountRowWithPreviousPeriod(row);
                      }
                    })}
                    {/* Total Revenue */}
                    <TableRow
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
                      <TableCell className="border p-1 text-xs font-semibold" style={{ width: "30%" }}>
                        Total Revenue
                      </TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange().map((month) => (
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
                          <TableCell className="border p-1 text-right font-semibold text-xs" style={{ width: "20%" }}>
                            {formatNumber(totalRevenue)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs text-slate-600">
                              {formatPercentage(totalRevenue, totalRevenue)}
                            </TableCell>
                          )}
                          {showPreviousPeriod && (
                            <>
                              <TableCell
                                className="border p-1 text-right font-semibold text-xs"
                                style={{ width: "20%" }}
                              >
                                {formatNumber(calculatePreviousPeriodTotal(revenueRows))}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                                  {calculatePreviousPeriodTotal(revenueRows) !== 0 ? "100.0%" : "—"}
                                </TableCell>
                              )}
                              <TableCell
                                className="border p-1 text-right font-semibold text-xs"
                                style={{ width: "20%" }}
                              >
                                {formatNumber(calculatePreviousPeriodVariance(totalRevenue, revenueRows))}
                              </TableCell>
                            </>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* COGS */}
                    <TableRow>
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod
                            ? showPercentages
                              ? 6
                              : 4
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="border p-1 text-xs font-semibold"
                      >
                        Cost of Goods Sold (COGS)
                      </TableCell>
                    </TableRow>
                    {cogsRows.map((row) => {
                      if (isMonthlyView) {
                        return renderAccountRowWithMonthlyTotals(row);
                      } else {
                        return renderAccountRowWithPreviousPeriod(row);
                      }
                    })}
                    {/* Total COGS */}
                    <TableRow
                      className="cursor-pointer hover:bg-blue-50"
                      onClick={() => {
                        setSelectedCategory({ id: "COGS_GROUP", name: "Total COGS", type: "COGS", parent_id: null });
                        setViewerModal({
                          isOpen: true,
                          category: { id: "COGS_GROUP", name: "Total COGS", type: "COGS", parent_id: null },
                        });
                      }}
                    >
                      <TableCell className="border p-1 text-xs font-semibold">Total COGS</TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange().map((month) => (
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
                          <TableCell className="border p-1 text-right font-semibold text-xs w-[150px]">
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
                          {showPreviousPeriod && (
                            <>
                              <TableCell className="border p-1 text-right font-semibold text-xs w-[150px]">
                                {formatNumber(calculatePreviousPeriodTotal(cogsRows))}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {formatPercentage(
                                    calculatePreviousPeriodTotal(cogsRows),
                                    calculatePreviousPeriodTotal(revenueRows)
                                  )}
                                </TableCell>
                              )}
                              <TableCell className="border p-1 text-right font-semibold text-xs w-[150px]">
                                {formatNumber(calculatePreviousPeriodVariance(totalCOGS, cogsRows))}
                              </TableCell>
                            </>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* Gross Profit */}
                    <TableRow className="bg-gray-50 font-semibold">
                      <TableCell className="border p-1 text-xs font-semibold" style={{ width: "25%" }}>
                        Gross Profit
                      </TableCell>
                      {isMonthlyView &&
                        getMonthsInRange().map((month) => (
                          <React.Fragment key={month}>
                            <TableCell className="border p-1 text-right text-xs">
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
                      <TableCell className="border p-1 text-right text-xs">
                        {formatNumber(grossProfit)}
                      </TableCell>
                      {showPercentages && isMonthlyView && (
                        <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                          {totalRevenue !== 0 ? formatPercentage(grossProfit, totalRevenue) : "—"}
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Expenses */}
                    <TableRow>
                      <TableCell
                        colSpan={
                          isMonthlyView
                            ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                            : showPreviousPeriod
                            ? showPercentages
                              ? 6
                              : 4
                            : showPercentages
                            ? 3
                            : 2
                        }
                        className="border p-1 text-xs font-semibold"
                      >
                        Expenses
                      </TableCell>
                    </TableRow>
                    {expenseRows.map((row) => {
                      if (isMonthlyView) {
                        return renderAccountRowWithMonthlyTotals(row);
                      } else {
                        return renderAccountRowWithPreviousPeriod(row);
                      }
                    })}
                    {/* Total Expenses */}
                    <TableRow
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
                      <TableCell className="border p-1 text-xs font-semibold">Total Expenses</TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange().map((month) => (
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
                          <TableCell className="border p-1 text-right font-semibold text-xs w-[150px]">
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
                          {showPreviousPeriod && (
                            <>
                              <TableCell className="border p-1 text-right font-semibold text-xs w-[150px]">
                                {formatNumber(calculatePreviousPeriodTotal(expenseRows))}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {formatPercentage(
                                    calculatePreviousPeriodTotal(expenseRows),
                                    calculatePreviousPeriodTotal(revenueRows)
                                  )}
                                </TableCell>
                              )}
                              <TableCell className="border p-1 text-right font-semibold text-xs w-[150px]">
                                {formatNumber(calculatePreviousPeriodVariance(totalExpenses, expenseRows))}
                              </TableCell>
                            </>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* Net Income */}
                    <TableRow className="bg-gray-50 font-bold">
                      <TableCell className="border p-1 text-xs font-semibold" style={{ width: "25%" }}>
                        Net Income
                      </TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange().map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right text-xs">
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
                          <TableCell className="border p-1 text-right text-xs">
                            {formatNumber(netIncome)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {totalRevenue !== 0 ? formatPercentage(netIncome, totalRevenue) : "—"}
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right text-xs w-[150px]">
                            {formatNumber(netIncome)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              {totalRevenue !== 0 ? formatPercentage(netIncome, totalRevenue) : "—"}
                            </TableCell>
                          )}
                          {showPreviousPeriod && (
                            <>
                              <TableCell className="border p-1 text-right text-xs w-[150px]">
                                {formatNumber(
                                  (() => {
                                    const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
                                    const previousCOGS = calculatePreviousPeriodTotal(cogsRows);
                                    const previousExpenses = calculatePreviousPeriodTotal(expenseRows);
                                    return previousRevenue - previousCOGS - previousExpenses;
                                  })()
                                )}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs text-slate-600">
                                  {formatPercentage(
                                    (() => {
                                      const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
                                      const previousCOGS = calculatePreviousPeriodTotal(cogsRows);
                                      const previousExpenses = calculatePreviousPeriodTotal(expenseRows);
                                      return previousRevenue - previousCOGS - previousExpenses;
                                    })(),
                                    calculatePreviousPeriodTotal(revenueRows)
                                  )}
                                </TableCell>
                              )}
                              <TableCell className="border p-1 text-right text-xs w-[150px]">
                                {formatNumber(
                                  (() => {
                                    const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
                                    const previousCOGS = calculatePreviousPeriodTotal(cogsRows);
                                    const previousExpenses = calculatePreviousPeriodTotal(expenseRows);
                                    const previousNetIncome = previousRevenue - previousCOGS - previousExpenses;
                                    return netIncome - previousNetIncome;
                                  })()
                                )}
                              </TableCell>
                            </>
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
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-[800px] max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                {viewerModal.category.name} Transactions
                {viewerModal.selectedMonth && ` for ${formatMonth(viewerModal.selectedMonth)}`}
              </h2>
              <div className="flex items-center gap-4">
                {selectedCategoryTransactions.length > 0 && (
                  <Button onClick={exportModalTransactions} className="text-xs font-medium" size="sm">
                    <Download className="w-4 h-4" />
                  </Button>
                )}
                <button
                  onClick={() => setViewerModal({ isOpen: false, category: null })}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto">
              <Table className="w-full text-xs">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="text-left p-2">Date</TableHead>
                    <TableHead className="text-left p-2">Description</TableHead>
                    <TableHead className="text-left p-2">Category</TableHead>
                    <TableHead className="text-left p-2">Source</TableHead>
                    <TableHead className="text-right p-2">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedCategoryTransactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-gray-50">
                      <TableCell className="p-2">{tx.date}</TableCell>
                      <TableCell className="p-2">{tx.description}</TableCell>
                      <TableCell className="p-2">
                        {viewerModal.category ? getCategoryName(tx, viewerModal.category) : ""}
                      </TableCell>
                      <TableCell className="p-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            tx.source === "manual" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {tx.source === "manual" ? "Manual" : "Journal"}
                        </span>
                      </TableCell>
                      <TableCell className="p-2 text-right">
                        {formatNumber(getTransactionDisplayAmount(tx, viewerModal.category?.type || ""))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {selectedCategoryTransactions.length > 0 && (
                    <TableRow className="bg-gray-50 font-semibold">
                      <TableCell colSpan={4} className="p-2 text-right">
                        Total
                      </TableCell>
                      <TableCell className="p-2 text-right">
                        {formatNumber(
                          selectedCategoryTransactions.reduce(
                            (sum, tx) => sum + getTransactionDisplayAmount(tx, viewerModal.category?.type || ""),
                            0
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {selectedCategoryTransactions.length === 0 && (
                <div className="text-gray-500 text-center py-4">No transactions to show.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
