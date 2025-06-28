"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuthStore } from "@/zustand/authStore";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  useEffect(() => {
    setAsOfDate(new Date().toISOString().slice(0, 10));
  }, []);

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

  // Net Income calculation (from P&L logic)
  const calculatePLTotal = (accs: Account[], type: string) =>
    accs.reduce((sum, acc) => {
      if (type === "Revenue") {
        // Revenue: sum credits
        return (
          sum +
          journalEntries.filter((tx) => tx.chart_account_id === acc.id).reduce((s, tx) => s + Number(tx.credit), 0)
        );
      } else if (type === "COGS" || type === "Expense") {
        // COGS/Expense: sum debits
        return (
          sum + journalEntries.filter((tx) => tx.chart_account_id === acc.id).reduce((s, tx) => s + Number(tx.debit), 0)
        );
      }
      return sum;
    }, 0);

  const totalRevenue = calculatePLTotal(revenueAccounts, "Revenue");
  const totalCOGS = calculatePLTotal(cogsAccounts, "COGS");
  const totalExpenses = calculatePLTotal(expenseAccounts, "Expense");
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
          <div className="flex items-center justify-center gap-3 mb-4">
            <label className="text-sm font-medium text-slate-600">As of Date:</label>
            <Input
              type="date"
              value={asOfDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="flex justify-center">
            <Button onClick={exportToCSV} className="text-sm font-medium">
              Export CSV
            </Button>
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
                <table className="w-full border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Account</th>
                      <th className="px-4 py-3 text-right font-semibold text-slate-700 w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      /* Loading State */
                      <>
                        {/* ASSETS SECTION */}
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <td colSpan={2} className="px-4 py-3 font-bold text-slate-800 text-sm tracking-wide">
                            ASSETS
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={2} className="px-4 py-8 text-center border-b border-slate-100">
                            <div className="flex flex-col items-center space-y-3">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                              <span className="text-sm text-slate-500">Loading accounts...</span>
                            </div>
                          </td>
                        </tr>

                        {/* SPACING ROW */}
                        <tr>
                          <td colSpan={2} className="py-3"></td>
                        </tr>

                        {/* LIABILITIES & EQUITY SECTION */}
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <td colSpan={2} className="px-4 py-3 font-bold text-slate-800 text-sm tracking-wide">
                            LIABILITIES & EQUITY
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={2} className="px-4 py-8 text-center border-b border-slate-100">
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
                          <td colSpan={2} className="px-4 py-3 font-bold text-slate-800 text-sm tracking-wide">
                            ASSETS
                          </td>
                        </tr>
                        {assetRows.length > 0 && (
                          <>
                            <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
                              <td colSpan={2} className="px-4 py-2 border-b border-slate-100">
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
                                  <React.Fragment key={row.id}>{renderAccountRowWithTotal(row)}</React.Fragment>
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
                          <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                            {formatNumber(totalAssets)}
                          </td>
                        </tr>

                        {/* SPACING ROW */}
                        <tr>
                          <td colSpan={2} className="py-3"></td>
                        </tr>

                        {/* LIABILITIES & EQUITY SECTION */}
                        <tr className="bg-slate-100 border-b border-slate-200">
                          <td colSpan={2} className="px-4 py-3 font-bold text-slate-800 text-sm tracking-wide">
                            LIABILITIES & EQUITY
                          </td>
                        </tr>

                        {/* Liabilities */}
                        {liabilityRows.length > 0 && (
                          <>
                            <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
                              <td colSpan={2} className="px-4 py-2 border-b border-slate-100">
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
                                  <React.Fragment key={row.id}>{renderAccountRowWithTotal(row)}</React.Fragment>
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
                                  <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                    {formatNumber(totalLiabilities)}
                                  </td>
                                </tr>
                              </>
                            )}
                          </>
                        )}

                        {/* Equity */}
                        {(equityRows.length > 0 || netIncome !== 0) && (
                          <>
                            <tr className="cursor-pointer hover:bg-slate-50 transition-colors">
                              <td colSpan={2} className="px-4 py-2 border-b border-slate-100">
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
                                  <React.Fragment key={row.id}>{renderAccountRowWithTotal(row)}</React.Fragment>
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
                                    <td className="px-4 py-2 text-right font-semibold bg-slate-50 border-b border-slate-100 text-slate-800 font-mono">
                                      {formatNumber(netIncome)}
                                    </td>
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
                                  <td className="px-4 py-2 text-right font-semibold border-b border-slate-100 text-slate-800 font-mono">
                                    {formatNumber(totalEquityWithNetIncome)}
                                  </td>
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
                          <td className="px-4 py-3 text-right font-bold text-slate-800 font-mono">
                            {formatNumber(liabilitiesAndEquity)}
                          </td>
                        </tr>

                        {/* Show discrepancy if balance sheet doesn't balance */}
                        {Math.abs(balanceDifference) > 0.01 && (
                          <tr className="bg-red-100 border-b-2 border-red-300">
                            <td className="px-4 py-3 font-bold text-red-800">OUT OF BALANCE</td>
                            <td className="px-4 py-3 text-right font-bold text-red-800 font-mono">
                              {formatNumber(balanceDifference)}
                            </td>
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
