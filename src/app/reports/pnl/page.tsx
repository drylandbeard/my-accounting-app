"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "@/zustand/authStore";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PeriodSelector } from "@/components/ui/period-selector";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

        // Fetch regular journal entries
        let journalQuery = supabase.from("journal").select("*").eq("company_id", currentCompany!.id);
        if (startDate && endDate) {
          journalQuery = journalQuery.gte("date", startDate).lte("date", endDate);
        }
        const { data: journalData } = await journalQuery;

        // Fetch manual journal entries
        let manualJournalQuery = supabase
          .from("manual_journal_entries")
          .select("*")
          .eq("company_id", currentCompany!.id);
        if (startDate && endDate) {
          manualJournalQuery = manualJournalQuery.gte("date", startDate).lte("date", endDate);
        }
        const { data: manualJournalData } = await manualJournalQuery;

        // Transform and combine both datasets
        const regularEntries: Transaction[] = (journalData || []).map((entry) => ({
          id: entry.id,
          date: entry.date,
          description: entry.description,
          chart_account_id: entry.chart_account_id,
          debit: entry.debit,
          credit: entry.credit,
          transaction_id: entry.transaction_id,
          source: "journal" as const,
        }));

        const manualEntries: Transaction[] = (manualJournalData || []).map((entry) => ({
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
    const months = getMonthsInRange();

    // Header
    if (isMonthlyView) {
      const headerRow = ["Account"];

      months.forEach((month: string) => {
        headerRow.push(formatMonth(month));
        if (showPercentages) {
          headerRow.push("%");
        }
      });

      headerRow.push("Total");
      if (showPercentages) {
        headerRow.push("%");
      }

      csvData.push(["Profit & Loss", `${startDate} to ${endDate}`]);
      csvData.push([""]);
      csvData.push(headerRow);
    } else {
      const headerRow = ["Account", "Total"];

      if (showPercentages) {
        headerRow.push("%");
      }

      if (showPreviousPeriod) {
        headerRow.push("Previous Period");
        if (showPercentages) {
          headerRow.push("%");
        }
        headerRow.push("Difference");
      }

      csvData.push(["Profit & Loss", `${startDate} to ${endDate}`]);
      csvData.push([""]);
      csvData.push(headerRow);
    }

    // Revenue
    csvData.push(["Revenue"]);

    if (isMonthlyView) {
      // Export revenue with monthly columns
      revenueRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);

        // Account row
        const accountRow = [account.name];

        months.forEach((month: string) => {
          accountRow.push(
            formatNumber(
              isCollapsed
                ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                : calculateAccountTotalForMonth(account, month)
            )
          );

          if (showPercentages) {
            accountRow.push(
              formatPercentageForAccount(
                isCollapsed
                  ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                  : calculateAccountTotalForMonth(account, month),
                account
              )
            );
          }
        });

        // Total column
        accountRow.push(
          formatNumber(isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account))
        );

        if (showPercentages) {
          accountRow.push(
            formatPercentageForAccount(
              isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
              account
            )
          );
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(hasTransactions)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`];

              months.forEach((month: string) => {
                subRow.push(formatNumber(calculateAccountTotalForMonth(sub, month)));
                if (showPercentages) {
                  subRow.push(formatPercentageForAccount(calculateAccountTotalForMonth(sub, month), sub));
                }
              });

              subRow.push(formatNumber(calculateAccountDirectTotal(sub)));
              if (showPercentages) {
                subRow.push(formatPercentageForAccount(calculateAccountDirectTotal(sub), sub));
              }

              csvData.push(subRow);
            });
        }
      });

      // Total Revenue row
      const totalRevenueRow = ["Total Revenue"];

      months.forEach((month: string) => {
        totalRevenueRow.push(
          formatNumber(revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0))
        );

        if (showPercentages) {
          totalRevenueRow.push(totalRevenue !== 0 ? "100.0%" : "—");
        }
      });

      totalRevenueRow.push(formatNumber(totalRevenue));
      if (showPercentages) {
        totalRevenueRow.push(totalRevenue !== 0 ? "100.0%" : "—");
      }

      csvData.push(totalRevenueRow);
    } else {
      // Export revenue without monthly breakdown
      revenueRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);
        const accountRow = [
          account.name,
          formatNumber(isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)),
        ];

        if (showPercentages) {
          accountRow.push(
            formatPercentageForAccount(
              isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
              account
            )
          );
        }

        if (showPreviousPeriod) {
          const previousTotal = calculatePreviousPeriodTotal([account]);
          accountRow.push(formatNumber(previousTotal));

          if (showPercentages) {
            accountRow.push(formatPercentage(previousTotal, calculatePreviousPeriodTotal(revenueRows)));
          }

          accountRow.push(
            formatNumber(
              (isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)) - previousTotal
            )
          );
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(hasTransactions)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`, formatNumber(calculateAccountDirectTotal(sub))];

              if (showPercentages) {
                subRow.push(formatPercentageForAccount(calculateAccountDirectTotal(sub), sub));
              }

              if (showPreviousPeriod) {
                const previousSubTotal = calculatePreviousPeriodTotal([sub]);
                subRow.push(formatNumber(previousSubTotal));

                if (showPercentages) {
                  subRow.push(formatPercentage(previousSubTotal, calculatePreviousPeriodTotal(revenueRows)));
                }

                subRow.push(formatNumber(calculateAccountDirectTotal(sub) - previousSubTotal));
              }

              csvData.push(subRow);
            });
        }
      });

      // Total Revenue row
      const totalRevenueRow = ["Total Revenue", formatNumber(totalRevenue)];

      if (showPercentages) {
        totalRevenueRow.push(totalRevenue !== 0 ? "100.0%" : "—");
      }

      if (showPreviousPeriod) {
        const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
        totalRevenueRow.push(formatNumber(previousRevenue));

        if (showPercentages) {
          totalRevenueRow.push(previousRevenue !== 0 ? "100.0%" : "—");
        }

        totalRevenueRow.push(formatNumber(totalRevenue - previousRevenue));
      }

      csvData.push(totalRevenueRow);
    }

    csvData.push([""]);

    // COGS
    if (cogsRows.length > 0) {
      csvData.push(["COST OF GOODS SOLD"]);

      if (isMonthlyView) {
        // Export COGS with monthly columns
        cogsRows.forEach((account) => {
          const isCollapsed = collapsedAccounts.has(account.id);

          // Account row
          const accountRow = [account.name];

          months.forEach((month: string) => {
            accountRow.push(
              formatNumber(
                isCollapsed
                  ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                  : calculateAccountTotalForMonth(account, month)
              )
            );

            if (showPercentages) {
              accountRow.push(
                calculatePercentageForMonth(
                  isCollapsed
                    ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                    : calculateAccountTotalForMonth(account, month),
                  month
                )
              );
            }
          });

          // Total column
          accountRow.push(
            formatNumber(isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account))
          );

          if (showPercentages) {
            accountRow.push(
              formatPercentage(
                isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
                totalRevenue
              )
            );
          }

          csvData.push(accountRow);

          // Add subaccounts if not collapsed
          if (!isCollapsed) {
            getSubaccounts(account.id)
              .filter(hasTransactions)
              .forEach((sub) => {
                const subRow = [`  ${sub.name}`];

                months.forEach((month: string) => {
                  subRow.push(formatNumber(calculateAccountTotalForMonth(sub, month)));
                  if (showPercentages) {
                    subRow.push(calculatePercentageForMonth(calculateAccountTotalForMonth(sub, month), month));
                  }
                });

                subRow.push(formatNumber(calculateAccountDirectTotal(sub)));
                if (showPercentages) {
                  subRow.push(formatPercentage(calculateAccountDirectTotal(sub), totalRevenue));
                }

                csvData.push(subRow);
              });
          }
        });

        // Total COGS row
        const totalCOGSRow = ["Total COGS"];

        months.forEach((month: string) => {
          totalCOGSRow.push(
            formatNumber(cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0))
          );

          if (showPercentages) {
            totalCOGSRow.push(
              calculatePercentageForMonth(
                cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0),
                month
              )
            );
          }
        });

        totalCOGSRow.push(formatNumber(totalCOGS));
        if (showPercentages) {
          totalCOGSRow.push(
            totalRevenue !== 0 ? formatPercentage(totalCOGS, totalRevenue) : totalCOGS !== 0 ? "100.0%" : "—"
          );
        }

        csvData.push(totalCOGSRow);

        // Gross Profit row
        const grossProfitRow = ["Gross Profit"];

        months.forEach((month: string) => {
          const monthlyGrossProfit =
            revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
            cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0);

          grossProfitRow.push(formatNumber(monthlyGrossProfit));

          if (showPercentages) {
            grossProfitRow.push(calculatePercentageForMonth(monthlyGrossProfit, month));
          }
        });

        grossProfitRow.push(formatNumber(grossProfit));
        if (showPercentages) {
          grossProfitRow.push(totalRevenue !== 0 ? formatPercentage(grossProfit, totalRevenue) : "—");
        }

        csvData.push(grossProfitRow);
      } else {
        // Export COGS without monthly breakdown
        cogsRows.forEach((account) => {
          const isCollapsed = collapsedAccounts.has(account.id);
          const accountRow = [
            account.name,
            formatNumber(isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)),
          ];

          if (showPercentages) {
            accountRow.push(
              totalRevenue !== 0
                ? formatPercentage(
                    isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
                    totalRevenue
                  )
                : "—"
            );
          }

          if (showPreviousPeriod) {
            const previousTotal = calculatePreviousPeriodTotal([account]);
            accountRow.push(formatNumber(previousTotal));

            if (showPercentages) {
              const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
              accountRow.push(previousRevenue !== 0 ? formatPercentage(previousTotal, previousRevenue) : "—");
            }

            accountRow.push(
              formatNumber(
                (isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)) - previousTotal
              )
            );
          }

          csvData.push(accountRow);

          // Add subaccounts if not collapsed
          if (!isCollapsed) {
            getSubaccounts(account.id)
              .filter(hasTransactions)
              .forEach((sub) => {
                const subRow = [`  ${sub.name}`, formatNumber(calculateAccountDirectTotal(sub))];

                if (showPercentages) {
                  subRow.push(
                    totalRevenue !== 0 ? formatPercentage(calculateAccountDirectTotal(sub), totalRevenue) : "—"
                  );
                }

                if (showPreviousPeriod) {
                  const previousSubTotal = calculatePreviousPeriodTotal([sub]);
                  subRow.push(formatNumber(previousSubTotal));

                  if (showPercentages) {
                    const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
                    subRow.push(previousRevenue !== 0 ? formatPercentage(previousSubTotal, previousRevenue) : "—");
                  }

                  subRow.push(formatNumber(calculateAccountDirectTotal(sub) - previousSubTotal));
                }

                csvData.push(subRow);
              });
          }
        });

        // Total COGS row
        const totalCOGSRow = ["Total COGS", formatNumber(totalCOGS)];

        if (showPercentages) {
          totalCOGSRow.push(
            totalRevenue !== 0 ? formatPercentage(totalCOGS, totalRevenue) : totalCOGS !== 0 ? "100.0%" : "—"
          );
        }

        if (showPreviousPeriod) {
          const previousCOGS = calculatePreviousPeriodTotal(cogsRows);
          totalCOGSRow.push(formatNumber(previousCOGS));

          if (showPercentages) {
            const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
            totalCOGSRow.push(previousRevenue !== 0 ? formatPercentage(previousCOGS, previousRevenue) : "—");
          }

          totalCOGSRow.push(formatNumber(totalCOGS - previousCOGS));
        }

        csvData.push(totalCOGSRow);

        // Gross Profit row
        const grossProfitRow = ["Gross Profit", formatNumber(grossProfit)];

        if (showPercentages) {
          grossProfitRow.push(totalRevenue !== 0 ? formatPercentage(grossProfit, totalRevenue) : "—");
        }

        if (showPreviousPeriod) {
          const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
          const previousCOGS = calculatePreviousPeriodTotal(cogsRows);
          const previousGrossProfit = previousRevenue - previousCOGS;

          grossProfitRow.push(formatNumber(previousGrossProfit));

          if (showPercentages) {
            grossProfitRow.push(previousRevenue !== 0 ? formatPercentage(previousGrossProfit, previousRevenue) : "—");
          }

          grossProfitRow.push(formatNumber(grossProfit - previousGrossProfit));
        }

        csvData.push(grossProfitRow);
      }

      csvData.push([""]);
    }

    // Expenses
    csvData.push(["EXPENSES"]);

    if (isMonthlyView) {
      // Export expenses with monthly columns
      expenseRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);

        // Account row
        const accountRow = [account.name];

        months.forEach((month: string) => {
          accountRow.push(
            formatNumber(
              isCollapsed
                ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                : calculateAccountTotalForMonth(account, month)
            )
          );

          if (showPercentages) {
            accountRow.push(
              calculatePercentageForMonth(
                isCollapsed
                  ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                  : calculateAccountTotalForMonth(account, month),
                month
              )
            );
          }
        });

        // Total column
        accountRow.push(
          formatNumber(isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account))
        );

        if (showPercentages) {
          accountRow.push(
            formatPercentage(
              isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
              totalRevenue
            )
          );
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(hasTransactions)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`];

              months.forEach((month: string) => {
                subRow.push(formatNumber(calculateAccountTotalForMonth(sub, month)));
                if (showPercentages) {
                  subRow.push(calculatePercentageForMonth(calculateAccountTotalForMonth(sub, month), month));
                }
              });

              subRow.push(formatNumber(calculateAccountDirectTotal(sub)));
              if (showPercentages) {
                subRow.push(formatPercentage(calculateAccountDirectTotal(sub), totalRevenue));
              }

              csvData.push(subRow);
            });
        }
      });

      // Total Expenses row
      const totalExpensesRow = ["Total Expenses"];

      months.forEach((month: string) => {
        totalExpensesRow.push(
          formatNumber(expenseRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0))
        );

        if (showPercentages) {
          totalExpensesRow.push(
            calculatePercentageForMonth(
              expenseRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0),
              month
            )
          );
        }
      });

      totalExpensesRow.push(formatNumber(totalExpenses));
      if (showPercentages) {
        totalExpensesRow.push(
          totalRevenue !== 0 ? formatPercentage(totalExpenses, totalRevenue) : totalExpenses !== 0 ? "100.0%" : "—"
        );
      }

      csvData.push(totalExpensesRow);
    } else {
      // Export expenses without monthly breakdown
      expenseRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);
        const accountRow = [
          account.name,
          formatNumber(isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)),
        ];

        if (showPercentages) {
          accountRow.push(
            totalRevenue !== 0
              ? formatPercentage(
                  isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
                  totalRevenue
                )
              : "—"
          );
        }

        if (showPreviousPeriod) {
          const previousTotal = calculatePreviousPeriodTotal([account]);
          accountRow.push(formatNumber(previousTotal));

          if (showPercentages) {
            const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
            accountRow.push(previousRevenue !== 0 ? formatPercentage(previousTotal, previousRevenue) : "—");
          }

          accountRow.push(
            formatNumber(
              (isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)) - previousTotal
            )
          );
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(hasTransactions)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`, formatNumber(calculateAccountDirectTotal(sub))];

              if (showPercentages) {
                subRow.push(
                  totalRevenue !== 0 ? formatPercentage(calculateAccountDirectTotal(sub), totalRevenue) : "—"
                );
              }

              if (showPreviousPeriod) {
                const previousSubTotal = calculatePreviousPeriodTotal([sub]);
                subRow.push(formatNumber(previousSubTotal));

                if (showPercentages) {
                  const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
                  subRow.push(previousRevenue !== 0 ? formatPercentage(previousSubTotal, previousRevenue) : "—");
                }

                subRow.push(formatNumber(calculateAccountDirectTotal(sub) - previousSubTotal));
              }

              csvData.push(subRow);
            });
        }
      });

      // Total Expenses row
      const totalExpensesRow = ["Total Expenses", formatNumber(totalExpenses)];

      if (showPercentages) {
        totalExpensesRow.push(
          totalRevenue !== 0 ? formatPercentage(totalExpenses, totalRevenue) : totalExpenses !== 0 ? "100.0%" : "—"
        );
      }

      if (showPreviousPeriod) {
        const previousExpenses = calculatePreviousPeriodTotal(expenseRows);
        totalExpensesRow.push(formatNumber(previousExpenses));

        if (showPercentages) {
          const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
          totalExpensesRow.push(previousRevenue !== 0 ? formatPercentage(previousExpenses, previousRevenue) : "—");
        }

        totalExpensesRow.push(formatNumber(totalExpenses - previousExpenses));
      }

      csvData.push(totalExpensesRow);
    }

    csvData.push([""]);

    // Net Income
    if (isMonthlyView) {
      const netIncomeRow = ["Net Income"];

      getMonthsInRange().forEach((month: string) => {
        const monthlyNetIncome =
          revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
          cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
          expenseRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0);

        netIncomeRow.push(formatNumber(monthlyNetIncome));

        if (showPercentages) {
          netIncomeRow.push(calculatePercentageForMonth(monthlyNetIncome, month));
        }
      });

      netIncomeRow.push(formatNumber(netIncome));
      if (showPercentages) {
        netIncomeRow.push(totalRevenue !== 0 ? formatPercentage(netIncome, totalRevenue) : "—");
      }

      csvData.push(netIncomeRow);
    } else {
      const netIncomeRow = ["Net Income", formatNumber(netIncome)];

      if (showPercentages) {
        netIncomeRow.push(totalRevenue !== 0 ? formatPercentage(netIncome, totalRevenue) : "—");
      }

      if (showPreviousPeriod) {
        const previousRevenue = calculatePreviousPeriodTotal(revenueRows);
        const previousCOGS = calculatePreviousPeriodTotal(cogsRows);
        const previousExpenses = calculatePreviousPeriodTotal(expenseRows);
        const previousNetIncome = previousRevenue - previousCOGS - previousExpenses;

        netIncomeRow.push(formatNumber(previousNetIncome));

        if (showPercentages) {
          netIncomeRow.push(previousRevenue !== 0 ? formatPercentage(previousNetIncome, previousRevenue) : "—");
        }

        netIncomeRow.push(formatNumber(netIncome - previousNetIncome));
      }

      csvData.push(netIncomeRow);
    }

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

  // Export modal transactions function
  const exportModalTransactions = () => {
    if (!viewerModal.category || selectedCategoryTransactions.length === 0) return;

    const csvData = [];

    // Header with category info
    csvData.push([
      `${viewerModal.category.name} Transactions`,
      viewerModal.selectedMonth ? `for ${formatMonth(viewerModal.selectedMonth)}` : `${startDate} to ${endDate}`,
    ]);
    csvData.push([""]);

    // Table headers
    csvData.push(["Date", "Description", "Category", "Source", "Amount"]);

    // Transaction rows
    selectedCategoryTransactions.forEach((tx) => {
      const displayAmount = getTransactionDisplayAmount(tx, viewerModal.category?.type || "");
      const categoryName = viewerModal.category ? getCategoryName(tx, viewerModal.category) : "";
      const source = tx.source === "manual" ? "Manual" : "Journal";

      csvData.push([tx.date, tx.description, categoryName, source, displayAmount.toFixed(2)]);
    });

    // Total row
    const total = selectedCategoryTransactions.reduce(
      (sum, tx) => sum + getTransactionDisplayAmount(tx, viewerModal.category?.type || ""),
      0
    );

    csvData.push([""]);
    csvData.push(["Total", "", "", "", total.toFixed(2)]);

    // Generate and download CSV
    const csvContent = csvData.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${viewerModal.category.name.replace(/[^a-zA-Z0-9]/g, "-")}-transactions-${startDate}-to-${endDate}.csv`
    );
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
      <div className="w-full">
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
                  className="w-auto text-xs h-8 transition-none"
                />
              </div>
            </div>

            <div className="flex justify-center">
              <Button onClick={exportToCSV} className="text-xs font-medium">
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* P&L Table */}
        <Card className="py-3">
          <CardContent className="p-0">
            <h1 className="text-2xl font-bold text-slate-800 mb-1 text-center">Profit & Loss</h1>
            <p className="text-sm text-slate-600 mb-3 text-center">
              {new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} to{" "}
              {new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
            <Table className="border border-gray-300">
              <TableHeader className="bg-gray-100">
                <TableRow>
                  <TableHead
                    className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                    style={{ width: "25%" }}
                  >
                    Account
                  </TableHead>
                  {isMonthlyView ? (
                    <>
                      {getMonthsInRange().map((month) => (
                        <TableHead
                          key={month}
                          className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                          style={{ width: `${65 / (getMonthsInRange().length + 1)}% !important` }}
                        >
                          {formatMonth(month)}
                        </TableHead>
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
                        className="border p-1 text-xs"
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
                            <TableCell className="border p-1 text-right text-xs" style={{ width: "15%" }}>
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
                      <TableCell className="border p-1 text-right text-xs" style={{ width: "15%" }}>
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
                              <TableCell className="border p-1 text-right text-xs" style={{ width: "15%" }}>
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
                          <TableCell className="border p-1 text-right text-xs" style={{ width: "15%" }}>
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
                    Export
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
