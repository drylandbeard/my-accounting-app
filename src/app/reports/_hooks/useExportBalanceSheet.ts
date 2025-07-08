import { useMemo } from "react";
import ExcelJS from "exceljs";
import { Category, Transaction } from "../_types";
import {
  formatDateForDisplay,
  getSubaccounts,
  hasTransactions,
  getMonthsInRange,
  formatMonth,
  getQuartersInRange,
  formatQuarter,
} from "../_utils";

interface UseExportBalanceSheetParams {
  // Data
  categories: Category[];
  journalEntries: Transaction[];
  assetAccounts: Category[];
  liabilityAccounts: Category[];
  equityAccounts: Category[];

  // Company info
  currentCompany: { name: string } | null;

  // Display configuration
  isMonthlyView: boolean;
  isQuarterlyView: boolean;
  showPercentages: boolean;
  startDate: string;
  asOfDate: string;

  // Account operations
  collapsedAccounts: Set<string>;
  calculateBalanceSheetAccountTotal: (category: Category) => number;
  calculateBalanceSheetAccountTotalWithSubaccounts: (category: Category) => number;
  calculateBalanceSheetAccountTotalForMonth: (category: Category, month: string) => number;
  calculateBalanceSheetAccountTotalForMonthWithSubaccounts: (category: Category, month: string) => number;
  calculateBalanceSheetAccountTotalForQuarter: (category: Category, quarter: string) => number;
  calculateBalanceSheetAccountTotalForQuarterWithSubaccounts: (category: Category, quarter: string) => number;

  // Totals
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  retainedEarnings: number;

  // Formatting functions
  formatPercentageForAccount: (num: number) => string;
  calculatePercentageForMonth: (amount: number, month: string) => string;
  calculatePercentageForQuarter: (amount: number, quarter: string) => string;
}

