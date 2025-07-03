"use client";

import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Account, ViewerModalState } from "../_types";
import { formatNumber, formatPercentage, getMonthsInRange } from "../_utils";

interface AccountRowProps {
  account: Account;
  level?: number;
  isCollapsed: boolean;
  toggleAccount: (accountId: string) => void;
  calculateAccountDirectTotal: (account: Account) => number;
  calculateAccountTotal: (account: Account) => number;
  getSubaccounts: (parentId: string) => Account[];
  hasTransactions: (account: Account) => boolean;
  setViewerModal: (state: ViewerModalState) => void;
  isMonthlyView: boolean;
  showPercentages: boolean;
  startDate: string;
  endDate: string;
  calculateAccountTotalForMonth?: (account: Account, month: string) => number;
  calculateAccountTotalForMonthWithSubaccounts?: (account: Account, month: string) => number;
  formatPercentageForAccount?: (num: number, account: Account) => string;
  previousPeriodTotal?: number;
  showPreviousPeriod?: boolean;
}

export const AccountRow: React.FC<AccountRowProps> = ({
  account,
  level = 0,
  isCollapsed,
  toggleAccount,
  calculateAccountDirectTotal,
  calculateAccountTotal,
  getSubaccounts,
  hasTransactions,
  setViewerModal,
  isMonthlyView,
  showPercentages,
  startDate,
  endDate,
  calculateAccountTotalForMonth,
  calculateAccountTotalForMonthWithSubaccounts,
  formatPercentageForAccount,
  previousPeriodTotal,
  showPreviousPeriod = false,
}) => {
  const subaccounts = getSubaccounts(account.id).filter(hasTransactions);
  const isParent = subaccounts.length > 0;
  const accountTotal = calculateAccountTotal(account);
  const directTotal = calculateAccountDirectTotal(account);
  const months = isMonthlyView ? getMonthsInRange(startDate, endDate) : [];

  // If this account has no transactions and no subaccounts, don't render
  if (!isParent && Math.abs(directTotal) < 0.01) return null;

  return (
    <React.Fragment>
      <TableRow
        className="cursor-pointer hover:bg-gray-100"
        onClick={() => {
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

        {isMonthlyView ? (
          // Monthly view columns
          <>
            {months.map((month) => (
              <React.Fragment key={month}>
                <TableCell
                  className="border p-1 text-right text-xs cursor-pointer hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewerModal({ isOpen: true, category: account, selectedMonth: month });
                  }}
                >
                  {formatNumber(
                    isParent && isCollapsed && calculateAccountTotalForMonthWithSubaccounts
                      ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                      : calculateAccountTotalForMonth
                      ? calculateAccountTotalForMonth(account, month)
                      : 0
                  )}
                </TableCell>
                {showPercentages && formatPercentageForAccount && (
                  <TableCell
                    className="border p-1 text-right text-xs text-slate-600 cursor-pointer hover:bg-gray-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerModal({ isOpen: true, category: account, selectedMonth: month });
                    }}
                  >
                    {formatPercentageForAccount(
                      isParent && isCollapsed && calculateAccountTotalForMonthWithSubaccounts
                        ? calculateAccountTotalForMonthWithSubaccounts(account, month)
                        : calculateAccountTotalForMonth
                        ? calculateAccountTotalForMonth(account, month)
                        : 0,
                      account
                    )}
                  </TableCell>
                )}
              </React.Fragment>
            ))}
            <TableCell className="border p-1 text-right font-semibold text-xs">
              {formatNumber(isParent && isCollapsed ? accountTotal : directTotal)}
            </TableCell>
            {showPercentages && formatPercentageForAccount && (
              <TableCell className="border p-1 text-right text-xs text-slate-600">
                {formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal, account)}
              </TableCell>
            )}
          </>
        ) : (
          // Standard view columns
          <>
            <TableCell className="border p-1 text-right text-xs" style={{ width: "20%" }}>
              {formatNumber(isParent && isCollapsed ? accountTotal : directTotal)}
            </TableCell>
            {showPercentages && formatPercentageForAccount && (
              <TableCell className="border p-1 text-right text-xs text-slate-600">
                {formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal, account)}
              </TableCell>
            )}
            {showPreviousPeriod && previousPeriodTotal !== undefined && (
              <>
                <TableCell className="border p-1 text-right text-xs" style={{ width: "20%" }}>
                  {formatNumber(previousPeriodTotal)}
                </TableCell>
                {showPercentages && (
                  <TableCell className="border p-1 text-right text-xs text-slate-600">
                    {formatPercentage(previousPeriodTotal, 100)}
                  </TableCell>
                )}
                <TableCell className="border p-1 text-right text-xs" style={{ width: "20%" }}>
                  {formatNumber((isParent && isCollapsed ? accountTotal : directTotal) - previousPeriodTotal)}
                </TableCell>
              </>
            )}
          </>
        )}
      </TableRow>
    </React.Fragment>
  );
};
