"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "@/zustand/authStore";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodSelector } from "@/components/ui/period-selector";

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
  const [isMonthlyView, setIsMonthlyView] = useState(false);
  const [showPercentages, setShowPercentages] = useState(false);
  const [showPreviousPeriod, setShowPreviousPeriod] = useState(false);
  
  // Period Selector state
  const [selectedPeriod, setSelectedPeriod] = useState("thisYearToToday");
  const [selectedDisplay, setSelectedDisplay] = useState("totalOnly");
  const [selectedComparison, setSelectedComparison] = useState("none");

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

  const handleComparisonChange = (comparison: string) => {
    setSelectedComparison(comparison);
    // Map comparison options to existing state
    setShowPreviousPeriod(comparison === "previousPeriod" || comparison === "previousYear");
  };

  // Calculate today's date once
  const today = React.useMemo(() => new Date().toISOString().split('T')[0], []);

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

        let journalQuery = supabase.from("journal").select("*").eq("company_id", currentCompany!.id);
        if (asOfDate) {
          journalQuery = journalQuery.lte("date", asOfDate);
        }
        const { data: journalData } = await journalQuery;
        setJournalEntries(journalData || []);
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
    const [endYear, endMonth, endDay] = asOfDate.split('-').map(Number);
    const endDate = new Date(endYear, endMonth - 1, endDay);

    // Start from January of the same year
    let current = new Date(endYear, 0, 1); // January 1st
    
    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
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
    const [year, monthNum] = month.split('-').map(Number);
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

  const getAllGroupAccountIds = (accounts: Account[]) => accounts.flatMap((acc) => getAllAccountIds(acc));

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
        <tr
          className={`cursor-pointer hover:bg-slate-50 transition-colors ${level > 0 ? "bg-slate-25" : ""}`}
          onClick={() => {
            setSelectedAccount({
              ...account,
              _viewerType: isParent && isCollapsed ? "rollup" : "direct",
            });
          }}
        >
          <td className="px-4 py-2 border-b border-slate-100" style={{ paddingLeft: `${level * 24 + 16}px` }}>
            <div className="flex items-center">
              {level > 0 && <span className="text-slate-400 mr-2 text-xs">└</span>}
              {isParent ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAccount(account.id);
                  }}
                  className="mr-2 p-1 hover:bg-slate-200 rounded transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-600" />
                  )}
                </button>
              ) : (
                !level && <div className="mr-2 w-5"></div>
              )}
              <span className={`${level > 0 ? "text-slate-600 text-sm" : "text-slate-800"}`}>{account.name}</span>
            </div>
          </td>
          {months.map((month) => (
            <React.Fragment key={month}>
              <td className="px-4 py-2 text-right border-b border-slate-100 font-mono text-sm">
                {formatNumber(
                  isParent && isCollapsed
                    ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                    : calculateAccountTotalForMonth(account, month)
                )}
              </td>
              {showPercentages && (
                <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
                  {formatPercentageForAccount(
                    isParent && isCollapsed
                      ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                      : calculateAccountTotalForMonth(account, month),
                    account.type
                  )}
                </td>
              )}
            </React.Fragment>
          ))}
          <td className="px-4 py-2 text-right border-b border-slate-100 font-semibold font-mono text-sm">
            {formatNumber(
              isParent && isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account)
            )}
          </td>
          {showPercentages && (
            <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
              {formatPercentageForAccount(
                isParent && isCollapsed ? calculateAccountTotal(account) : calculateAccountDirectTotal(account),
                account.type
              )}
            </td>
          )}
        </tr>
        {!isCollapsed && subaccounts.map((sub) => renderAccountRowWithMonthlyTotals(sub, level + 1))}
        {isParent && !isCollapsed && (
          <tr
            key={`${account.id}-total`}
            className="cursor-pointer hover:bg-blue-50 transition-colors"
            onClick={() => {
              setSelectedAccount({ ...account, _viewerType: "rollup" });
            }}
          >
            <td className="px-4 py-2 font-semibold bg-slate-50 border-b border-slate-100" style={{ paddingLeft: `${level * 24 + 16}px` }}>
              <div className="flex items-center">
                <div className="mr-2 w-5"></div>
                <span className="text-sm text-slate-700">Total {account.name}</span>
              </div>
            </td>
            {months.map((month) => (
              <React.Fragment key={month}>
                <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono text-sm">
                  {formatNumber(calculateAccountTotalForMonthWithSubaccounts(account, month))}
                </td>
                {showPercentages && (
                  <td className="px-4 py-2 text-right bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                    {formatPercentageForAccount(calculateAccountTotalForMonthWithSubaccounts(account, month), account.type)}
                  </td>
                )}
              </React.Fragment>
            ))}
            <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono text-sm">
              {formatNumber(calculateAccountTotal(account))}
            </td>
            {showPercentages && (
              <td className="px-4 py-2 text-right bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                {formatPercentageForAccount(calculateAccountTotal(account), account.type)}
              </td>
            )}
          </tr>
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
        <tr
          key={account.id}
          className={`cursor-pointer hover:bg-slate-50 transition-colors ${isChild ? "bg-slate-25" : ""}`}
          onClick={() =>
            setSelectedAccount({
              ...account,
              _viewerType: isParent && isCollapsed ? "rollup" : "direct",
            })
          }
        >
          <td className="px-4 py-2 border-b border-slate-100" style={{ paddingLeft: `${level * 24 + 16}px` }}>
            <div className="flex items-center">
              {level > 0 && <span className="text-slate-400 mr-2 text-xs">└</span>}
              {isParent ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAccount(account.id);
                  }}
                  className="mr-2 p-1 hover:bg-slate-200 rounded transition-colors"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-slate-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-600" />
                  )}
                </button>
              ) : (
                !isChild && <div className="mr-2 w-5"></div>
              )}
              <span className={`${isChild ? "text-slate-600 text-sm" : "text-slate-800"}`}>{account.name}</span>
            </div>
          </td>
          <td className="px-4 py-2 text-right border-b border-slate-100 font-mono text-sm">
            {formatNumber(isParent && isCollapsed ? rollupTotal : directTotal)}
          </td>
          {showPercentages && (
            <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
              {formatPercentageForAccount(isParent && isCollapsed ? rollupTotal : directTotal, account.type)}
            </td>
          )}
          {showPreviousPeriod && (
            <>
              <td className="px-4 py-2 text-right border-b border-slate-100 font-mono text-sm">
                {/* Previous period would need additional data fetching */}
                —
              </td>
              {showPercentages && (
                <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
                  —
                </td>
              )}
              <td className="px-4 py-2 text-right border-b border-slate-100 font-mono text-sm">
                —
              </td>
            </>
          )}
        </tr>
        {!isCollapsed &&
          subaccounts.map((sub) => (
            <React.Fragment key={sub.id}>{renderAccountRowWithTotal(sub, level + 1)}</React.Fragment>
          ))}
        {isParent && !isCollapsed && (
          <tr
            className="cursor-pointer hover:bg-blue-50 transition-colors"
            onClick={() => setSelectedAccount({ ...account, _viewerType: "rollup" })}
          >
            <td
              className="px-4 py-2 font-semibold bg-slate-50 border-b border-slate-100 flex items-center"
              style={{ paddingLeft: `${level * 24 + 16}px` }}
            >
              <div className="mr-2 w-5"></div>
              <span className="text-sm text-slate-700">Total {account.name}</span>
            </td>
            <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono text-sm">
              {formatNumber(rollupTotal)}
            </td>
            {showPercentages && (
              <td className="px-4 py-2 text-right bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                {formatPercentageForAccount(rollupTotal, account.type)}
              </td>
            )}
            {showPreviousPeriod && (
              <>
                <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono text-sm">
                  —
                </td>
                {showPercentages && (
                  <td className="px-4 py-2 text-right bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                    —
                  </td>
                )}
                <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono text-sm">
                  —
                </td>
              </>
            )}
          </tr>
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
      .filter(acc => !acc.parent_id) // Only top-level accounts
      .reduce((sum, acc) => sum + calculatePLAccountTotal(acc), 0);
  };

  // Helper: calculate P&L account total for a specific month (cumulative from year start)
  const calculatePLAccountTotalForMonth = (account: Account, month: string): number => {
    // Get the last day of the specified month
    const [year, monthNum] = month.split('-').map(Number);
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
      .filter(acc => !acc.parent_id) // Only top-level accounts
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
    ? selectedAccount._viewerType === "rollup"
      ? journalEntries.filter((tx) => getAllAccountIds(selectedAccount).includes(tx.chart_account_id))
      : selectedAccount.id === "ASSET_GROUP"
      ? journalEntries.filter((tx) => getAllGroupAccountIds(assetRows).includes(tx.chart_account_id))
      : selectedAccount.id === "LIABILITY_GROUP"
      ? journalEntries.filter((tx) => getAllGroupAccountIds(liabilityRows).includes(tx.chart_account_id))
      : selectedAccount.id === "EQUITY_GROUP"
      ? journalEntries.filter((tx) => getAllGroupAccountIds(equityRows).includes(tx.chart_account_id))
      : selectedAccount.id === "NET_INCOME"
      ? journalEntries.filter((tx) =>
          ["Revenue", "COGS", "Expense"].includes(accounts.find((a) => a.id === tx.chart_account_id)?.type || "")
        )
      : journalEntries.filter((tx) => tx.chart_account_id === selectedAccount.id)
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
    csvData.push(["Balance Sheet", `As of ${asOfDate}`]);
    csvData.push([""]);

    // Assets
    csvData.push(["ASSETS", ""]);
    assetRows.forEach((account) => {
      csvData.push([account.name, calculateAccountTotal(account).toFixed(2)]);
      getSubaccounts(account.id)
        .filter(shouldShowAccount)
        .forEach((sub) => {
          csvData.push([`  ${sub.name}`, calculateAccountTotal(sub).toFixed(2)]);
        });
    });
    csvData.push(["TOTAL ASSETS", totalAssets.toFixed(2)]);
    csvData.push([""]);

    // Liabilities
    csvData.push(["LIABILITIES & EQUITY", ""]);
    csvData.push(["Liabilities", ""]);
    liabilityRows.forEach((account) => {
      csvData.push([account.name, calculateAccountTotal(account).toFixed(2)]);
      getSubaccounts(account.id)
        .filter(shouldShowAccount)
        .forEach((sub) => {
          csvData.push([`  ${sub.name}`, calculateAccountTotal(sub).toFixed(2)]);
        });
    });
    csvData.push(["Total Liabilities", totalLiabilities.toFixed(2)]);
    csvData.push([""]);

    // Equity
    csvData.push(["Equity", ""]);
    equityRows.forEach((account) => {
      csvData.push([account.name, calculateAccountTotal(account).toFixed(2)]);
      getSubaccounts(account.id)
        .filter(shouldShowAccount)
        .forEach((sub) => {
          csvData.push([`  ${sub.name}`, calculateAccountTotal(sub).toFixed(2)]);
        });
    });
    if (netIncome !== 0) {
      csvData.push(["Net Income", netIncome.toFixed(2)]);
    }
    csvData.push(["Total Equity", totalEquityWithNetIncome.toFixed(2)]);
    csvData.push([""]);
    csvData.push(["TOTAL LIABILITIES + EQUITY", liabilitiesAndEquity.toFixed(2)]);

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
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-3">Balance Sheet</h1>
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
              <Button onClick={exportToCSV} className="text-sm font-medium">
                Export CSV
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

        <div className="flex gap-6">
          {/* Balance Sheet Table */}
          <div className="w-2/3">
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
                          <th className="px-4 py-3 text-right font-semibold text-slate-700 w-32">Amount</th>
                          {showPercentages && (
                            <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs w-20">%</th>
                          )}
                          {showPreviousPeriod && (
                            <>
                              <th className="px-4 py-3 text-right font-semibold text-slate-700 w-32">Previous Year</th>
                              {showPercentages && (
                                <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs w-20">%</th>
                              )}
                              <th className="px-4 py-3 text-right font-semibold text-slate-700 w-32">Difference</th>
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
                        {/* ASSETS SECTION */}
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
                            ASSETS
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
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                              <span className="text-sm text-slate-500">Loading accounts...</span>
                            </div>
                          </td>
                        </tr>

                        {/* SPACING ROW */}
                        <tr>
                          <td 
                            colSpan={
                              isMonthlyView 
                                ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                                : showPreviousPeriod 
                                  ? (showPercentages ? 6 : 4)
                                  : (showPercentages ? 3 : 2)
                            }
                            className="py-3"
                          ></td>
                        </tr>

                        {/* LIABILITIES & EQUITY SECTION */}
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
                            LIABILITIES & EQUITY
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
                              <span className="text-sm text-slate-500">Loading transactions...</span>
                            </div>
                          </td>
                        </tr>
                      </>
                    ) : (
                      /* Normal Content */
                      <>
                        {/* ASSETS SECTION */}
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
                            ASSETS
                          </td>
                        </tr>
                        {assetRows.length > 0 && (
                          <>
                            <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
                              <td 
                                colSpan={
                                  isMonthlyView 
                                    ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                                    : showPreviousPeriod 
                                      ? (showPercentages ? 6 : 4)
                                      : (showPercentages ? 3 : 2)
                                }
                                className="px-4 py-2 border-b border-slate-100"
                              >
                                <div className="flex items-center">
                                  <button
                                    onClick={() => toggleSection("assets")}
                                    className="mr-2 p-1 hover:bg-slate-200 rounded transition-colors"
                                  >
                                    {collapsedSections.has("assets") ? (
                                      <ChevronRight className="w-3 h-3 text-slate-600" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3 text-slate-600" />
                                    )}
                                  </button>
                                  <span className="font-medium text-slate-700">Current Assets</span>
                                </div>
                              </td>
                            </tr>
                            {!collapsedSections.has("assets") && (
                              <>
                                {assetRows.map((row) => (
                                  <React.Fragment key={row.id}>
                                    {isMonthlyView 
                                      ? renderAccountRowWithMonthlyTotals(row)
                                      : renderAccountRowWithTotal(row)
                                    }
                                  </React.Fragment>
                                ))}
                              </>
                            )}
                          </>
                        )}
                        {/* Total Assets */}
                        <tr className="bg-blue-50 border-b-2 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors">
                          <td
                            className="px-4 py-3 font-bold text-slate-800"
                            onClick={() =>
                              setSelectedAccount({
                                id: "ASSET_GROUP",
                                name: "Total Assets",
                                type: "Asset",
                                parent_id: null,
                              })
                            }
                          >
                            TOTAL ASSETS
                          </td>
                          {isMonthlyView ? (
                            <>
                              {getMonthsInRange().map((month) => (
                                <React.Fragment key={month}>
                                  <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                                    {formatNumber(
                                      assetRows.reduce(
                                        (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                        0
                                      )
                                    )}
                                  </td>
                                  {showPercentages && (
                                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                                      100.0%
                                    </td>
                                  )}
                                </React.Fragment>
                              ))}
                              <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                                {formatNumber(totalAssets)}
                              </td>
                              {showPercentages && (
                                <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                                  100.0%
                                </td>
                              )}
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                                {formatNumber(totalAssets)}
                              </td>
                              {showPercentages && (
                                <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                                  100.0%
                                </td>
                              )}
                              {showPreviousPeriod && (
                                <>
                                  <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                                    —
                                  </td>
                                  {showPercentages && (
                                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                                      —
                                    </td>
                                  )}
                                  <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                                    —
                                  </td>
                                </>
                              )}
                            </>
                          )}
                        </tr>

                        {/* SPACING ROW */}
                        <tr>
                          <td 
                            colSpan={
                              isMonthlyView 
                                ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                                : showPreviousPeriod 
                                  ? (showPercentages ? 6 : 4)
                                  : (showPercentages ? 3 : 2)
                            }
                            className="py-3"
                          ></td>
                        </tr>

                        {/* LIABILITIES & EQUITY SECTION */}
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
                            LIABILITIES & EQUITY
                          </td>
                        </tr>

                        {/* Liabilities */}
                        {liabilityRows.length > 0 && (
                          <>
                            <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
                              <td 
                                colSpan={
                                  isMonthlyView 
                                    ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                                    : showPreviousPeriod 
                                      ? (showPercentages ? 6 : 4)
                                      : (showPercentages ? 3 : 2)
                                }
                                className="px-4 py-2 border-b border-slate-100"
                              >
                                <div className="flex items-center">
                                  <button
                                    onClick={() => toggleSection("liabilities")}
                                    className="mr-2 p-1 hover:bg-slate-200 rounded transition-colors"
                                  >
                                    {collapsedSections.has("liabilities") ? (
                                      <ChevronRight className="w-3 h-3 text-slate-600" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3 text-slate-600" />
                                    )}
                                  </button>
                                  <span className="font-medium text-slate-700">Liabilities</span>
                                </div>
                              </td>
                            </tr>
                            {!collapsedSections.has("liabilities") && (
                              <>
                                {liabilityRows.map((row) => (
                                  <React.Fragment key={row.id}>
                                    {isMonthlyView 
                                      ? renderAccountRowWithMonthlyTotals(row)
                                      : renderAccountRowWithTotal(row)
                                    }
                                  </React.Fragment>
                                ))}
                                <tr
                                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                                  onClick={() =>
                                    setSelectedAccount({
                                      id: "LIABILITY_GROUP",
                                      name: "Total Liabilities",
                                      type: "Liability",
                                      parent_id: null,
                                    })
                                  }
                                >
                                  <td className="px-4 py-2 font-semibold border-b border-slate-100 text-slate-800">
                                    Total Liabilities
                                  </td>
                                  {isMonthlyView ? (
                                    <>
                                      {getMonthsInRange().map((month) => (
                                        <React.Fragment key={month}>
                                          <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                            {formatNumber(
                                              liabilityRows.reduce(
                                                (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                                0
                                              )
                                            )}
                                          </td>
                                          {showPercentages && (
                                            <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
                                              {formatPercentageForAccount(
                                                liabilityRows.reduce(
                                                  (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                                  0
                                                ),
                                                "Liability"
                                              )}
                                            </td>
                                          )}
                                        </React.Fragment>
                                      ))}
                                      <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                        {formatNumber(totalLiabilities)}
                                      </td>
                                      {showPercentages && (
                                        <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
                                          {formatPercentageForAccount(totalLiabilities, "Liability")}
                                        </td>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                        {formatNumber(totalLiabilities)}
                                      </td>
                                      {showPercentages && (
                                        <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
                                          {formatPercentageForAccount(totalLiabilities, "Liability")}
                                        </td>
                                      )}
                                      {showPreviousPeriod && (
                                        <>
                                          <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                            —
                                          </td>
                                          {showPercentages && (
                                            <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
                                              —
                                            </td>
                                          )}
                                          <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                            —
                                          </td>
                                        </>
                                      )}
                                    </>
                                  )}
                                </tr>
                              </>
                            )}
                          </>
                        )}

                        {/* Equity */}
                        {(equityRows.length > 0 || netIncome !== 0) && (
                          <>
                            <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
                              <td 
                                colSpan={
                                  isMonthlyView 
                                    ? getMonthsInRange().length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1) + 1
                                    : showPreviousPeriod 
                                      ? (showPercentages ? 6 : 4)
                                      : (showPercentages ? 3 : 2)
                                }
                                className="px-4 py-2 border-b border-slate-100"
                              >
                                <div className="flex items-center">
                                  <button
                                    onClick={() => toggleSection("equity")}
                                    className="mr-2 p-1 hover:bg-slate-200 rounded transition-colors"
                                  >
                                    {collapsedSections.has("equity") ? (
                                      <ChevronRight className="w-3 h-3 text-slate-600" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3 text-slate-600" />
                                    )}
                                  </button>
                                  <span className="font-medium text-slate-700">Equity</span>
                                </div>
                              </td>
                            </tr>
                            {!collapsedSections.has("equity") && (
                              <>
                                {equityRows.map((row) => (
                                  <React.Fragment key={row.id}>
                                    {isMonthlyView 
                                      ? renderAccountRowWithMonthlyTotals(row)
                                      : renderAccountRowWithTotal(row)
                                    }
                                  </React.Fragment>
                                ))}
                                {netIncome !== 0 && (
                                  <tr
                                    className="cursor-pointer hover:bg-slate-100 transition-colors"
                                    onClick={() =>
                                      setSelectedAccount({
                                        id: "NET_INCOME",
                                        name: "Net Income",
                                        type: "Equity",
                                        parent_id: null,
                                      })
                                    }
                                  >
                                    <td className="px-4 py-2 font-semibold bg-slate-50 border-b border-slate-100">
                                      <div className="flex items-center">
                                        <div className="mr-2 w-5"></div>
                                        <span className="text-slate-800">Net Income</span>
                                      </div>
                                    </td>
                                    {isMonthlyView ? (
                                      <>
                                        {getMonthsInRange().map((month) => (
                                          <React.Fragment key={month}>
                                            <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono">
                                              {formatNumber(
                                                calculatePLGroupTotalForMonth(revenueAccounts, month) -
                                                calculatePLGroupTotalForMonth(cogsAccounts, month) -
                                                calculatePLGroupTotalForMonth(expenseAccounts, month)
                                              )}
                                            </td>
                                            {showPercentages && (
                                              <td className="px-4 py-2 text-right bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                                                {formatPercentageForAccount(
                                                  calculatePLGroupTotalForMonth(revenueAccounts, month) -
                                                  calculatePLGroupTotalForMonth(cogsAccounts, month) -
                                                  calculatePLGroupTotalForMonth(expenseAccounts, month),
                                                  "Equity"
                                                )}
                                              </td>
                                            )}
                                          </React.Fragment>
                                        ))}
                                        <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono">
                                          {formatNumber(netIncome)}
                                        </td>
                                        {showPercentages && (
                                          <td className="px-4 py-2 text-right bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                                            {formatPercentageForAccount(netIncome, "Equity")}
                                          </td>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono">
                                          {formatNumber(netIncome)}
                                        </td>
                                        {showPercentages && (
                                          <td className="px-4 py-2 text-right bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                                            {formatPercentageForAccount(netIncome, "Equity")}
                                          </td>
                                        )}
                                        {showPreviousPeriod && (
                                          <>
                                            <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono">
                                              —
                                            </td>
                                            {showPercentages && (
                                              <td className="px-4 py-2 text-right bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
                                                —
                                              </td>
                                            )}
                                            <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono">
                                              —
                                            </td>
                                          </>
                                        )}
                                      </>
                                    )}
                                  </tr>
                                )}
                                <tr
                                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                                  onClick={() =>
                                    setSelectedAccount({
                                      id: "EQUITY_GROUP",
                                      name: "Total Equity",
                                      type: "Equity",
                                      parent_id: null,
                                    })
                                  }
                                >
                                  <td className="px-4 py-2 font-semibold border-b border-slate-100 text-slate-800">
                                    Total Equity
                                  </td>
                                  {isMonthlyView ? (
                                    <>
                                      {getMonthsInRange().map((month) => (
                                        <React.Fragment key={month}>
                                          <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                            {formatNumber(
                                              equityRows.reduce(
                                                (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
                                                0
                                              ) + 
                                              (calculatePLGroupTotalForMonth(revenueAccounts, month) -
                                               calculatePLGroupTotalForMonth(cogsAccounts, month) -
                                               calculatePLGroupTotalForMonth(expenseAccounts, month))
                                            )}
                                          </td>
                                          {showPercentages && (
                                            <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
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
                                            </td>
                                          )}
                                        </React.Fragment>
                                      ))}
                                      <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                        {formatNumber(totalEquityWithNetIncome)}
                                      </td>
                                      {showPercentages && (
                                        <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
                                          {formatPercentageForAccount(totalEquityWithNetIncome, "Equity")}
                                        </td>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                        {formatNumber(totalEquityWithNetIncome)}
                                      </td>
                                      {showPercentages && (
                                        <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
                                          {formatPercentageForAccount(totalEquityWithNetIncome, "Equity")}
                                        </td>
                                      )}
                                      {showPreviousPeriod && (
                                        <>
                                          <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                            —
                                          </td>
                                          {showPercentages && (
                                            <td className="px-4 py-2 text-right border-b border-slate-100 text-xs text-slate-600">
                                              —
                                            </td>
                                          )}
                                          <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                            —
                                          </td>
                                        </>
                                      )}
                                    </>
                                  )}
                                </tr>
                              </>
                            )}
                          </>
                        )}

                        {/* Total Liabilities + Equity */}
                        <tr
                          className={`font-bold border-b-2 ${
                            Math.abs(balanceDifference) > 0.01
                              ? "bg-red-50 border-red-200"
                              : "bg-blue-50 border-blue-200"
                          }`}
                        >
                          <td className="px-4 py-3 font-bold text-slate-800">TOTAL LIABILITIES + EQUITY</td>
                          {isMonthlyView ? (
                            <>
                              {getMonthsInRange().map((month) => (
                                <React.Fragment key={month}>
                                  <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
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
                                  </td>
                                  {showPercentages && (
                                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                                      100.0%
                                    </td>
                                  )}
                                </React.Fragment>
                              ))}
                              <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                                {formatNumber(liabilitiesAndEquity)}
                              </td>
                              {showPercentages && (
                                <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                                  100.0%
                                </td>
                              )}
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                                {formatNumber(liabilitiesAndEquity)}
                              </td>
                              {showPercentages && (
                                <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                                  100.0%
                                </td>
                              )}
                              {showPreviousPeriod && (
                                <>
                                  <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                                    —
                                  </td>
                                  {showPercentages && (
                                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                                      —
                                    </td>
                                  )}
                                  <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                                    —
                                  </td>
                                </>
                              )}
                            </>
                          )}
                        </tr>

                        {/* Show discrepancy if balance sheet doesn't balance */}
                        {Math.abs(balanceDifference) > 0.01 && (
                          <tr className="bg-red-100 border-b-2 border-red-300">
                            <td className="px-4 py-3 font-bold text-red-800">OUT OF BALANCE</td>
                            {isMonthlyView ? (
                              <>
                                {getMonthsInRange().map((month) => (
                                  <React.Fragment key={month}>
                                    <td className="px-4 py-3 text-right font-bold text-red-800 font-mono">
                                      {formatNumber(balanceDifference)}
                                    </td>
                                    {showPercentages && (
                                      <td className="px-4 py-3 text-right text-xs font-bold text-red-600">
                                        —
                                      </td>
                                    )}
                                  </React.Fragment>
                                ))}
                                <td className="px-4 py-3 text-right font-bold text-red-800 font-mono">
                                  {formatNumber(balanceDifference)}
                                </td>
                                {showPercentages && (
                                  <td className="px-4 py-3 text-right text-xs font-bold text-red-600">
                                    —
                                  </td>
                                )}
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-3 text-right font-bold text-red-800 font-mono">
                                  {formatNumber(balanceDifference)}
                                </td>
                                {showPercentages && (
                                  <td className="px-4 py-3 text-right text-xs font-bold text-red-600">
                                    —
                                  </td>
                                )}
                                {showPreviousPeriod && (
                                  <>
                                    <td className="px-4 py-3 text-right font-bold text-red-800 font-mono">
                                      —
                                    </td>
                                    {showPercentages && (
                                      <td className="px-4 py-3 text-right text-xs font-bold text-red-600">
                                        —
                                      </td>
                                    )}
                                    <td className="px-4 py-3 text-right font-bold text-red-800 font-mono">
                                      —
                                    </td>
                                  </>
                                )}
                              </>
                            )}
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
          {/* Quick View */}
          <div className="w-1/3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Transaction Details</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex flex-col items-center space-y-3 py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                    <span className="text-sm text-slate-500">Preparing transaction view...</span>
                  </div>
                ) : selectedAccount ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-slate-800 text-sm">{selectedAccount.name}</span>
                      <button
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                        onClick={() => setSelectedAccount(null)}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-50">
                          <tr>
                            <th className="text-left py-2 px-2 font-medium text-slate-600">Date</th>
                            <th className="text-left py-2 px-2 font-medium text-slate-600">Description</th>
                            <th className="text-right py-2 px-2 font-medium text-slate-600">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedAccountTransactions.map((tx) => (
                            <tr key={tx.id} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-2 px-2 text-slate-600">{tx.date}</td>
                              <td className="py-2 px-2 text-slate-700">{tx.description}</td>
                              <td className="py-2 px-2 text-right font-mono text-slate-800">
                                {tx.debit
                                  ? `${formatNumber(Number(tx.debit))}`
                                  : tx.credit
                                  ? `${formatNumber(Number(tx.credit))}`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {selectedAccountTransactions.length === 0 && (
                      <div className="text-slate-500 text-center py-8 text-sm">No transactions found</div>
                    )}
                  </>
                ) : (
                  <div className="text-slate-500 text-center py-8 text-sm">
                    Click an account or total to view transactions
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