export const useExportBalanceSheet = (params: UseExportBalanceSheetParams) => {
  const {
    categories,
    journalEntries,
    assetAccounts,
    liabilityAccounts,
    equityAccounts,
    currentCompany,
    isMonthlyView,
    isQuarterlyView,
    showPercentages,
    startDate,
    asOfDate,
    collapsedAccounts,
    calculateBalanceSheetAccountTotal,
    calculateBalanceSheetAccountTotalWithSubaccounts,
    calculateBalanceSheetAccountTotalForMonth,
    calculateBalanceSheetAccountTotalForMonthWithSubaccounts,
    calculateBalanceSheetAccountTotalForQuarter,
    calculateBalanceSheetAccountTotalForQuarterWithSubaccounts,
    totalAssets,
    totalLiabilities,
    totalEquity,
    retainedEarnings,
    formatPercentageForAccount,
    calculatePercentageForMonth,
    calculatePercentageForQuarter,
  } = params;

  const exportToXLSX = useMemo(() => {
    return async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Balance Sheet");

      // Set basic styles
      const companyStyle = { font: { size: 12, bold: true }, alignment: { horizontal: "center" as const } };
      const headerStyle = {
        font: { bold: true, size: 10 },
        alignment: { horizontal: "center" as const },
      };
      const sectionStyle = {
        font: { bold: true, size: 10 },
      };
      const numberStyle = {
        font: { size: 10 },
        numFmt: '#,##0.00;(#,##0.00);"—"',
        alignment: { horizontal: "right" as const },
      };
      const totalStyle = {
        font: { bold: true, size: 10 },
        numFmt: '#,##0.00;(#,##0.00);"—"',
      };
      const percentStyle = {
        font: { size: 10 },
        numFmt: '0.0%;-0.0%;"—"',
        alignment: { horizontal: "right" as const },
      };

      let currentRow = 1;
      const months = isMonthlyView ? getMonthsInRange(startDate, asOfDate) : [];
      const quarters = isQuarterlyView ? getQuartersInRange(startDate, asOfDate) : [];

      // Calculate total columns based on actual header structure
      let totalColumns: number;
      if (isMonthlyView) {
        totalColumns = 1; // Account column
        totalColumns += months.length; // Month columns
        if (showPercentages) {
          totalColumns += months.length; // Percentage columns for each month
        }
        totalColumns += 1; // Total column
        if (showPercentages) {
          totalColumns += 1; // Total percentage column
        }
      } else if (isQuarterlyView) {
        totalColumns = 1; // Account column
        totalColumns += quarters.length; // Quarter columns
        if (showPercentages) {
          totalColumns += quarters.length; // Percentage columns for each quarter
        }
        totalColumns += 1; // Total column
        if (showPercentages) {
          totalColumns += 1; // Total percentage column
        }
      } else {
        totalColumns = showPercentages ? 3 : 2; // Account + Amount + (Percentage)
      }

      // Helper function to convert column number to Excel column letters (A, B, ..., Z, AA, AB, etc.)
      const numberToExcelColumn = (num: number): string => {
        let result = "";
        while (num > 0) {
          num--; // Make it 0-based
          result = String.fromCharCode(65 + (num % 26)) + result;
          num = Math.floor(num / 26);
        }
        return result;
      };

      // Company name
      if (currentCompany) {
        worksheet.mergeCells(`A${currentRow}:${numberToExcelColumn(totalColumns)}${currentRow}`);
        worksheet.getCell(`A${currentRow}`).value = currentCompany.name;
        worksheet.getCell(`A${currentRow}`).style = companyStyle;
        currentRow++;
      }

      // Title
      worksheet.mergeCells(`A${currentRow}:${numberToExcelColumn(totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = "Balance Sheet";
      worksheet.getCell(`A${currentRow}`).style = {
        font: { size: 10 },
        alignment: { horizontal: "center" as const },
      };
      currentRow++;

      // As of date or date range
      worksheet.mergeCells(`A${currentRow}:${numberToExcelColumn(totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = `As of ${formatDateForDisplay(asOfDate)}`;
      worksheet.getCell(`A${currentRow}`).style = {
        font: { size: 10 },
        alignment: { horizontal: "center" as const },
      };
      currentRow++;

      // Headers
      let colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = "";
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
      } else if (isQuarterlyView) {
        quarters.forEach((quarter) => {
          worksheet.getCell(currentRow, colIndex++).value = formatQuarter(quarter);
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
        worksheet.getCell(currentRow, colIndex++).value = showPercentages ? "Amount" : "Total";
        worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
        if (showPercentages) {
          worksheet.getCell(currentRow, colIndex++).value = "%";
          worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
        }
      }
      currentRow++;

      // Helper function to add account rows
      const addAccountRows = (accounts: Category[], sectionName: string, level = 0) => {
        if (accounts.length === 0) return 0;

        // Section header
        worksheet.mergeCells(`A${currentRow}:${numberToExcelColumn(totalColumns)}${currentRow}`);
        worksheet.getCell(`A${currentRow}`).value = sectionName;
        worksheet.getCell(`A${currentRow}`).style = sectionStyle;
        currentRow++;

        // Account rows
        accounts.forEach((account) => {
          const addAccountRow = (acc: Category, accountLevel: number) => {
            const subaccounts = getSubaccounts(categories, acc.id).filter((sub) =>
              hasTransactions(sub, journalEntries, categories)
            );
            const isParent = subaccounts.length > 0;
            const isCollapsed = collapsedAccounts.has(acc.id);
            const accountTotal = calculateBalanceSheetAccountTotalWithSubaccounts(acc);
            const directTotal = calculateBalanceSheetAccountTotal(acc);

            if (Math.abs(isParent && isCollapsed ? accountTotal : directTotal) < 0.01 && !isParent) return;

            let colIndex = 1;
            const indent = "  ".repeat(accountLevel);
            worksheet.getCell(currentRow, colIndex++).value = `${indent}${acc.name}`;
            worksheet.getCell(currentRow, 1).style = { font: { size: 10 } };

            if (isMonthlyView) {
              months.forEach((month) => {
                const monthTotal =
                  isParent && isCollapsed
                    ? calculateBalanceSheetAccountTotalForMonthWithSubaccounts(acc, month)
                    : calculateBalanceSheetAccountTotalForMonth(acc, month);

                worksheet.getCell(currentRow, colIndex++).value = monthTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

                if (showPercentages) {
                  const percentValue = formatPercentageForAccount(monthTotal);
                  worksheet.getCell(currentRow, colIndex++).value =
                    percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
                }
              });

              // Total column
              worksheet.getCell(currentRow, colIndex++).value = isParent && isCollapsed ? accountTotal : directTotal;
              worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

              if (showPercentages) {
                const percentValue = formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal);
                worksheet.getCell(currentRow, colIndex++).value =
                  percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
              }
            } else if (isQuarterlyView) {
              quarters.forEach((quarter) => {
                const quarterTotal =
                  isParent && isCollapsed
                    ? calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(acc, quarter)
                    : calculateBalanceSheetAccountTotalForQuarter(acc, quarter);

                worksheet.getCell(currentRow, colIndex++).value = quarterTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

                if (showPercentages) {
                  const percentValue = formatPercentageForAccount(quarterTotal);
                  worksheet.getCell(currentRow, colIndex++).value =
                    percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
                }
              });

              // Total column
              worksheet.getCell(currentRow, colIndex++).value = isParent && isCollapsed ? accountTotal : directTotal;
              worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

              if (showPercentages) {
                const percentValue = formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal);
                worksheet.getCell(currentRow, colIndex++).value =
                  percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
              }
            } else {
              worksheet.getCell(currentRow, colIndex++).value = isParent && isCollapsed ? accountTotal : directTotal;
              worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

              if (showPercentages) {
                const percentValue = formatPercentageForAccount(isParent && isCollapsed ? accountTotal : directTotal);
                worksheet.getCell(currentRow, colIndex++).value =
                  percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
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
                  const monthTotal = calculateBalanceSheetAccountTotalForMonthWithSubaccounts(acc, month);
                  worksheet.getCell(currentRow, colIndex++).value = monthTotal;
                  worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                  if (showPercentages) {
                    const percentValue = formatPercentageForAccount(monthTotal);
                    worksheet.getCell(currentRow, colIndex++).value =
                      percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                    worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                  }
                });

                // Total column
                worksheet.getCell(currentRow, colIndex++).value = accountTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                if (showPercentages) {
                  const totalPercentValue = formatPercentageForAccount(accountTotal);
                  worksheet.getCell(currentRow, colIndex++).value =
                    totalPercentValue === "—" ? null : parseFloat(totalPercentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                }
              } else if (isQuarterlyView) {
                quarters.forEach((quarter) => {
                  const quarterTotal = calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(acc, quarter);
                  worksheet.getCell(currentRow, colIndex++).value = quarterTotal;
                  worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                  if (showPercentages) {
                    const percentValue = formatPercentageForAccount(quarterTotal);
                    worksheet.getCell(currentRow, colIndex++).value =
                      percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                    worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                  }
                });

                // Total column
                worksheet.getCell(currentRow, colIndex++).value = accountTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                if (showPercentages) {
                  const totalPercentValue = formatPercentageForAccount(accountTotal);
                  worksheet.getCell(currentRow, colIndex++).value =
                    totalPercentValue === "—" ? null : parseFloat(totalPercentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                }
              } else {
                worksheet.getCell(currentRow, colIndex++).value = accountTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                if (showPercentages) {
                  const totalPercentValue = formatPercentageForAccount(accountTotal);
                  worksheet.getCell(currentRow, colIndex++).value =
                    totalPercentValue === "—" ? null : parseFloat(totalPercentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                }
              }
              currentRow++;
            }
          };

          addAccountRow(account, level);
        });

        // Section total
        const sectionTotal = accounts.reduce((sum, a) => sum + calculateBalanceSheetAccountTotalWithSubaccounts(a), 0);
        let colIndex = 1;
        worksheet.getCell(currentRow, colIndex++).value = `Total ${sectionName}`;
        worksheet.getCell(currentRow, 1).style = totalStyle;

        if (isMonthlyView) {
          months.forEach((month) => {
            const monthlyTotal = accounts.reduce(
              (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
              0
            );
            worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
            worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

            if (showPercentages) {
              const percentValue = calculatePercentageForMonth(monthlyTotal, month);
              worksheet.getCell(currentRow, colIndex++).value =
                percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
              worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
            }
          });

          // Total column
          worksheet.getCell(currentRow, colIndex++).value = sectionTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const sectionPercentValue = formatPercentageForAccount(sectionTotal);
            worksheet.getCell(currentRow, colIndex++).value =
              sectionPercentValue === "—" ? null : parseFloat(sectionPercentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        } else if (isQuarterlyView) {
          quarters.forEach((quarter) => {
            const quarterlyTotal = accounts.reduce(
              (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
              0
            );
            worksheet.getCell(currentRow, colIndex++).value = quarterlyTotal;
            worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

            if (showPercentages) {
              const percentValue = calculatePercentageForQuarter(quarterlyTotal, quarter);
              worksheet.getCell(currentRow, colIndex++).value =
                percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
              worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
            }
          });

          // Total column
          worksheet.getCell(currentRow, colIndex++).value = sectionTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const sectionPercentValue = formatPercentageForAccount(sectionTotal);
            worksheet.getCell(currentRow, colIndex++).value =
              sectionPercentValue === "—" ? null : parseFloat(sectionPercentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        } else {
          worksheet.getCell(currentRow, colIndex++).value = sectionTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const sectionPercentValue = formatPercentageForAccount(sectionTotal);
            worksheet.getCell(currentRow, colIndex++).value =
              sectionPercentValue === "—" ? null : parseFloat(sectionPercentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        }

        currentRow++;

        return sectionTotal;
      };

      // Add Assets section
      addAccountRows(assetAccounts, "ASSETS");

      // Total Assets
      colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = "TOTAL ASSETS";
      worksheet.getCell(currentRow, 1).style = totalStyle;

      if (isMonthlyView) {
        months.forEach((month) => {
          const monthlyTotal = assetAccounts.reduce(
            (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
            0
          );
          worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            worksheet.getCell(currentRow, colIndex++).value = 1.0; // 100%
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = totalAssets;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          worksheet.getCell(currentRow, colIndex++).value = 1.0; // 100%
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else if (isQuarterlyView) {
        quarters.forEach((quarter) => {
          const quarterlyTotal = assetAccounts.reduce(
            (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
            0
          );
          worksheet.getCell(currentRow, colIndex++).value = quarterlyTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            worksheet.getCell(currentRow, colIndex++).value = 1.0; // 100%
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = totalAssets;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          worksheet.getCell(currentRow, colIndex++).value = 1.0; // 100%
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else {
        worksheet.getCell(currentRow, colIndex++).value = totalAssets;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          worksheet.getCell(currentRow, colIndex++).value = 1.0; // 100%
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      }
      currentRow++;

      // Empty row
      currentRow++;

      // Add Liabilities section
      addAccountRows(liabilityAccounts, "LIABILITIES");

      // Total Liabilities
      colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = "TOTAL LIABILITIES";
      worksheet.getCell(currentRow, 1).style = totalStyle;

      if (isMonthlyView) {
        months.forEach((month) => {
          const monthlyTotal = liabilityAccounts.reduce(
            (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
            0
          );
          worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForMonth(monthlyTotal, month);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = totalLiabilities;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const liabilitiesPercentValue = formatPercentageForAccount(totalLiabilities);
          worksheet.getCell(currentRow, colIndex++).value =
            liabilitiesPercentValue === "—" ? null : parseFloat(liabilitiesPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else if (isQuarterlyView) {
        quarters.forEach((quarter) => {
          const quarterlyTotal = liabilityAccounts.reduce(
            (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
            0
          );
          worksheet.getCell(currentRow, colIndex++).value = quarterlyTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForQuarter(quarterlyTotal, quarter);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = totalLiabilities;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const liabilitiesPercentValue = formatPercentageForAccount(totalLiabilities);
          worksheet.getCell(currentRow, colIndex++).value =
            liabilitiesPercentValue === "—" ? null : parseFloat(liabilitiesPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else {
        worksheet.getCell(currentRow, colIndex++).value = totalLiabilities;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const liabilitiesPercentValue = formatPercentageForAccount(totalLiabilities);
          worksheet.getCell(currentRow, colIndex++).value =
            liabilitiesPercentValue === "—" ? null : parseFloat(liabilitiesPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      }
      currentRow++;

      // Add Equity section
      addAccountRows(equityAccounts, "EQUITY");

      // Retained Earnings
      colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = "Retained Earnings";
      worksheet.getCell(currentRow, 1).style = { font: { size: 10 } };

      if (isMonthlyView) {
        months.forEach((month) => {
          worksheet.getCell(currentRow, colIndex++).value = retainedEarnings;
          worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForMonth(retainedEarnings, month);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = retainedEarnings;
        worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

        if (showPercentages) {
          const retainedEarningsPercentValue = formatPercentageForAccount(retainedEarnings);
          worksheet.getCell(currentRow, colIndex++).value =
            retainedEarningsPercentValue === "—"
              ? null
              : parseFloat(retainedEarningsPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
        }
      } else if (isQuarterlyView) {
        quarters.forEach((quarter) => {
          worksheet.getCell(currentRow, colIndex++).value = retainedEarnings;
          worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForQuarter(retainedEarnings, quarter);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = retainedEarnings;
        worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

        if (showPercentages) {
          const retainedEarningsPercentValue = formatPercentageForAccount(retainedEarnings);
          worksheet.getCell(currentRow, colIndex++).value =
            retainedEarningsPercentValue === "—"
              ? null
              : parseFloat(retainedEarningsPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
        }
      } else {
        worksheet.getCell(currentRow, colIndex++).value = retainedEarnings;
        worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

        if (showPercentages) {
          const retainedEarningsPercentValue = formatPercentageForAccount(retainedEarnings);
          worksheet.getCell(currentRow, colIndex++).value =
            retainedEarningsPercentValue === "—"
              ? null
              : parseFloat(retainedEarningsPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = percentStyle;
        }
      }
      currentRow++;

      // Total Equity
      colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = "TOTAL EQUITY";
      worksheet.getCell(currentRow, 1).style = totalStyle;

      if (isMonthlyView) {
        months.forEach((month) => {
          const monthlyTotal =
            equityAccounts.reduce(
              (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
              0
            ) + retainedEarnings;
          worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForMonth(monthlyTotal, month);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = totalEquity;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const equityPercentValue = formatPercentageForAccount(totalEquity);
          worksheet.getCell(currentRow, colIndex++).value =
            equityPercentValue === "—" ? null : parseFloat(equityPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else if (isQuarterlyView) {
        quarters.forEach((quarter) => {
          const quarterlyTotal =
            equityAccounts.reduce(
              (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
              0
            ) + retainedEarnings;
          worksheet.getCell(currentRow, colIndex++).value = quarterlyTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForQuarter(quarterlyTotal, quarter);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = totalEquity;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const equityPercentValue = formatPercentageForAccount(totalEquity);
          worksheet.getCell(currentRow, colIndex++).value =
            equityPercentValue === "—" ? null : parseFloat(equityPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else {
        worksheet.getCell(currentRow, colIndex++).value = totalEquity;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const equityPercentValue = formatPercentageForAccount(totalEquity);
          worksheet.getCell(currentRow, colIndex++).value =
            equityPercentValue === "—" ? null : parseFloat(equityPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      }
      currentRow++;

      // Total Liabilities & Equity
      colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = "TOTAL LIABILITIES & EQUITY";
      worksheet.getCell(currentRow, 1).style = totalStyle;

      if (isMonthlyView) {
        months.forEach((month) => {
          const monthlyTotal =
            liabilityAccounts.reduce(
              (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
              0
            ) +
            equityAccounts.reduce(
              (sum, a) => sum + calculateBalanceSheetAccountTotalForMonthWithSubaccounts(a, month),
              0
            ) +
            retainedEarnings;
          worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForMonth(monthlyTotal, month);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = totalLiabilities + totalEquity;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const totalLiabEquityPercentValue = formatPercentageForAccount(totalLiabilities + totalEquity);
          worksheet.getCell(currentRow, colIndex++).value =
            totalLiabEquityPercentValue === "—" ? null : parseFloat(totalLiabEquityPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else if (isQuarterlyView) {
        quarters.forEach((quarter) => {
          const quarterlyTotal =
            liabilityAccounts.reduce(
              (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
              0
            ) +
            equityAccounts.reduce(
              (sum, a) => sum + calculateBalanceSheetAccountTotalForQuarterWithSubaccounts(a, quarter),
              0
            ) +
            retainedEarnings;
          worksheet.getCell(currentRow, colIndex++).value = quarterlyTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForQuarter(quarterlyTotal, quarter);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = totalLiabilities + totalEquity;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const totalLiabEquityPercentValue = formatPercentageForAccount(totalLiabilities + totalEquity);
          worksheet.getCell(currentRow, colIndex++).value =
            totalLiabEquityPercentValue === "—" ? null : parseFloat(totalLiabEquityPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else {
        worksheet.getCell(currentRow, colIndex++).value = totalLiabilities + totalEquity;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const totalLiabEquityPercentValue = formatPercentageForAccount(totalLiabilities + totalEquity);
          worksheet.getCell(currentRow, colIndex++).value =
            totalLiabEquityPercentValue === "—" ? null : parseFloat(totalLiabEquityPercentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      }
      currentRow++;

      // Set column widths
      worksheet.getColumn("A").width = 35;
      for (let i = 2; i <= totalColumns; i++) {
        worksheet.getColumn(i).width = 15;
      }

      // Add footer
      currentRow += 3;
      const today = new Date();
      worksheet.mergeCells(`A${currentRow}:${numberToExcelColumn(totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = `switch | ${currentCompany?.name} | ${formatDateForDisplay(
        today.toISOString().split("T")[0]
      )} ${today.toLocaleTimeString()}`;
      worksheet.getCell(`A${currentRow}`).style = {
        font: { size: 9, color: { argb: "FF666666" } },
        alignment: { horizontal: "center" as const },
      };

      // Save the file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${currentCompany?.name}-Balance-Sheet-${asOfDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    };
  }, [
    categories,
    journalEntries,
    assetAccounts,
    liabilityAccounts,
    equityAccounts,
    currentCompany,
    isMonthlyView,
    isQuarterlyView,
    showPercentages,
    startDate,
    asOfDate,
    collapsedAccounts,
    calculateBalanceSheetAccountTotal,
    calculateBalanceSheetAccountTotalWithSubaccounts,
    calculateBalanceSheetAccountTotalForMonth,
    calculateBalanceSheetAccountTotalForMonthWithSubaccounts,
    calculateBalanceSheetAccountTotalForQuarter,
    calculateBalanceSheetAccountTotalForQuarterWithSubaccounts,
    totalAssets,
    totalLiabilities,
    totalEquity,
    retainedEarnings,
    formatPercentageForAccount,
    calculatePercentageForMonth,
    calculatePercentageForQuarter,
  ]);

  return { exportToXLSX };
};
