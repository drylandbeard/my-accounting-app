"use client";

import { useState } from "react";
import { Category, Transaction } from "../_types";
import { getSubaccounts, hasTransactions } from "../_utils";

interface UseAccountOperationsProps {
  categories: Category[];
  journalEntries: Transaction[];
}

interface UseAccountOperationsReturn {
  collapsedAccounts: Set<string>;
  toggleCategory: (categoryId: string) => void;
  getTopLevelAccounts: (type: string) => Category[];
  calculateAccountDirectTotal: (category: Category) => number;
  calculateAccountTotal: (category: Category) => number;
  calculateAccountTotalForMonth: (category: Category, month: string) => number;
  calculateAccountTotalForMonthWithSubaccounts: (category: Category, month: string) => number;
  calculateAccountTotalForQuarter: (category: Category, quarter: string) => number;
  calculateAccountTotalForQuarterWithSubaccounts: (category: Category, quarter: string) => number;
  collapseAllParentCategories: () => void;
  expandAllParentCategories: () => void;
  getParentAccounts: () => Category[];
}

export const useAccountOperations = ({
  categories,
  journalEntries,
}: UseAccountOperationsProps): UseAccountOperationsReturn => {
  const [collapsedAccounts, setCollapsedAccounts] = useState<Set<string>>(new Set());

  // Toggle function for collapse/expand accounts
  const toggleCategory = (categoryId: string) => {
    const newCollapsed = new Set(collapsedAccounts);
    if (newCollapsed.has(categoryId)) {
      newCollapsed.delete(categoryId);
    } else {
      newCollapsed.add(categoryId);
    }
    setCollapsedAccounts(newCollapsed);
  };

  // Get top-level accounts of a specific type with transactions
  const getTopLevelAccounts = (type: string): Category[] => {
    return categories
      .filter((a) => a.type === type && !a.parent_id)
      .filter((a) => hasTransactions(a, journalEntries, categories))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // Get all parent accounts (accounts that have subaccounts)
  const getParentAccounts = (): Category[] => {
    return categories.filter((category) => {
      const subaccounts = getSubaccounts(categories, category.id);
      return subaccounts.length > 0 && hasTransactions(category, journalEntries, categories);
    });
  };

  // Collapse all parent categories at once
  const collapseAllParentCategories = () => {
    const parentAccounts = getParentAccounts();
    const newCollapsed = new Set<string>();

    parentAccounts.forEach((category) => {
      newCollapsed.add(category.id);
    });

    setCollapsedAccounts(newCollapsed);
  };

  // Expand all parent categories at once
  const expandAllParentCategories = () => {
    setCollapsedAccounts(new Set());
  };

  // Calculate direct total for an account (only its own transactions)
  const calculateAccountDirectTotal = (category: Category): number => {
    if (category.type === "Revenue") {
      return journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
    } else if (category.type === "Expense" || category.type === "COGS") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (category.type === "Asset") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (category.type === "Liability" || category.type === "Equity" || category.type === "Credit Card") {
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      return totalCredits - totalDebits;
    } else if (category.type === "Bank Account") {
      const totalDebits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = journalEntries
        .filter((tx) => tx.chart_account_id === category.id)
        .reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalCredits - totalDebits;
    }
    return 0;
  };

  // Calculate roll-up total for an account (including subaccounts)
  const calculateAccountTotal = (account: Category): number => {
    let total = calculateAccountDirectTotal(account);
    const subaccounts = getSubaccounts(categories, account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotal(sub);
    }
    return total;
  };

  // Calculate account total for a specific month
  const calculateAccountTotalForMonth = (account: Category, month: string): number => {
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
  const calculateAccountTotalForMonthWithSubaccounts = (account: Category, month: string): number => {
    let total = calculateAccountTotalForMonth(account, month);
    const subaccounts = getSubaccounts(categories, account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotalForMonthWithSubaccounts(sub, month);
    }
    return total;
  };

  // Calculate account total for a specific quarter
  const calculateAccountTotalForQuarter = (account: Category, quarter: string): number => {
    // Parse quarter string like "2024-Q1" to get year and quarter number
    const [year, quarterNum] = quarter.split("-Q");
    const startMonth = (parseInt(quarterNum) - 1) * 3 + 1; // Q1=1, Q2=4, Q3=7, Q4=10
    const endMonth = startMonth + 2;

    const quarterTransactions = journalEntries.filter((tx) => {
      if (tx.chart_account_id !== account.id) return false;
      const txDate = new Date(tx.date);
      const txYear = txDate.getFullYear();
      const txMonth = txDate.getMonth() + 1; // getMonth() is 0-indexed
      return txYear === parseInt(year) && txMonth >= startMonth && txMonth <= endMonth;
    });

    if (account.type === "Revenue") {
      return quarterTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
    } else if (account.type === "Expense" || account.type === "COGS") {
      const totalDebits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (account.type === "Asset") {
      const totalDebits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    } else if (account.type === "Liability" || account.type === "Equity" || account.type === "Credit Card") {
      const totalCredits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      const totalDebits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      return totalCredits - totalDebits;
    } else if (account.type === "Bank Account") {
      const totalDebits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.debit), 0);
      const totalCredits = quarterTransactions.reduce((sum, tx) => sum + Number(tx.credit), 0);
      return totalDebits - totalCredits;
    }
    return 0;
  };

  // Calculate roll-up total for an account for a specific quarter
  const calculateAccountTotalForQuarterWithSubaccounts = (account: Category, quarter: string): number => {
    let total = calculateAccountTotalForQuarter(account, quarter);
    const subaccounts = getSubaccounts(categories, account.id);
    for (const sub of subaccounts) {
      total += calculateAccountTotalForQuarterWithSubaccounts(sub, quarter);
    }
    return total;
  };

  return {
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
  };
};
