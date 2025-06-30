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
  _viewerType?: string;
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

export default function BalanceSheetPage() {
  const { currentCompany } = useAuthStore();
  const hasCompanyContext = !!currentCompany;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<Transaction[]>([]);
  const [asOfDate, setAsOfDate] = useState<string>("");
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [viewerModal, setViewerModal] = useState<{
    isOpen: boolean;
    category: Account | null;
    selectedMonth?: string;
  }>({
    isOpen: false,
    category: null,
  });
  const [isMonthlyView, setIsMonthlyView] = useState(false);
  const [showPercentages, setShowPercentages] = useState(false);
  // eslint-disable-next-line
  const [showPreviousPeriod, setShowPreviousPeriod] = useState(false);

  // Period Selector state
  const [selectedPeriod, setSelectedPeriod] = useState("thisYearToToday");
  const [selectedDisplay, setSelectedDisplay] = useState("totalOnly");
  // const [selectedComparison, setSelectedComparison] = useState("none");

  // Helper: format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper: get last day of month
  const getMonthEnd = (date: Date): Date => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  };

  // Helper: get last day of quarter
  const getQuarterEnd = (date: Date): Date => {
    const quarter = Math.floor(date.getMonth() / 3);
    return new Date(date.getFullYear(), (quarter + 1) * 3, 0);
  };

  // Handle period selector changes
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);

    const today = new Date();
    let endDate: Date;

    switch (period) {
      case "thisMonth":
        endDate = getMonthEnd(today);
        break;
      case "lastMonth":
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        endDate = getMonthEnd(lastMonth);
        break;
      case "last4Months":
        endDate = getMonthEnd(new Date(today.getFullYear(), today.getMonth() - 1, 1));
        break;
      case "last12Months":
        endDate = getMonthEnd(today);
        break;
      case "thisQuarter":
        endDate = getQuarterEnd(today);
        break;
      case "lastQuarter":
        const lastQuarter = new Date(today.getFullYear(), today.getMonth() - 3, 1);
        endDate = getQuarterEnd(lastQuarter);
        break;
      case "thisYearToLastMonth":
        endDate = getMonthEnd(new Date(today.getFullYear(), today.getMonth() - 1, 1));
        break;
      case "thisYearToToday":
      default:
        endDate = today;
        break;
    }

    setAsOfDate(formatDate(endDate));
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

  // Calculate today's date once
  const today = React.useMemo(() => new Date().toISOString().split("T")[0], []);

  useEffect(() => {
    setAsOfDate(today);
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
          .in("type", ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense"]);
        setAccounts(accountsData || []);

        // Fetch regular journal entries
        let journalQuery = supabase.from("journal").select("*").eq("company_id", currentCompany!.id);
        if (asOfDate) {
          journalQuery = journalQuery.lte("date", asOfDate);
        }
        const { data: journalData } = await journalQuery;

        // Fetch manual journal entries
        let manualJournalQuery = supabase
          .from("manual_journal_entries")
          .select("*")
          .eq("company_id", currentCompany!.id);
        if (asOfDate) {
          manualJournalQuery = manualJournalQuery.lte("date", asOfDate);
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
        console.error("Error fetching balance sheet data:", error);
      } finally {
        setLoading(false);
      }
    };
    if (asOfDate) fetchData();
  }, [asOfDate, currentCompany?.id, hasCompanyContext]);

  // Helper: get months from start of year to asOfDate
  const getMonthsInRange = () => {
    const months: string[] = [];

    // Parse asOfDate
    const [endYear, endMonth, endDay] = asOfDate.split("-").map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    // Start from January of the same year
    let current = new Date(endYear, 0, 1); // January 1st

    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0");
      months.push(`${year}-${month}`);

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

  // Helper: calculate account total for a specific month (as of end of month)
  const calculateAccountTotalForMonth = (account: Account, month: string): number => {
    // Get the last day of the specified month
    const [year, monthNum] = month.split("-").map(Number);
    const monthEndDate = new Date(year, monthNum, 0); // Last day of the month
    const monthEndDateStr = formatDate(monthEndDate);

    let total = 0;
    if (account.type === "Asset") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date <= monthEndDateStr)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date <= monthEndDateStr)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      total = totalDebits - totalCredits;
    } else if (account.type === "Liability" || account.type === "Equity") {
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date <= monthEndDateStr)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date <= monthEndDateStr)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      total = totalCredits - totalDebits;
    }
    return total;
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

  // Percentage calculation helpers
  const formatPercentage = (num: number, base: number): string => {
    if (base === 0) return "—";
    const percentage = (num / Math.abs(base)) * 100;
    return `${percentage.toFixed(1)}%`;
  };

  const formatPercentageForAccount = (num: number, accountType: string): string => {
    let base = 0;
    if (accountType === "Asset") {
      base = totalAssets;
    } else if (accountType === "Liability") {
      base = totalLiabilities;
    } else if (accountType === "Equity") {
      base = totalEquityWithNetIncome;
    }
    return formatPercentage(num, base);
  };

  // Helpers for subaccounts and totals
  const getSubaccounts = (parentId: string) => accounts.filter((acc) => acc.parent_id === parentId);

  const calculateAccountTotal = (account: Account): number => {
    let total = 0;
    if (account.type === "Asset") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      total = totalDebits - totalCredits;
    } else if (account.type === "Liability" || account.type === "Equity") {
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      total = totalCredits - totalDebits;
    }
    // Add subaccounts' totals
    const subaccounts = getSubaccounts(account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotal(sub);
    }
    return total;
  };

  const calculateAccountDirectTotal = (account: Account): number => {
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

  const getAllAccountIds = (account: Account): string[] => {
    const subaccounts = getSubaccounts(account.id);
    return [account.id, ...subaccounts.flatMap(getAllAccountIds)];
  };

  const getAllGroupAccountIds = (accounts: Account[]): string[] => accounts.flatMap((acc) => getAllAccountIds(acc));

  // Check if an account should be shown (has transactions or children with transactions)
  const shouldShowAccount = (account: Account): boolean => {
    // Check if account has direct transactions
    const directTotal = calculateAccountDirectTotal(account);
    if (directTotal !== 0) {
      return true;
    }

    // Check if any child accounts should be shown (recursive)
    const subaccounts = getSubaccounts(account.id);
    return subaccounts.some(shouldShowAccount);
  };

  // Filter accounts to only show those with transactions or children with transactions
  const getVisibleAccounts = (accountsList: Account[]): Account[] => {
    return accountsList.filter(shouldShowAccount);
  };

  // Toggle functions for collapse/expand
  const toggleSection = (sectionName: string) => {
    const newCollapsed = new Set(collapsedSections);
    if (newCollapsed.has(sectionName)) {
      newCollapsed.delete(sectionName);
    } else {
      newCollapsed.add(sectionName);
    }
    setCollapsedSections(newCollapsed);
  };

  const toggleAccount = (accountId: string) => {
    const newCollapsed = new Set(collapsedAccounts);
    if (newCollapsed.has(accountId)) {
      newCollapsed.delete(accountId);
    } else {
      newCollapsed.add(accountId);
    }
    setCollapsedAccounts(newCollapsed);
  };

  // Render account row for monthly view
  const renderAccountRowWithMonthlyTotals = (account: Account, level = 0) => {
    const subaccounts = getSubaccounts(account.id).filter(shouldShowAccount);
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
          className={`cursor-pointer hover:bg-slate-50 transition-colors ${level > 0 ? "bg-slate-25" : ""}`}
          onClick={() => {
            setSelectedAccount({
              ...account,
              _viewerType: isParent && isCollapsed ? "rollup" : "direct",
            });
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
                  setSelectedAccount(account);
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
                <TableCell className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentageForAccount(
                    isParent && isCollapsed
                      ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                      : calculateAccountTotalForMonth(account, month),
                    account.type
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
                account.type
              )}
            </TableCell>
          )}
        </TableRow>
        {!isCollapsed && subaccounts.map((sub) => renderAccountRowWithMonthlyTotals(sub, level + 1))}
        {isParent && !isCollapsed && (
          <TableRow
            key={`${account.id}-total`}
            className="cursor-pointer hover:bg-blue-50 transition-colors"
            onClick={() => {
              setSelectedAccount({ ...account, _viewerType: "rollup" });
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
                    {formatPercentageForAccount(
                      calculateAccountTotalForMonthWithSubaccounts(account, month),
                      account.type
                    )}
                  </TableCell>
                )}
              </React.Fragment>
            ))}
            <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
              {formatNumber(calculateAccountTotal(account))}
            </TableCell>
            {showPercentages && (
              <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                {formatPercentageForAccount(calculateAccountTotal(account), account.type)}
              </TableCell>
            )}
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  // Render account row and its subaccounts, with a total line for each parent
  const renderAccountRowWithTotal = (account: Account, level = 0): React.ReactElement => {
    const subaccounts = getSubaccounts(account.id).filter(shouldShowAccount);
    const directTotal = calculateAccountDirectTotal(account);
    const rollupTotal = calculateAccountTotal(account);
    const isParent = subaccounts.length > 0;
    const isCollapsed = collapsedAccounts.has(account.id);
    const isChild = level > 0;

    // if (rollupTotal === 0) return null

    return (
      <>
        <TableRow
          key={account.id}
          className={`cursor-pointer hover:bg-slate-50 transition-colors ${isChild ? "bg-slate-25" : ""}`}
          onClick={() => {
            setSelectedAccount({
              ...account,
              _viewerType: isParent && isCollapsed ? "rollup" : "direct",
            });
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
                !isChild && <div className="mr-2 w-5"></div>
              )}
              <span className="font-semibold">{account.name}</span>
            </div>
          </TableCell>
          <TableCell className="border p-1 text-right text-xs" style={{ width: "20%" }}>
            {formatNumber(isParent && isCollapsed ? rollupTotal : directTotal)}
          </TableCell>
          {showPercentages && (
            <TableCell className="border p-1 text-right text-xs text-slate-600">
              {formatPercentageForAccount(isParent && isCollapsed ? rollupTotal : directTotal, account.type)}
            </TableCell>
          )}
          {showPreviousPeriod && (
            <>
              <TableCell className="border p-1 text-right text-xs" style={{ width: "20%" }}>
                {/* Previous period would need additional data fetching */}—
              </TableCell>
              {showPercentages && <TableCell className="border p-1 text-right text-xs text-slate-600">—</TableCell>}
              <TableCell className="border p-1 text-right text-xs" style={{ width: "20%" }}>
                —
              </TableCell>
            </>
          )}
        </TableRow>
        {!isCollapsed &&
          subaccounts.map((sub) => (
            <React.Fragment key={sub.id}>{renderAccountRowWithTotal(sub, level + 1)}</React.Fragment>
          ))}
        {isParent && !isCollapsed && (
          <TableRow
            className="cursor-pointer hover:bg-blue-50 transition-colors"
            onClick={() => {
              setSelectedAccount({ ...account, _viewerType: "rollup" });
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
              {formatNumber(rollupTotal)}
            </TableCell>
            {showPercentages && (
              <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                {formatPercentageForAccount(rollupTotal, account.type)}
              </TableCell>
            )}
            {showPreviousPeriod && (
              <>
                <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs" style={{ width: "20%" }}>
                  —
                </TableCell>
                {showPercentages && (
                  <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">—</TableCell>
                )}
                <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs" style={{ width: "20%" }}>
                  —
                </TableCell>
              </>
            )}
          </TableRow>
        )}
      </>
    );
  };

  // Top-level accounts (no parent) - filtered to only show accounts with transactions
  const assetRows = getVisibleAccounts(accounts.filter((a) => a.type === "Asset" && !a.parent_id));
  const liabilityRows = getVisibleAccounts(accounts.filter((a) => a.type === "Liability" && !a.parent_id));

  // For equity accounts, show them even if they have zero balances (important for balance sheet)
  const allEquityAccounts = accounts.filter((a) => a.type === "Equity" && !a.parent_id);
  const equityRows = allEquityAccounts; // Show all equity accounts, not just those with transactions
  const revenueAccounts = accounts.filter((a) => a.type === "Revenue");
  const cogsAccounts = accounts.filter((a) => a.type === "COGS");
  const expenseAccounts = accounts.filter((a) => a.type === "Expense");

  // Net Income calculation (proper P&L logic with subaccounts)
  const calculatePLAccountTotal = (account: Account): number => {
    let total = 0;

    if (account.type === "Revenue") {
      // Revenue: credits minus debits
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      total = totalCredits - totalDebits;
    } else if (account.type === "Expense" || account.type === "COGS") {
      // Expenses/COGS: debits minus credits
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      total = totalDebits - totalCredits;
    }

    // Add subaccounts' totals recursively
    const subaccounts = getSubaccounts(account.id);
    for (const sub of subaccounts) {
      total += calculatePLAccountTotal(sub);
    }

    return total;
  };

  const calculatePLGroupTotal = (accounts: Account[]): number => {
    return accounts
      .filter((acc) => !acc.parent_id) // Only top-level accounts
      .reduce((sum, acc) => sum + calculatePLAccountTotal(acc), 0);
  };

  // Helper: calculate P&L account total for a specific month (cumulative from year start)
  const calculatePLAccountTotalForMonth = (account: Account, month: string): number => {
    // Get the last day of the specified month
    const [year, monthNum] = month.split("-").map(Number);
    const monthEndDate = new Date(year, monthNum, 0); // Last day of the month
    const monthEndDateStr = formatDate(monthEndDate);

    // Start from beginning of the year
    const yearStartDate = `${year}-01-01`;

    let total = 0;

    if (account.type === "Revenue") {
      // Revenue: credits minus debits
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date >= yearStartDate && tx.date <= monthEndDateStr)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date >= yearStartDate && tx.date <= monthEndDateStr)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      total = totalCredits - totalDebits;
    } else if (account.type === "Expense" || account.type === "COGS") {
      // Expenses/COGS: debits minus credits
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date >= yearStartDate && tx.date <= monthEndDateStr)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date >= yearStartDate && tx.date <= monthEndDateStr)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      total = totalDebits - totalCredits;
    }

    // Add subaccounts' totals recursively
    const subaccounts = getSubaccounts(account.id);
    for (const sub of subaccounts) {
      total += calculatePLAccountTotalForMonth(sub, month);
    }

    return total;
  };

  // Helper: calculate P&L group total for a specific month (cumulative from year start)
  const calculatePLGroupTotalForMonth = (accounts: Account[], month: string): number => {
    return accounts
      .filter((acc) => !acc.parent_id) // Only top-level accounts
      .reduce((sum, acc) => sum + calculatePLAccountTotalForMonth(acc, month), 0);
  };

  const totalRevenue = calculatePLGroupTotal(revenueAccounts);
  const totalCOGS = calculatePLGroupTotal(cogsAccounts);
  const totalExpenses = calculatePLGroupTotal(expenseAccounts);
  const netIncome = totalRevenue - totalCOGS - totalExpenses;

  // Totals
  const totalAssets = assetRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const totalLiabilities = liabilityRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
  const totalEquity = equityRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);

  // Total equity with net income (proper accounting approach)
  const totalEquityWithNetIncome = totalEquity + netIncome;
  const liabilitiesAndEquity = totalLiabilities + totalEquityWithNetIncome;

  // Calculate the actual balance sheet discrepancy
  const balanceDifference = totalAssets - liabilitiesAndEquity;

  // Quick view: transactions for selected account or group
  const selectedAccountTransactions = selectedAccount
    ? (() => {
        let transactions =
          selectedAccount._viewerType === "rollup"
            ? journalEntries.filter((tx) => getAllAccountIds(selectedAccount).includes(tx.chart_account_id))
            : selectedAccount.id === "ASSET_GROUP"
            ? journalEntries.filter((tx) => getAllGroupAccountIds(assetRows).includes(tx.chart_account_id))
            : selectedAccount.id === "LIABILITY_GROUP"
            ? journalEntries.filter((tx) => getAllGroupAccountIds(liabilityRows).includes(tx.chart_account_id))
            : selectedAccount.id === "EQUITY_GROUP"
            ? journalEntries.filter(
                (tx) =>
                  getAllGroupAccountIds(equityRows).includes(tx.chart_account_id) ||
                  ["Revenue", "COGS", "Expense"].includes(
                    accounts.find((a) => a.id === tx.chart_account_id)?.type || ""
                  )
              )
            : selectedAccount.id === "NET_INCOME"
            ? journalEntries.filter((tx) =>
                ["Revenue", "COGS", "Expense"].includes(accounts.find((a) => a.id === tx.chart_account_id)?.type || "")
              )
            : selectedAccount.id === "TOTAL_LIAB_EQUITY_GROUP"
            ? journalEntries.filter(
                (tx) =>
                  getAllGroupAccountIds(liabilityRows).includes(tx.chart_account_id) ||
                  getAllGroupAccountIds(equityRows).includes(tx.chart_account_id) ||
                  ["Revenue", "COGS", "Expense"].includes(
                    accounts.find((a) => a.id === tx.chart_account_id)?.type || ""
                  )
              )
            : journalEntries.filter((tx) => tx.chart_account_id === selectedAccount.id);

        // If a specific month is selected, filter transactions appropriately
        const selectedMonth = viewerModal.selectedMonth;
        if (selectedMonth && typeof selectedMonth === "string") {
          if (selectedAccount.id === "NET_INCOME") {
            // For Net Income, show cumulative transactions from year start to end of selected month
            const [year, monthNum] = selectedMonth.split("-").map(Number);
            const monthEndDate = new Date(year, monthNum, 0); // Last day of the month
            const monthEndDateStr = formatDate(monthEndDate);
            const yearStartDate = `${year}-01-01`;

            transactions = transactions.filter((tx) => tx.date >= yearStartDate && tx.date <= monthEndDateStr);
          } else {
            // For other accounts, show transactions for that month only
            transactions = transactions.filter((tx) => tx.date.startsWith(selectedMonth));
          }
        }

        return transactions;
      })()
    : [];

  const formatNumber = (num: number): string => {
    if (Math.abs(num) < 0.01) return "—";
    const formatted = Math.abs(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return num < 0 ? `(${formatted})` : formatted;
  };

  // Export function
  const exportToCSV = () => {
    const csvData = [];

    // Header
    if (isMonthlyView) {
      const headerRow = ["Account"];
      const months = getMonthsInRange();

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

      csvData.push(["Balance Sheet", `As of ${asOfDate}`]);
      csvData.push([""]);
      csvData.push(headerRow);
    } else {
      const headerRow = ["Account", "Amount"];

      if (showPercentages) {
        headerRow.push("%");
      }

      if (showPreviousPeriod) {
        headerRow.push("Previous Year");
        if (showPercentages) {
          headerRow.push("%");
        }
        headerRow.push("Difference");
      }

      csvData.push(["Balance Sheet", `As of ${asOfDate}`]);
      csvData.push([""]);
      csvData.push(headerRow);
    }

    // Assets section
    csvData.push(["ASSETS"]);

    if (isMonthlyView) {
      // Export assets with monthly columns
      assetRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);
        const months = getMonthsInRange();

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
                account.type
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
              account.type
            )
          );
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(shouldShowAccount)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`];

              months.forEach((month: string) => {
                subRow.push(formatNumber(calculateAccountTotalForMonth(sub, month)));
                if (showPercentages) {
                  subRow.push(formatPercentageForAccount(calculateAccountTotalForMonth(sub, month), sub.type));
                }
              });

              subRow.push(formatNumber(calculateAccountDirectTotal(sub)));
              if (showPercentages) {
                subRow.push(formatPercentageForAccount(calculateAccountDirectTotal(sub), sub.type));
              }

              csvData.push(subRow);
            });
        }
      });

      // Total Assets row
      const totalAssetsRow = ["TOTAL ASSETS"];
      const months = getMonthsInRange();

      months.forEach((month: string) => {
        totalAssetsRow.push(
          formatNumber(assetRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0))
        );

        if (showPercentages) {
          totalAssetsRow.push("100.0%");
        }
      });

      totalAssetsRow.push(formatNumber(totalAssets));
      if (showPercentages) {
        totalAssetsRow.push("100.0%");
      }

      csvData.push(totalAssetsRow);
    } else {
      // Export assets without monthly breakdown
      assetRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);
        const accountRow = [
          account.name,
          formatNumber(isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)),
        ];

        if (showPercentages) {
          accountRow.push(
            formatPercentageForAccount(
              isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
              account.type
            )
          );
        }

        if (showPreviousPeriod) {
          accountRow.push("—"); // Previous period data not implemented yet
          if (showPercentages) {
            accountRow.push("—");
          }
          accountRow.push("—");
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(shouldShowAccount)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`, formatNumber(calculateAccountDirectTotal(sub))];

              if (showPercentages) {
                subRow.push(formatPercentageForAccount(calculateAccountDirectTotal(sub), sub.type));
              }

              if (showPreviousPeriod) {
                subRow.push("—");
                if (showPercentages) {
                  subRow.push("—");
                }
                subRow.push("—");
              }

              csvData.push(subRow);
            });
        }
      });

      // Total Assets row
      const totalAssetsRow = ["TOTAL ASSETS", formatNumber(totalAssets)];

      if (showPercentages) {
        totalAssetsRow.push("100.0%");
      }

      if (showPreviousPeriod) {
        totalAssetsRow.push("—");
        if (showPercentages) {
          totalAssetsRow.push("—");
        }
        totalAssetsRow.push("—");
      }

      csvData.push(totalAssetsRow);
    }

    csvData.push([""]);

    // Liabilities & Equity section
    csvData.push(["LIABILITIES & EQUITY"]);
    csvData.push(["Liabilities"]);

    if (isMonthlyView) {
      // Export liabilities with monthly columns
      liabilityRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);
        const months = getMonthsInRange();

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
                account.type
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
              account.type
            )
          );
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(shouldShowAccount)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`];

              months.forEach((month: string) => {
                subRow.push(formatNumber(calculateAccountTotalForMonth(sub, month)));
                if (showPercentages) {
                  subRow.push(formatPercentageForAccount(calculateAccountTotalForMonth(sub, month), sub.type));
                }
              });

              subRow.push(formatNumber(calculateAccountDirectTotal(sub)));
              if (showPercentages) {
                subRow.push(formatPercentageForAccount(calculateAccountDirectTotal(sub), sub.type));
              }

              csvData.push(subRow);
            });
        }
      });

      // Total Liabilities row
      const totalLiabilitiesRow = ["Total Liabilities"];
      const months = getMonthsInRange();

      months.forEach((month: string) => {
        totalLiabilitiesRow.push(
          formatNumber(
            liabilityRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0)
          )
        );

        if (showPercentages) {
          totalLiabilitiesRow.push(
            formatPercentageForAccount(
              liabilityRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0),
              "Liability"
            )
          );
        }
      });

      totalLiabilitiesRow.push(formatNumber(totalLiabilities));
      if (showPercentages) {
        totalLiabilitiesRow.push(formatPercentageForAccount(totalLiabilities, "Liability"));
      }

      csvData.push(totalLiabilitiesRow);
    } else {
      // Export liabilities without monthly breakdown
      liabilityRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);
        const accountRow = [
          account.name,
          formatNumber(isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)),
        ];

        if (showPercentages) {
          accountRow.push(
            formatPercentageForAccount(
              isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
              account.type
            )
          );
        }

        if (showPreviousPeriod) {
          accountRow.push("—"); // Previous period data not implemented yet
          if (showPercentages) {
            accountRow.push("—");
          }
          accountRow.push("—");
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(shouldShowAccount)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`, formatNumber(calculateAccountDirectTotal(sub))];

              if (showPercentages) {
                subRow.push(formatPercentageForAccount(calculateAccountDirectTotal(sub), sub.type));
              }

              if (showPreviousPeriod) {
                subRow.push("—");
                if (showPercentages) {
                  subRow.push("—");
                }
                subRow.push("—");
              }

              csvData.push(subRow);
            });
        }
      });

      // Total Liabilities row
      const totalLiabilitiesRow = ["Total Liabilities", formatNumber(totalLiabilities)];

      if (showPercentages) {
        totalLiabilitiesRow.push(formatPercentageForAccount(totalLiabilities, "Liability"));
      }

      if (showPreviousPeriod) {
        totalLiabilitiesRow.push("—");
        if (showPercentages) {
          totalLiabilitiesRow.push("—");
        }
        totalLiabilitiesRow.push("—");
      }

      csvData.push(totalLiabilitiesRow);
    }

    csvData.push([""]);
    csvData.push(["Equity"]);

    if (isMonthlyView) {
      // Export equity with monthly columns
      equityRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);
        const months = getMonthsInRange();

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
                account.type
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
              account.type
            )
          );
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(shouldShowAccount)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`];

              months.forEach((month: string) => {
                subRow.push(formatNumber(calculateAccountTotalForMonth(sub, month)));
                if (showPercentages) {
                  subRow.push(formatPercentageForAccount(calculateAccountTotalForMonth(sub, month), sub.type));
                }
              });

              subRow.push(formatNumber(calculateAccountDirectTotal(sub)));
              if (showPercentages) {
                subRow.push(formatPercentageForAccount(calculateAccountDirectTotal(sub), sub.type));
              }

              csvData.push(subRow);
            });
        }
      });

      // Net Income row if not zero
      if (netIncome !== 0) {
        const netIncomeRow = ["Net Income"];
        const months = getMonthsInRange();

        months.forEach((month: string) => {
          netIncomeRow.push(
            formatNumber(
              calculatePLGroupTotalForMonth(revenueAccounts, month) -
                calculatePLGroupTotalForMonth(cogsAccounts, month) -
                calculatePLGroupTotalForMonth(expenseAccounts, month)
            )
          );

          if (showPercentages) {
            netIncomeRow.push(
              formatPercentageForAccount(
                calculatePLGroupTotalForMonth(revenueAccounts, month) -
                  calculatePLGroupTotalForMonth(cogsAccounts, month) -
                  calculatePLGroupTotalForMonth(expenseAccounts, month),
                "Equity"
              )
            );
          }
        });

        netIncomeRow.push(formatNumber(netIncome));
        if (showPercentages) {
          netIncomeRow.push(formatPercentageForAccount(netIncome, "Equity"));
        }

        csvData.push(netIncomeRow);
      }

      // Total Equity row
      const totalEquityRow = ["Total Equity"];
      const months = getMonthsInRange();

      months.forEach((month: string) => {
        const monthlyEquityTotal =
          equityRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) +
          (calculatePLGroupTotalForMonth(revenueAccounts, month) -
            calculatePLGroupTotalForMonth(cogsAccounts, month) -
            calculatePLGroupTotalForMonth(expenseAccounts, month));

        totalEquityRow.push(formatNumber(monthlyEquityTotal));

        if (showPercentages) {
          totalEquityRow.push(formatPercentageForAccount(monthlyEquityTotal, "Equity"));
        }
      });

      totalEquityRow.push(formatNumber(totalEquityWithNetIncome));
      if (showPercentages) {
        totalEquityRow.push(formatPercentageForAccount(totalEquityWithNetIncome, "Equity"));
      }

      csvData.push(totalEquityRow);
    } else {
      // Export equity without monthly breakdown
      equityRows.forEach((account) => {
        const isCollapsed = collapsedAccounts.has(account.id);
        const accountRow = [
          account.name,
          formatNumber(isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)),
        ];

        if (showPercentages) {
          accountRow.push(
            formatPercentageForAccount(
              isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
              account.type
            )
          );
        }

        if (showPreviousPeriod) {
          accountRow.push("—"); // Previous period data not implemented yet
          if (showPercentages) {
            accountRow.push("—");
          }
          accountRow.push("—");
        }

        csvData.push(accountRow);

        // Add subaccounts if not collapsed
        if (!isCollapsed) {
          getSubaccounts(account.id)
            .filter(shouldShowAccount)
            .forEach((sub) => {
              const subRow = [`  ${sub.name}`, formatNumber(calculateAccountDirectTotal(sub))];

              if (showPercentages) {
                subRow.push(formatPercentageForAccount(calculateAccountDirectTotal(sub), sub.type));
              }

              if (showPreviousPeriod) {
                subRow.push("—");
                if (showPercentages) {
                  subRow.push("—");
                }
                subRow.push("—");
              }

              csvData.push(subRow);
            });
        }
      });

      // Net Income row if not zero
      if (netIncome !== 0) {
        const netIncomeRow = ["Net Income", formatNumber(netIncome)];

        if (showPercentages) {
          netIncomeRow.push(formatPercentageForAccount(netIncome, "Equity"));
        }

        if (showPreviousPeriod) {
          netIncomeRow.push("—");
          if (showPercentages) {
            netIncomeRow.push("—");
          }
          netIncomeRow.push("—");
        }

        csvData.push(netIncomeRow);
      }

      // Total Equity row
      const totalEquityRow = ["Total Equity", formatNumber(totalEquityWithNetIncome)];

      if (showPercentages) {
        totalEquityRow.push(formatPercentageForAccount(totalEquityWithNetIncome, "Equity"));
      }

      if (showPreviousPeriod) {
        totalEquityRow.push("—");
        if (showPercentages) {
          totalEquityRow.push("—");
        }
        totalEquityRow.push("—");
      }

      csvData.push(totalEquityRow);
    }

    csvData.push([""]);

    // Total Liabilities + Equity row
    if (isMonthlyView) {
      const totalLiabEquityRow = ["TOTAL LIABILITIES + EQUITY"];

      getMonthsInRange().forEach((month: string) => {
        const monthlyTotal =
          liabilityRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) +
          equityRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) +
          (calculatePLGroupTotalForMonth(revenueAccounts, month) -
            calculatePLGroupTotalForMonth(cogsAccounts, month) -
            calculatePLGroupTotalForMonth(expenseAccounts, month));

        totalLiabEquityRow.push(formatNumber(monthlyTotal));

        if (showPercentages) {
          totalLiabEquityRow.push("100.0%");
        }
      });

      totalLiabEquityRow.push(formatNumber(liabilitiesAndEquity));
      if (showPercentages) {
        totalLiabEquityRow.push("100.0%");
      }

      csvData.push(totalLiabEquityRow);
    } else {
      const totalLiabEquityRow = ["TOTAL LIABILITIES + EQUITY", formatNumber(liabilitiesAndEquity)];

      if (showPercentages) {
        totalLiabEquityRow.push("100.0%");
      }

      if (showPreviousPeriod) {
        totalLiabEquityRow.push("—");
        if (showPercentages) {
          totalLiabEquityRow.push("—");
        }
        totalLiabEquityRow.push("—");
      }

      csvData.push(totalLiabEquityRow);
    }

    // Out of balance row if needed
    if (Math.abs(balanceDifference) > 0.01) {
      if (isMonthlyView) {
        const outOfBalanceRow = ["OUT OF BALANCE"];

        // Add the same value for each month
        const monthCount = getMonthsInRange().length;
        for (let i = 0; i < monthCount; i++) {
          outOfBalanceRow.push(formatNumber(balanceDifference));
          if (showPercentages) {
            outOfBalanceRow.push("—");
          }
        }

        outOfBalanceRow.push(formatNumber(balanceDifference));
        if (showPercentages) {
          outOfBalanceRow.push("—");
        }

        csvData.push(outOfBalanceRow);
      } else {
        const outOfBalanceRow = ["OUT OF BALANCE", formatNumber(balanceDifference)];

        if (showPercentages) {
          outOfBalanceRow.push("—");
        }

        if (showPreviousPeriod) {
          outOfBalanceRow.push("—");
          if (showPercentages) {
            outOfBalanceRow.push("—");
          }
          outOfBalanceRow.push("—");
        }

        csvData.push(outOfBalanceRow);
      }
    }

    const csvContent = csvData.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `balance-sheet-${asOfDate}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export modal transactions function
  const exportModalTransactions = () => {
    if (!viewerModal.category || selectedAccountTransactions.length === 0) return;

    const csvData = [];

    // Header with category info
    csvData.push([
      `${viewerModal.category.name} Transactions`,
      viewerModal.selectedMonth
        ? viewerModal.category.id === "NET_INCOME"
          ? `through ${formatMonth(viewerModal.selectedMonth)}`
          : `for ${formatMonth(viewerModal.selectedMonth)}`
        : `as of ${asOfDate}`,
    ]);
    csvData.push([""]);

    // Table headers
    csvData.push(["Date", "Description", "Source", "Amount"]);

    // Transaction rows
    selectedAccountTransactions.forEach((tx) => {
      const debit = Number(tx.debit) || 0;
      const credit = Number(tx.credit) || 0;
      const amount = debit - credit;
      const source = tx.source === "manual" ? "Manual" : "Journal";

      let displayAmount;
      if (viewerModal.category?.type === "Asset") {
        displayAmount = amount;
      } else if (viewerModal.category?.type === "Liability" || viewerModal.category?.type === "Equity") {
        displayAmount = -amount;
      } else {
        displayAmount = amount;
      }

      csvData.push([tx.date, tx.description, source, displayAmount.toFixed(2)]);
    });

    // Total row
    const total = selectedAccountTransactions.reduce((sum, tx) => {
      const debit = Number(tx.debit) || 0;
      const credit = Number(tx.credit) || 0;
      const amount = debit - credit;

      if (viewerModal.category?.type === "Asset") {
        return sum + amount;
      } else if (viewerModal.category?.type === "Liability" || viewerModal.category?.type === "Equity") {
        return sum - amount;
      } else {
        return sum + amount;
      }
    }, 0);

    csvData.push([""]);
    csvData.push(["Total", "", "", total.toFixed(2)]);

    // Generate and download CSV
    const csvContent = csvData.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${viewerModal.category.name.replace(/[^a-zA-Z0-9]/g, "-")}-transactions-${asOfDate}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Check if user has company context
  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-sm text-yellow-700">
            Please select a company from the dropdown in the navigation bar to view balance sheet reports.
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
              <div className="flex items-center justify-center gap-4 text-sm">
                <Input
                  type="date"
                  value={asOfDate}
                  max={today}
                  onChange={(e) => {
                    const newDate = e.target.value;

                    // Prevent setting date in the future
                    if (newDate > today) {
                      setAsOfDate(today);
                      return;
                    }

                    setAsOfDate(newDate);
                  }}
                  className="w-auto text-sm h-8 transition-none"
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
        {/* Balance Sheet Warning */}
        {Math.abs(balanceDifference) > 0.01 && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <h3 className="text-sm font-semibold text-red-800 mb-2">Balance Sheet Out of Balance</h3>
            <p className="text-sm text-red-700">
              Assets ({formatNumber(totalAssets)}) do not equal Liabilities + Equity (
              {formatNumber(liabilitiesAndEquity)}). Difference: {formatNumber(balanceDifference)}
            </p>
            <p className="text-xs text-red-600 mt-2">
              Possible causes: Missing journal entries, incorrect account classifications, unrecorded transactions, or
              data entry errors. Review your transactions and ensure all entries are properly categorized.
            </p>
          </div>
        )}

        {/* Balance Sheet Table */}
        <Card className="py-3">
          <CardContent className="p-0">
            <h1 className="text-2xl font-bold text-slate-800 mb-1 text-center">Balance Sheet</h1>
            <p className="text-sm text-slate-600 mb-3 text-center">
              As of{" "}
              {new Date(asOfDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
                        <React.Fragment key={month}>
                          <TableHead
                            className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                            style={{
                              width: showPercentages
                                ? `${35 / ((getMonthsInRange().length + 1) * 2)}%`
                                : `${75 / (getMonthsInRange().length + 1)}%`,
                            }}
                          >
                            {formatMonth(month)}
                          </TableHead>
                          {showPercentages && (
                            <TableHead
                              className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                              style={{ width: `${40 / ((getMonthsInRange().length + 1) * 2)}%` }}
                            >
                              %
                            </TableHead>
                          )}
                        </React.Fragment>
                      ))}
                      <TableHead
                        className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                        style={{
                          width: showPercentages
                            ? `${35 / ((getMonthsInRange().length + 1) * 2)}%`
                            : `${75 / (getMonthsInRange().length + 1)}%`,
                        }}
                      >
                        Total
                      </TableHead>
                      {showPercentages && (
                        <TableHead
                          className="border p-1 text-center font-medium text-xs whitespace-nowrap"
                          style={{ width: `${40 / ((getMonthsInRange().length + 1) * 2)}%` }}
                        >
                          %
                        </TableHead>
                      )}
                    </>
                  ) : (
                    <>
                      <TableHead
                        className="border p-1 text-center font-medium text-xs"
                        style={{ width: showPercentages ? "20%" : "25%" }}
                      >
                        Amount
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
                            Previous Year
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
                    {/* ASSETS SECTION */}
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
                        ASSETS
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
                          <span className="text-sm text-slate-500">Loading assets...</span>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* SPACING ROW */}
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
                        className="py-3"
                      ></TableCell>
                    </TableRow>

                    {/* LIABILITIES & EQUITY SECTION */}
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
                        className="border p-1 font-bold text-xs"
                      >
                        LIABILITIES & EQUITY
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
                          <span className="text-sm text-slate-500">Loading liabilities & equity...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  </>
                ) : (
                  /* Normal Content */
                  <>
                    {/* ASSETS SECTION */}
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
                        className="border p-1 text-xs font-semibold"
                      >
                        ASSETS
                      </TableCell>
                    </TableRow>
                    {assetRows.length > 0 && (
                      <>
                        <TableRow className="cursor-pointer hover:bg-gray-100 transition-colors">
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
                            <div className="flex items-center">
                              <button
                                onClick={() => toggleSection("assets")}
                                className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors"
                              >
                                {collapsedSections.has("assets") ? (
                                  <ChevronRight className="w-3 h-3 text-gray-600" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-gray-600" />
                                )}
                              </button>
                              <span className="font-semibold">Current Assets</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {!collapsedSections.has("assets") && (
                          <>
                            {assetRows.map((row) => (
                              <React.Fragment key={row.id}>
                                {isMonthlyView
                                  ? renderAccountRowWithMonthlyTotals(row)
                                  : renderAccountRowWithTotal(row)}
                              </React.Fragment>
                            ))}
                          </>
                        )}
                      </>
                    )}
                    {/* Total Assets */}
                    <TableRow
                      className="cursor-pointer hover:bg-blue-50"
                      onClick={() => {
                        const assetGroup = {
                          id: "ASSET_GROUP",
                          name: "Total Assets",
                          type: "Asset",
                          parent_id: null,
                        };
                        setSelectedAccount(assetGroup);
                        setViewerModal({ isOpen: true, category: assetGroup });
                      }}
                    >
                      <TableCell className="border p-1 text-xs font-semibold" style={{ width: "30%" }}>
                        TOTAL ASSETS
                      </TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange().map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  assetRows.reduce(
                                    (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  )
                                )}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                                  100.0%
                                </TableCell>
                              )}
                            </React.Fragment>
                          ))}
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(totalAssets)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              100.0%
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right font-semibold text-xs" style={{ width: "20%" }}>
                            {formatNumber(totalAssets)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              100.0%
                            </TableCell>
                          )}
                          {showPreviousPeriod && (
                            <>
                              <TableCell
                                className="border p-1 text-right font-semibold text-xs"
                                style={{ width: "20%" }}
                              >
                                —
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                                  —
                                </TableCell>
                              )}
                              <TableCell
                                className="border p-1 text-right font-semibold text-xs"
                                style={{ width: "20%" }}
                              >
                                —
                              </TableCell>
                            </>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* SPACING ROW */}
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
                        className="py-3"
                      ></TableCell>
                    </TableRow>

                    {/* LIABILITIES & EQUITY SECTION */}
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
                        className="border p-1 font-bold text-xs"
                      >
                        LIABILITIES & EQUITY
                      </TableCell>
                    </TableRow>

                    {/* Liabilities */}
                    {liabilityRows.length > 0 && (
                      <>
                        <TableRow className="cursor-pointer hover:bg-gray-100 transition-colors">
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
                            <div className="flex items-center">
                              <button
                                onClick={() => toggleSection("liabilities")}
                                className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors"
                              >
                                {collapsedSections.has("liabilities") ? (
                                  <ChevronRight className="w-3 h-3 text-gray-600" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-gray-600" />
                                )}
                              </button>
                              <span className="font-semibold">Liabilities</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {!collapsedSections.has("liabilities") && (
                          <>
                            {liabilityRows.map((row) => (
                              <React.Fragment key={row.id}>
                                {isMonthlyView
                                  ? renderAccountRowWithMonthlyTotals(row)
                                  : renderAccountRowWithTotal(row)}
                              </React.Fragment>
                            ))}
                            <TableRow
                              className="cursor-pointer hover:bg-blue-50 transition-colors"
                              onClick={() => {
                                const liabilityGroup = {
                                  id: "LIABILITY_GROUP",
                                  name: "Total Liabilities",
                                  type: "Liability",
                                  parent_id: null,
                                };
                                setSelectedAccount(liabilityGroup);
                                setViewerModal({ isOpen: true, category: liabilityGroup });
                              }}
                            >
                              <TableCell className="border p-1 text-xs font-semibold">Total Liabilities</TableCell>
                              {isMonthlyView ? (
                                <>
                                  {getMonthsInRange().map((month) => (
                                    <React.Fragment key={month}>
                                      <TableCell className="border p-1 text-right font-semibold text-xs">
                                        {formatNumber(
                                          liabilityRows.reduce(
                                            (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                            0
                                          )
                                        )}
                                      </TableCell>
                                      {showPercentages && (
                                        <TableCell className="border p-1 text-right text-xs text-slate-600">
                                          {formatPercentageForAccount(
                                            liabilityRows.reduce(
                                              (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                              0
                                            ),
                                            "Liability"
                                          )}
                                        </TableCell>
                                      )}
                                    </React.Fragment>
                                  ))}
                                  <TableCell className="border p-1 text-right font-semibold text-xs">
                                    {formatNumber(totalLiabilities)}
                                  </TableCell>
                                  {showPercentages && (
                                    <TableCell className="border p-1 text-right text-xs text-slate-600">
                                      {formatPercentageForAccount(totalLiabilities, "Liability")}
                                    </TableCell>
                                  )}
                                </>
                              ) : (
                                <>
                                  <TableCell
                                    className="border p-1 text-right font-semibold text-xs"
                                    style={{ width: "20%" }}
                                  >
                                    {formatNumber(totalLiabilities)}
                                  </TableCell>
                                  {showPercentages && (
                                    <TableCell className="border p-1 text-right text-xs text-slate-600">
                                      {formatPercentageForAccount(totalLiabilities, "Liability")}
                                    </TableCell>
                                  )}
                                  {showPreviousPeriod && (
                                    <>
                                      <TableCell
                                        className="border p-1 text-right font-semibold text-xs"
                                        style={{ width: "20%" }}
                                      >
                                        —
                                      </TableCell>
                                      {showPercentages && (
                                        <TableCell className="border p-1 text-right text-xs text-slate-600">
                                          —
                                        </TableCell>
                                      )}
                                      <TableCell
                                        className="border p-1 text-right font-semibold text-xs"
                                        style={{ width: "20%" }}
                                      >
                                        —
                                      </TableCell>
                                    </>
                                  )}
                                </>
                              )}
                            </TableRow>
                          </>
                        )}
                      </>
                    )}

                    {/* Equity */}
                    {(equityRows.length > 0 || netIncome !== 0) && (
                      <>
                        <TableRow className="cursor-pointer hover:bg-gray-100 transition-colors">
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
                            <div className="flex items-center">
                              <button
                                onClick={() => toggleSection("equity")}
                                className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors"
                              >
                                {collapsedSections.has("equity") ? (
                                  <ChevronRight className="w-3 h-3 text-gray-600" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-gray-600" />
                                )}
                              </button>
                              <span className="font-semibold">Equity</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {!collapsedSections.has("equity") && (
                          <>
                            {equityRows.map((row) => (
                              <React.Fragment key={row.id}>
                                {isMonthlyView
                                  ? renderAccountRowWithMonthlyTotals(row)
                                  : renderAccountRowWithTotal(row)}
                              </React.Fragment>
                            ))}
                            {netIncome !== 0 && (
                              <TableRow
                                className="cursor-pointer hover:bg-slate-100 transition-colors"
                                onClick={() => {
                                  const netIncomeAccount = {
                                    id: "NET_INCOME",
                                    name: "Net Income",
                                    type: "Equity",
                                    parent_id: null,
                                  };
                                  setSelectedAccount(netIncomeAccount);
                                  setViewerModal({ isOpen: true, category: netIncomeAccount });
                                }}
                              >
                                <TableCell className="border p-1 text-xs bg-gray-50">
                                  <div className="flex items-center">
                                    <div className="mr-2 w-5"></div>
                                    <span className="font-semibold">Net Income</span>
                                  </div>
                                </TableCell>
                                {isMonthlyView ? (
                                  <>
                                    {getMonthsInRange().map((month) => (
                                      <React.Fragment key={month}>
                                        <TableCell
                                          className="border p-1 text-right font-semibold bg-gray-50 text-xs cursor-pointer hover:bg-gray-100"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const netIncomeAccount = {
                                              id: "NET_INCOME",
                                              name: "Net Income",
                                              type: "Equity",
                                              parent_id: null,
                                            };
                                            setSelectedAccount(netIncomeAccount);
                                            setViewerModal({
                                              isOpen: true,
                                              category: netIncomeAccount,
                                              selectedMonth: month,
                                            });
                                          }}
                                        >
                                          {formatNumber(
                                            calculatePLGroupTotalForMonth(revenueAccounts, month) -
                                              calculatePLGroupTotalForMonth(cogsAccounts, month) -
                                              calculatePLGroupTotalForMonth(expenseAccounts, month)
                                          )}
                                        </TableCell>
                                        {showPercentages && (
                                          <TableCell
                                            className="border p-1 text-right text-xs text-slate-600 bg-gray-50 cursor-pointer hover:bg-gray-100"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const netIncomeAccount = {
                                                id: "NET_INCOME",
                                                name: "Net Income",
                                                type: "Equity",
                                                parent_id: null,
                                              };
                                              setSelectedAccount(netIncomeAccount);
                                              setViewerModal({
                                                isOpen: true,
                                                category: netIncomeAccount,
                                                selectedMonth: month,
                                              });
                                            }}
                                          >
                                            {formatPercentageForAccount(
                                              calculatePLGroupTotalForMonth(revenueAccounts, month) -
                                                calculatePLGroupTotalForMonth(cogsAccounts, month) -
                                                calculatePLGroupTotalForMonth(expenseAccounts, month),
                                              "Equity"
                                            )}
                                          </TableCell>
                                        )}
                                      </React.Fragment>
                                    ))}
                                    <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                                      {formatNumber(netIncome)}
                                    </TableCell>
                                    {showPercentages && (
                                      <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                                        {formatPercentageForAccount(netIncome, "Equity")}
                                      </TableCell>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <TableCell
                                      className="border p-1 text-right font-semibold bg-gray-50 text-xs"
                                      style={{ width: "20%" }}
                                    >
                                      {formatNumber(netIncome)}
                                    </TableCell>
                                    {showPercentages && (
                                      <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                                        {formatPercentageForAccount(netIncome, "Equity")}
                                      </TableCell>
                                    )}
                                    {showPreviousPeriod && (
                                      <>
                                        <TableCell
                                          className="border p-1 text-right font-semibold bg-gray-50 text-xs"
                                          style={{ width: "20%" }}
                                        >
                                          —
                                        </TableCell>
                                        {showPercentages && (
                                          <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                                            —
                                          </TableCell>
                                        )}
                                        <TableCell
                                          className="border p-1 text-right font-semibold bg-gray-50 text-xs"
                                          style={{ width: "20%" }}
                                        >
                                          —
                                        </TableCell>
                                      </>
                                    )}
                                  </>
                                )}
                              </TableRow>
                            )}
                            <TableRow
                              className="cursor-pointer hover:bg-blue-50 transition-colors"
                              onClick={() => {
                                const equityGroup = {
                                  id: "EQUITY_GROUP",
                                  name: "Total Equity",
                                  type: "Equity",
                                  parent_id: null,
                                };
                                setSelectedAccount(equityGroup);
                                setViewerModal({ isOpen: true, category: equityGroup });
                              }}
                            >
                              <TableCell className="border p-1 text-xs font-semibold">Total Equity</TableCell>
                              {isMonthlyView ? (
                                <>
                                  {getMonthsInRange().map((month) => (
                                    <React.Fragment key={month}>
                                      <TableCell className="border p-1 text-right font-semibold text-xs">
                                        {formatNumber(
                                          equityRows.reduce(
                                            (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                            0
                                          ) +
                                            (calculatePLGroupTotalForMonth(revenueAccounts, month) -
                                              calculatePLGroupTotalForMonth(cogsAccounts, month) -
                                              calculatePLGroupTotalForMonth(expenseAccounts, month))
                                        )}
                                      </TableCell>
                                      {showPercentages && (
                                        <TableCell className="border p-1 text-right text-xs text-slate-600">
                                          {formatPercentageForAccount(
                                            equityRows.reduce(
                                              (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                              0
                                            ) +
                                              (calculatePLGroupTotalForMonth(revenueAccounts, month) -
                                                calculatePLGroupTotalForMonth(cogsAccounts, month) -
                                                calculatePLGroupTotalForMonth(expenseAccounts, month)),
                                            "Equity"
                                          )}
                                        </TableCell>
                                      )}
                                    </React.Fragment>
                                  ))}
                                  <TableCell className="border p-1 text-right font-semibold text-xs">
                                    {formatNumber(totalEquityWithNetIncome)}
                                  </TableCell>
                                  {showPercentages && (
                                    <TableCell className="border p-1 text-right text-xs text-slate-600">
                                      {formatPercentageForAccount(totalEquityWithNetIncome, "Equity")}
                                    </TableCell>
                                  )}
                                </>
                              ) : (
                                <>
                                  <TableCell
                                    className="border p-1 text-right font-semibold text-xs"
                                    style={{ width: "20%" }}
                                  >
                                    {formatNumber(totalEquityWithNetIncome)}
                                  </TableCell>
                                  {showPercentages && (
                                    <TableCell className="border p-1 text-right text-xs text-slate-600">
                                      {formatPercentageForAccount(totalEquityWithNetIncome, "Equity")}
                                    </TableCell>
                                  )}
                                  {showPreviousPeriod && (
                                    <>
                                      <TableCell
                                        className="border p-1 text-right font-semibold text-xs"
                                        style={{ width: "20%" }}
                                      >
                                        —
                                      </TableCell>
                                      {showPercentages && (
                                        <TableCell className="border p-1 text-right text-xs text-slate-600">
                                          —
                                        </TableCell>
                                      )}
                                      <TableCell
                                        className="border p-1 text-right font-semibold text-xs"
                                        style={{ width: "20%" }}
                                      >
                                        —
                                      </TableCell>
                                    </>
                                  )}
                                </>
                              )}
                            </TableRow>
                          </>
                        )}
                      </>
                    )}

                    {/* Total Liabilities + Equity */}
                    <TableRow
                      className={`cursor-pointer hover:bg-blue-50 ${
                        Math.abs(balanceDifference) > 0.01 ? "bg-red-50" : "bg-gray-50"
                      }`}
                      onClick={() => {
                        const totalLiabEquityGroup = {
                          id: "TOTAL_LIAB_EQUITY_GROUP",
                          name: "Total Liabilities + Equity",
                          type: "Mixed",
                          parent_id: null,
                        };
                        setSelectedAccount(totalLiabEquityGroup);
                        setViewerModal({ isOpen: true, category: totalLiabEquityGroup });
                      }}
                    >
                      <TableCell className="border p-1 text-xs font-semibold" style={{ width: "30%" }}>
                        TOTAL LIABILITIES + EQUITY
                      </TableCell>
                      {isMonthlyView ? (
                        <>
                          {getMonthsInRange().map((month) => (
                            <React.Fragment key={month}>
                              <TableCell className="border p-1 text-right font-semibold text-xs">
                                {formatNumber(
                                  liabilityRows.reduce(
                                    (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                    0
                                  ) +
                                    equityRows.reduce(
                                      (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                      0
                                    ) +
                                    (calculatePLGroupTotalForMonth(revenueAccounts, month) -
                                      calculatePLGroupTotalForMonth(cogsAccounts, month) -
                                      calculatePLGroupTotalForMonth(expenseAccounts, month))
                                )}
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                                  100.0%
                                </TableCell>
                              )}
                            </React.Fragment>
                          ))}
                          <TableCell className="border p-1 text-right font-semibold text-xs">
                            {formatNumber(liabilitiesAndEquity)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              100.0%
                            </TableCell>
                          )}
                        </>
                      ) : (
                        <>
                          <TableCell className="border p-1 text-right font-semibold text-xs" style={{ width: "20%" }}>
                            {formatNumber(liabilitiesAndEquity)}
                          </TableCell>
                          {showPercentages && (
                            <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                              100.0%
                            </TableCell>
                          )}
                          {showPreviousPeriod && (
                            <>
                              <TableCell
                                className="border p-1 text-right font-semibold text-xs"
                                style={{ width: "20%" }}
                              >
                                —
                              </TableCell>
                              {showPercentages && (
                                <TableCell className="border p-1 text-right text-xs font-bold text-slate-600">
                                  —
                                </TableCell>
                              )}
                              <TableCell
                                className="border p-1 text-right font-semibold text-xs"
                                style={{ width: "20%" }}
                              >
                                —
                              </TableCell>
                            </>
                          )}
                        </>
                      )}
                    </TableRow>

                    {/* Show discrepancy if balance sheet doesn't balance */}
                    {Math.abs(balanceDifference) > 0.01 && (
                      <TableRow className="bg-red-100">
                        <TableCell className="border p-1 text-xs font-bold text-red-800">OUT OF BALANCE</TableCell>
                        {isMonthlyView ? (
                          <>
                            {getMonthsInRange().map((month) => (
                              <React.Fragment key={month}>
                                <TableCell className="border p-1 text-right font-bold text-red-800 text-xs">
                                  {formatNumber(balanceDifference)}
                                </TableCell>
                                {showPercentages && (
                                  <TableCell className="border p-1 text-right text-xs font-bold text-red-600">
                                    —
                                  </TableCell>
                                )}
                              </React.Fragment>
                            ))}
                            <TableCell className="border p-1 text-right font-bold text-red-800 text-xs">
                              {formatNumber(balanceDifference)}
                            </TableCell>
                            {showPercentages && (
                              <TableCell className="border p-1 text-right text-xs font-bold text-red-600">—</TableCell>
                            )}
                          </>
                        ) : (
                          <>
                            <TableCell
                              className="border p-1 text-right font-bold text-red-800 text-xs"
                              style={{ width: "20%" }}
                            >
                              {formatNumber(balanceDifference)}
                            </TableCell>
                            {showPercentages && (
                              <TableCell className="border p-1 text-right text-xs font-bold text-red-600">—</TableCell>
                            )}
                            {showPreviousPeriod && (
                              <>
                                <TableCell
                                  className="border p-1 text-right font-bold text-red-800 text-xs"
                                  style={{ width: "20%" }}
                                >
                                  —
                                </TableCell>
                                {showPercentages && (
                                  <TableCell className="border p-1 text-right text-xs font-bold text-red-600">
                                    —
                                  </TableCell>
                                )}
                                <TableCell
                                  className="border p-1 text-right font-bold text-red-800 text-xs"
                                  style={{ width: "20%" }}
                                >
                                  —
                                </TableCell>
                              </>
                            )}
                          </>
                        )}
                      </TableRow>
                    )}
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
                {viewerModal.selectedMonth &&
                  (viewerModal.category.id === "NET_INCOME"
                    ? ` through ${formatMonth(viewerModal.selectedMonth)}`
                    : ` for ${formatMonth(viewerModal.selectedMonth)}`)}
              </h2>
              <div className="flex items-center gap-4">
                {selectedAccountTransactions.length > 0 && (
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
                    <TableHead className="text-left p-2">Source</TableHead>
                    <TableHead className="text-right p-2">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedAccountTransactions.map((tx) => (
                    <TableRow key={tx.id} className="hover:bg-gray-50">
                      <TableCell className="p-2">{tx.date}</TableCell>
                      <TableCell className="p-2">{tx.description}</TableCell>
                      <TableCell className="p-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            tx.source === "manual" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {tx.source === "manual" ? "Manual" : "Journal"}
                        </span>
                      </TableCell>
                      <TableCell className="p-2 text-right font-mono">
                        {(() => {
                          const debit = Number(tx.debit) || 0;
                          const credit = Number(tx.credit) || 0;
                          const amount = debit - credit;

                          if (viewerModal.category?.type === "Asset") {
                            return formatNumber(amount);
                          } else if (
                            viewerModal.category?.type === "Liability" ||
                            viewerModal.category?.type === "Equity"
                          ) {
                            return formatNumber(-amount);
                          } else {
                            return formatNumber(amount);
                          }
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {selectedAccountTransactions.length > 0 && (
                    <TableRow className="bg-gray-50 font-semibold">
                      <TableCell colSpan={3} className="p-2 text-right">
                        Total
                      </TableCell>
                      <TableCell className="p-2 text-right">
                        {formatNumber(
                          selectedAccountTransactions.reduce((sum, tx) => {
                            const debit = Number(tx.debit) || 0;
                            const credit = Number(tx.credit) || 0;
                            const amount = debit - credit;

                            if (viewerModal.category?.type === "Asset") {
                              return sum + amount;
                            } else if (
                              viewerModal.category?.type === "Liability" ||
                              viewerModal.category?.type === "Equity"
                            ) {
                              return sum - amount;
                            } else {
                              return sum + amount;
                            }
                          }, 0)
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {selectedAccountTransactions.length === 0 && (
                <div className="text-gray-500 text-center py-4">No transactions in this account.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
