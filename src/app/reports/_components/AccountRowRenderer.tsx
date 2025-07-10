"use client";

import React from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Category, ViewerModalState, Transaction } from "../_types";
import { formatNumber, getMonthsInRange, getQuartersInRange, getAllAccountIds } from "../_utils";

interface AccountRowRendererProps {
  category: Category;
  level?: number;

  // Data
  categories: Category[];
  journalEntries: Transaction[];

  // Display configuration
  isMonthlyView: boolean;
  isQuarterlyView: boolean;
  showPercentages: boolean;
  startDate: string;
  endDate: string;
  parentOnly?: boolean;

  // Account operations
  collapsedAccounts: Set<string>;
  toggleCategory: (categoryId: string) => void;
  calculateAccountTotal: (category: Category) => number;
  calculateAccountDirectTotal: (category: Category) => number;
  calculateAccountTotalForMonth?: (category: Category, month: string) => number;
  calculateAccountTotalForMonthWithSubaccounts?: (category: Category, month: string) => number;
  calculateAccountTotalForQuarter?: (category: Category, quarter: string) => number;
  calculateAccountTotalForQuarterWithSubaccounts?: (category: Category, quarter: string) => number;

  // UI handlers
  setViewerModal: (state: ViewerModalState) => void;

  // Formatting
  formatPercentageForAccount: (num: number, category?: Category) => string;
}

