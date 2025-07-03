"use client";

import { useState } from "react";
import { Account, Transaction } from "../_types";
import { getSubaccounts, hasTransactions } from "../_utils";

interface UseAccountOperationsProps {
  accounts: Account[];
  journalEntries: Transaction[];
}

interface UseAccountOperationsReturn {
  collapsedAccounts: Set<string>;
  toggleAccount: (accountId: string) => void;
  getTopLevelAccounts: (type: string) => Account[];
  calculateAccountDirectTotal: (account: Account) => number;
  calculateAccountTotal: (account: Account) => number;
  calculateAccountTotalForMonth: (account: Account, month: string) => number;
  calculateAccountTotalForMonthWithSubaccounts: (account: Account, month: string) => number;
  collapseAllParentCategories: () => void;
  hasCollapsedCategories: boolean;
}

export const useAccountOperations = ({
  accounts,
  journalEntries,
}: UseAccountOperationsProps): UseAccountOperationsReturn => {
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

  // Get top-level accounts of a specific type with transactions
  const getTopLevelAccounts = (type: string): Account[] => {
    return accounts
      .filter((a) => a.type === type && !a.parent_id)
      .filter((a) => hasTransactions(a, journalEntries, accounts))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // Get all parent accounts (accounts that have subaccounts)
  const getParentAccounts = (): Account[] => {
    return accounts.filter((account) => {
      const subaccounts = getSubaccounts(accounts, account.id);
      return subaccounts.length > 0 && hasTransactions(account, journalEntries, accounts);
    });
  };

  // Collapse all parent categories at once
  const collapseAllParentCategories = () => {
    const parentAccounts = getParentAccounts();
    const newCollapsed = new Set<string>();

    parentAccounts.forEach((account) => {
      newCollapsed.add(account.id);
    });

    setCollapsedAccounts(newCollapsed);
  };

  // Check if any categories are currently collapsed
  const hasCollapsedCategories = collapsedAccounts.size > 0;

  // Calculate direct total for an account (only its own transactions)
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
    } else if (account.type === "Asset") {
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

  // Calculate roll-up total for an account (including subaccounts)
  const calculateAccountTotal = (account: Account): number => {
    let total = calculateAccountDirectTotal(account);
    const subaccounts = getSubaccounts(accounts, account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotal(sub);
    }
    return total;
  };

  // Calculate account total for a specific month
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
    } else if (account.type === "Asset") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date.startsWith(month))
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date.startsWith(month))
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (account.type === "Liability" || account.type === "Equity") {
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date.startsWith(month))
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === account.id && tx.date.startsWith(month))
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      return totalCredits - totalDebits;
    }
    return 0;
  };

  // Calculate roll-up total for an account for a specific month
  const calculateAccountTotalForMonthWithSubaccounts = (account: Account, month: string): number => {
    let total = calculateAccountTotalForMonth(account, month);
    const subaccounts = getSubaccounts(accounts, account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotalForMonthWithSubaccounts(sub, month);
    }
    return total;
  };

  return {
    collapsedAccounts,
    toggleAccount,
    getTopLevelAccounts,
    calculateAccountDirectTotal,
    calculateAccountTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts,
    collapseAllParentCategories,
    hasCollapsedCategories,
  };
};
