"use client";

import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Account, ViewerModalState, Transaction } from "../_types";
import { formatNumber, getMonthsInRange, getAllAccountIds } from "../_utils";

interface AccountRowRendererProps {
  account: Account;
  level?: number;

  // Data
  accounts: Account[];
  journalEntries: Transaction[];

  // Display configuration
  isMonthlyView: boolean;
  showPercentages: boolean;
  startDate: string;
  endDate: string;

  // Account operations
  collapsedAccounts: Set<string>;
  toggleAccount: (accountId: string) => void;
  calculateAccountTotal: (account: Account) => number;
  calculateAccountDirectTotal: (account: Account) => number;
  calculateAccountTotalForMonth?: (account: Account, month: string) => number;
  calculateAccountTotalForMonthWithSubaccounts?: (account: Account, month: string) => number;

  // UI handlers
  setViewerModal: (state: ViewerModalState) => void;

  // Formatting
  formatPercentageForAccount: (num: number, account?: Account) => string;
}

export const AccountRowRenderer: React.FC<AccountRowRendererProps> = ({
  account,
  level = 0,
  accounts,
  journalEntries,
  isMonthlyView,
  showPercentages,
  startDate,
  endDate,
  collapsedAccounts,
  toggleAccount,
  calculateAccountTotal,
  calculateAccountDirectTotal,
  calculateAccountTotalForMonth,
  calculateAccountTotalForMonthWithSubaccounts,
  setViewerModal,
  formatPercentageForAccount,
}) => {
  const subaccounts = accounts.filter(
    (acc) =>
      acc.parent_id === account.id &&
      journalEntries.some((tx) => getAllAccountIds(accounts, acc).includes(tx.chart_account_id))
  );
  const isParent = subaccounts.length > 0;
  const isCollapsed = collapsedAccounts.has(account.id);
  const accountTotal = calculateAccountTotal(account);
  const directTotal = calculateAccountDirectTotal(account);

  if (Math.abs(isParent && isCollapsed ? accountTotal : directTotal) < 0.01 && !isParent) return null;

  const renderAccountRow = (acc: Account, accLevel: number): React.ReactElement | null => {
    const accSubaccounts = accounts.filter(
      (subAcc) =>
        subAcc.parent_id === acc.id &&
        journalEntries.some((tx) => getAllAccountIds(accounts, subAcc).includes(tx.chart_account_id))
    );
    const accIsParent = accSubaccounts.length > 0;
    const accIsCollapsed = collapsedAccounts.has(acc.id);
    const accAccountTotal = calculateAccountTotal(acc);
    const accDirectTotal = calculateAccountDirectTotal(acc);

    if (Math.abs(accIsParent && accIsCollapsed ? accAccountTotal : accDirectTotal) < 0.01 && !accIsParent) return null;

    return (
      <React.Fragment key={acc.id}>
        <TableRow
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => setViewerModal({ isOpen: true, category: acc })}
        >
          <TableCell className="border p-1 text-xs" style={{ paddingLeft: `${accLevel * 24 + 4}px` }}>
            <div className="flex items-center">
              {accLevel > 0 && <span className="text-gray-400 mr-2 text-xs">└</span>}
              {accIsParent ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAccount(acc.id);
                  }}
                  className="mr-2 p-1 hover:bg-gray-200 rounded transition-colors"
                >
                  {accIsCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-gray-600" />
                  )}
                </button>
              ) : accLevel === 0 ? (
                <div className="mr-2 w-5 h-5"></div>
              ) : null}
              <span className="font-semibold">{acc.name}</span>
            </div>
          </TableCell>

          {isMonthlyView ? (
            <>
              {getMonthsInRange(startDate, endDate).map((month) => (
                <React.Fragment key={month}>
                  <TableCell
                    className="border p-1 text-right text-xs cursor-pointer hover:bg-gray-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerModal({ isOpen: true, category: acc, selectedMonth: month });
                    }}
                  >
                    {formatNumber(
                      accIsParent && accIsCollapsed
                        ? calculateAccountTotalForMonthWithSubaccounts?.(acc, month) || 0
                        : calculateAccountTotalForMonth?.(acc, month) || 0
                    )}
                  </TableCell>
                  {showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600">
                      {formatPercentageForAccount(
                        accIsParent && accIsCollapsed
                          ? calculateAccountTotalForMonthWithSubaccounts?.(acc, month) || 0
                          : calculateAccountTotalForMonth?.(acc, month) || 0,
                        acc
                      )}
                    </TableCell>
                  )}
                </React.Fragment>
              ))}
              <TableCell className="border p-1 text-right font-semibold text-xs">
                {formatNumber(accIsParent && accIsCollapsed ? accAccountTotal : accDirectTotal)}
              </TableCell>
              {showPercentages && (
                <TableCell className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentageForAccount(accIsParent && accIsCollapsed ? accAccountTotal : accDirectTotal, acc)}
                </TableCell>
              )}
            </>
          ) : (
            <>
              <TableCell className="border p-1 text-right text-xs">
                {formatNumber(accIsParent && accIsCollapsed ? accAccountTotal : accDirectTotal)}
              </TableCell>
              {showPercentages && (
                <TableCell className="border p-1 text-right text-xs text-slate-600">
                  {formatPercentageForAccount(accIsParent && accIsCollapsed ? accAccountTotal : accDirectTotal, acc)}
                </TableCell>
              )}
            </>
          )}
        </TableRow>

        {!accIsCollapsed && accSubaccounts.map((sub) => renderAccountRow(sub, accLevel + 1))}

        {accIsParent && !accIsCollapsed && (
          <TableRow
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => setViewerModal({ isOpen: true, category: acc })}
          >
            <TableCell
              className="border p-1 text-xs bg-gray-50"
              style={{ paddingLeft: `${(accLevel + 1) * 24 + 8}px` }}
            >
              <span className="font-semibold">Total {acc.name}</span>
            </TableCell>
            {isMonthlyView ? (
              <>
                {getMonthsInRange(startDate, endDate).map((month) => (
                  <React.Fragment key={month}>
                    <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                      {formatNumber(calculateAccountTotalForMonthWithSubaccounts?.(acc, month) || 0)}
                    </TableCell>
                    {showPercentages && (
                      <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                        {formatPercentageForAccount(
                          calculateAccountTotalForMonthWithSubaccounts?.(acc, month) || 0,
                          acc
                        )}
                      </TableCell>
                    )}
                  </React.Fragment>
                ))}
                <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                  {formatNumber(accAccountTotal)}
                </TableCell>
                {showPercentages && (
                  <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                    {formatPercentageForAccount(accAccountTotal, acc)}
                  </TableCell>
                )}
              </>
            ) : (
              <>
                <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                  {formatNumber(accAccountTotal)}
                </TableCell>
                {showPercentages && (
                  <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                    {formatPercentageForAccount(accAccountTotal, acc)}
                  </TableCell>
                )}
              </>
            )}
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  return renderAccountRow(account, level);
};