export const AccountRowRenderer: React.FC<AccountRowRendererProps> = ({
  category,
  level = 0,
  parentOnly = false,
  categories,
  journalEntries,
  isMonthlyView,
  isQuarterlyView,
  showPercentages,
  startDate,
  endDate,
  collapsedAccounts,
  toggleCategory,
  calculateAccountTotal,
  calculateAccountDirectTotal,
  calculateAccountTotalForMonth,
  calculateAccountTotalForMonthWithSubaccounts,
  calculateAccountTotalForQuarter,
  calculateAccountTotalForQuarterWithSubaccounts,
  setViewerModal,
  formatPercentageForAccount,
}) => {
  const subaccounts = categories.filter(
    (subCategory) =>
      subCategory.parent_id === category.id &&
      journalEntries.some((tx) => getAllAccountIds(categories, subCategory).includes(tx.chart_account_id))
  );
  const isParent = subaccounts.length > 0;
  const isCollapsed = collapsedAccounts.has(category.id);
  const accountTotal = calculateAccountTotal(category);
  const directTotal = calculateAccountDirectTotal(category);

  if (Math.abs(isParent && isCollapsed ? accountTotal : directTotal) < 0.01 && !isParent) return null;

  const renderAccountRow = (category: Category, accLevel: number): React.ReactElement | null => {
    const accSubaccounts = categories.filter(
      (subCategory) =>
        subCategory.parent_id === category.id &&
        journalEntries.some((tx) => getAllAccountIds(categories, subCategory).includes(tx.chart_account_id))
    );
    const accIsParent = accSubaccounts.length > 0;
    const accIsCollapsed = collapsedAccounts.has(category.id);
    const accAccountTotal = calculateAccountTotal(category);
    const accDirectTotal = calculateAccountDirectTotal(category);

    if (Math.abs(accIsParent && accIsCollapsed ? accAccountTotal : accDirectTotal) < 0.01 && !accIsParent) return null;

    return (
      <React.Fragment key={category.id}>
        <TableRow
          className="cursor-pointer hover:bg-gray-100"
          onClick={() => setViewerModal({ isOpen: true, category: category })}
        >
          <TableCell className="border p-1 text-xs" style={{ paddingLeft: `${accLevel * 24 + 4}px` }}>
            <div className="flex items-center">
              {accLevel > 0 && <span className="text-gray-400 mr-2 text-xs">└</span>}
              {accIsParent && !parentOnly ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCategory(category.id);
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
              <span className="font-semibold">{category.name}</span>
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
                      setViewerModal({ isOpen: true, category: category, selectedMonth: month });
                    }}
                  >
                    {formatNumber(
                      accIsParent && accIsCollapsed
                        ? calculateAccountTotalForMonthWithSubaccounts?.(category, month) || 0
                        : calculateAccountTotalForMonth?.(category, month) || 0
                    )}
                  </TableCell>
                  {showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600">
                      {formatPercentageForAccount(
                        accIsParent && accIsCollapsed
                          ? calculateAccountTotalForMonthWithSubaccounts?.(category, month) || 0
                          : calculateAccountTotalForMonth?.(category, month) || 0,
                        category
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
                  {formatPercentageForAccount(
                    accIsParent && accIsCollapsed ? accAccountTotal : accDirectTotal,
                    category
                  )}
                </TableCell>
              )}
            </>
          ) : isQuarterlyView ? (
            <>
              {getQuartersInRange(startDate, endDate).map((quarter) => (
                <React.Fragment key={quarter}>
                  <TableCell
                    className="border p-1 text-right text-xs cursor-pointer hover:bg-gray-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerModal({ isOpen: true, category: category, selectedMonth: quarter });
                    }}
                  >
                    {formatNumber(
                      accIsParent && accIsCollapsed
                        ? calculateAccountTotalForQuarterWithSubaccounts?.(category, quarter) || 0
                        : calculateAccountTotalForQuarter?.(category, quarter) || 0
                    )}
                  </TableCell>
                  {showPercentages && (
                    <TableCell className="border p-1 text-right text-xs text-slate-600">
                      {formatPercentageForAccount(
                        accIsParent && accIsCollapsed
                          ? calculateAccountTotalForQuarterWithSubaccounts?.(category, quarter) || 0
                          : calculateAccountTotalForQuarter?.(category, quarter) || 0,
                        category
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
                  {formatPercentageForAccount(
                    accIsParent && accIsCollapsed ? accAccountTotal : accDirectTotal,
                    category
                  )}
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
                  {formatPercentageForAccount(
                    accIsParent && accIsCollapsed ? accAccountTotal : accDirectTotal,
                    category
                  )}
                </TableCell>
              )}
            </>
          )}
        </TableRow>

        {!accIsCollapsed && accSubaccounts.map((sub) => renderAccountRow(sub, accLevel + 1))}

        {accIsParent && !accIsCollapsed && (
          <TableRow
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => setViewerModal({ isOpen: true, category: category })}
          >
            <TableCell
              className="border p-1 text-xs bg-gray-50"
              style={{ paddingLeft: `${(accLevel + 1) * 24 + 8}px` }}
            >
              <span className="font-semibold">Total {category.name}</span>
            </TableCell>
            {isMonthlyView ? (
              <>
                {getMonthsInRange(startDate, endDate).map((month) => (
                  <React.Fragment key={month}>
                    <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                      {formatNumber(calculateAccountTotalForMonthWithSubaccounts?.(category, month) || 0)}
                    </TableCell>
                    {showPercentages && (
                      <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                        {formatPercentageForAccount(
                          calculateAccountTotalForMonthWithSubaccounts?.(category, month) || 0,
                          category
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
                    {formatPercentageForAccount(accAccountTotal, category)}
                  </TableCell>
                )}
              </>
            ) : isQuarterlyView ? (
              <>
                {getQuartersInRange(startDate, endDate).map((quarter) => (
                  <React.Fragment key={quarter}>
                    <TableCell className="border p-1 text-right font-semibold bg-gray-50 text-xs">
                      {formatNumber(calculateAccountTotalForQuarterWithSubaccounts?.(category, quarter) || 0)}
                    </TableCell>
                    {showPercentages && (
                      <TableCell className="border p-1 text-right text-xs text-slate-600 bg-gray-50">
                        {formatPercentageForAccount(
                          calculateAccountTotalForQuarterWithSubaccounts?.(category, quarter) || 0,
                          category
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
                    {formatPercentageForAccount(accAccountTotal, category)}
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
                    {formatPercentageForAccount(accAccountTotal, category)}
                  </TableCell>
                )}
              </>
            )}
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  return renderAccountRow(category, level);
};
