import { useMemo } from "react";
import ExcelJS from "exceljs";
import { Category, Transaction } from "../_types";
import {
  formatDateForDisplay,
  formatPercentage,
  getMonthsInRange,
  formatMonth,
  getQuartersInRange,
  formatQuarter,
  getSubaccounts,
  hasTransactions,
} from "../_utils";

interface UseExportProfitLossParams {
  // Data
  categories: Category[];
  journalEntries: Transaction[];
  revenueRows: Category[];
  cogsRows: Category[];
  expenseRows: Category[];

  // Company info
  currentCompany: { name: string } | null;

  // Display configuration
  isMonthlyView: boolean;
  isQuarterlyView: boolean;
  showPercentages: boolean;
  startDate: string;
  endDate: string;

  // Account operations
  collapsedAccounts: Set<string>;
  calculateAccountTotal: (category: Category) => number;
  calculateAccountDirectTotal: (category: Category) => number;
  calculateAccountTotalForMonth: (category: Category, month: string) => number;
  calculateAccountTotalForMonthWithSubaccounts: (category: Category, month: string) => number;
  calculateAccountTotalForQuarter: (category: Category, quarter: string) => number;
  calculateAccountTotalForQuarterWithSubaccounts: (category: Category, quarter: string) => number;

  // Formatting functions
  formatPercentageForAccount: (num: number, category?: Category) => string;
  calculatePercentageForMonth: (amount: number, month: string) => string;
  calculatePercentageForQuarter: (amount: number, quarter: string) => string;
}

export const useExportProfitLoss = (params: UseExportProfitLossParams) => {
  const {
    categories,
    journalEntries,
    revenueRows,
    cogsRows,
    expenseRows,
    currentCompany,
    isMonthlyView,
    isQuarterlyView,
    showPercentages,
    startDate,
    endDate,
    collapsedAccounts,
    calculateAccountTotal,
    calculateAccountDirectTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts,
    calculateAccountTotalForQuarter,
    calculateAccountTotalForQuarterWithSubaccounts,
    formatPercentageForAccount,
    calculatePercentageForMonth,
    calculatePercentageForQuarter,
  } = params;

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

  const exportToXLSX = useMemo(() => {
    return async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Profit & Loss");

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
        numFmt: '#,##0.00;(#,##0.00);"—"', // Format to show dash for zero values
        alignment: { horizontal: "right" as const },
      };
      const totalStyle = {
        font: { bold: true, size: 10 },
        numFmt: '#,##0.00;(#,##0.00);"—"', // Format to show dash for zero values
      };

      let currentRow = 1;
      const months = isMonthlyView ? getMonthsInRange(startDate, endDate) : [];
      const quarters = isQuarterlyView ? getQuartersInRange(startDate, endDate) : [];

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
        totalColumns = 1; // Account column
        totalColumns += 1; // Total column
        if (showPercentages) {
          totalColumns += 1; // Percentage column
        }
      }

      if (currentCompany) {
        worksheet.mergeCells(`A${currentRow}:${numberToExcelColumn(totalColumns)}${currentRow}`);
        worksheet.getCell(`A${currentRow}`).value = currentCompany.name;
        worksheet.getCell(`A${currentRow}`).style = companyStyle;
        currentRow++;
      }

      // Title and company info at top
      worksheet.mergeCells(`A${currentRow}:${numberToExcelColumn(totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = "Profit & Loss";
      worksheet.getCell(`A${currentRow}`).style = {
        font: { size: 10 },
        alignment: { horizontal: "center" as const },
      };
      currentRow++;

      worksheet.mergeCells(`A${currentRow}:${numberToExcelColumn(totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(
        endDate
      )}`;
      worksheet.getCell(`A${currentRow}`).style = { font: { size: 10 }, alignment: { horizontal: "center" as const } };
      currentRow++;

      // Table headers
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
        worksheet.getCell(currentRow, colIndex++).value = "Total";
        worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
        if (showPercentages) {
          worksheet.getCell(currentRow, colIndex++).value = "%";
          worksheet.getCell(currentRow, colIndex - 1).style = headerStyle;
        }
      }
      currentRow++;

      // Helper function to add account rows
      const addAccountRows = (accountsToRender: Category[], sectionName: string, level = 0) => {
        if (accountsToRender.length === 0) return 0;

        // Section header
        worksheet.mergeCells(`A${currentRow}:${numberToExcelColumn(totalColumns)}${currentRow}`);
        worksheet.getCell(`A${currentRow}`).value = sectionName;
        worksheet.getCell(`A${currentRow}`).style = sectionStyle;
        currentRow++;

        // Account rows
        accountsToRender.forEach((account) => {
          const addAccountRow = (acc: Category, accountLevel: number) => {
            const subaccounts = getSubaccounts(categories, acc.id).filter((sub) =>
              hasTransactions(sub, journalEntries, categories)
            );

            const isParent = subaccounts.length > 0;
            const isCollapsed = collapsedAccounts.has(acc.id);
            const accountTotal = calculateAccountTotal(acc);
            const directTotal = calculateAccountDirectTotal(acc);

            // Use the same logic as the web table: show account total if collapsed, direct total if expanded
            if (Math.abs(isParent && isCollapsed ? accountTotal : directTotal) < 0.01 && !isParent) return;

            let colIndex = 1;
            const indent = "        ".repeat(accountLevel);
            worksheet.getCell(currentRow, colIndex++).value = `  ${indent}${acc.name}`;
            worksheet.getCell(currentRow, 1).style = { font: { size: 10 } };

            if (isMonthlyView) {
              months.forEach((month) => {
                // Use the same logic as the web table
                const monthlyTotal =
                  isParent && isCollapsed
                    ? calculateAccountTotalForMonthWithSubaccounts(acc, month)
                    : calculateAccountTotalForMonth(acc, month);

                worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

                if (showPercentages) {
                  const percentValue = formatPercentageForAccount(monthlyTotal, acc);
                  worksheet.getCell(currentRow, colIndex++).value =
                    percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                }
              });

              // Total column - use the same logic as the web table
              worksheet.getCell(currentRow, colIndex++).value = isParent && isCollapsed ? accountTotal : directTotal;
              worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

              if (showPercentages) {
                const percentValue = formatPercentageForAccount(
                  isParent && isCollapsed ? accountTotal : directTotal,
                  acc
                );
                worksheet.getCell(currentRow, colIndex++).value =
                  percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
              }
            } else if (isQuarterlyView) {
              quarters.forEach((quarter) => {
                // Use the same logic as the web table
                const quarterlyTotal =
                  isParent && isCollapsed
                    ? calculateAccountTotalForQuarterWithSubaccounts(acc, quarter)
                    : calculateAccountTotalForQuarter(acc, quarter);

                worksheet.getCell(currentRow, colIndex++).value = quarterlyTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

                if (showPercentages) {
                  const percentValue = formatPercentageForAccount(quarterlyTotal, acc);
                  worksheet.getCell(currentRow, colIndex++).value =
                    percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                }
              });

              // Total column - use the same logic as the web table
              worksheet.getCell(currentRow, colIndex++).value = isParent && isCollapsed ? accountTotal : directTotal;
              worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

              if (showPercentages) {
                const percentValue = formatPercentageForAccount(
                  isParent && isCollapsed ? accountTotal : directTotal,
                  acc
                );
                worksheet.getCell(currentRow, colIndex++).value =
                  percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
              }
            } else {
              worksheet.getCell(currentRow, colIndex++).value = isParent && isCollapsed ? accountTotal : directTotal;
              worksheet.getCell(currentRow, colIndex - 1).style = numberStyle;

              if (showPercentages) {
                const percentValue = formatPercentageForAccount(
                  isParent && isCollapsed ? accountTotal : directTotal,
                  acc
                );
                worksheet.getCell(currentRow, colIndex++).value =
                  percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
              }
            }
            currentRow++;

            // Add subaccounts and total row only if not collapsed (same as web table)
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
                  const monthlyTotal = calculateAccountTotalForMonthWithSubaccounts(acc, month);
                  worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
                  worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                  if (showPercentages) {
                    const percentValue = formatPercentageForAccount(monthlyTotal, acc);
                    worksheet.getCell(currentRow, colIndex++).value =
                      percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                    worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                  }
                });

                // Total column
                worksheet.getCell(currentRow, colIndex++).value = accountTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                if (showPercentages) {
                  const percentValue = formatPercentageForAccount(accountTotal, acc);
                  worksheet.getCell(currentRow, colIndex++).value =
                    percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                }
              } else if (isQuarterlyView) {
                quarters.forEach((quarter) => {
                  const quarterlyTotal = calculateAccountTotalForQuarterWithSubaccounts(acc, quarter);
                  worksheet.getCell(currentRow, colIndex++).value = quarterlyTotal;
                  worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                  if (showPercentages) {
                    const percentValue = formatPercentageForAccount(quarterlyTotal, acc);
                    worksheet.getCell(currentRow, colIndex++).value =
                      percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                    worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                  }
                });

                // Total column
                worksheet.getCell(currentRow, colIndex++).value = accountTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                if (showPercentages) {
                  const percentValue = formatPercentageForAccount(accountTotal, acc);
                  worksheet.getCell(currentRow, colIndex++).value =
                    percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                }
              } else {
                worksheet.getCell(currentRow, colIndex++).value = accountTotal;
                worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

                if (showPercentages) {
                  const percentValue = formatPercentageForAccount(accountTotal, acc);
                  worksheet.getCell(currentRow, colIndex++).value =
                    percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
                  worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
                }
              }
              currentRow++;
            }
          };

          addAccountRow(account, level);
        });

        // Section total
        const sectionTotal = accountsToRender.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
        colIndex = 1;
        worksheet.getCell(currentRow, colIndex++).value = `Total ${sectionName}`;
        worksheet.getCell(currentRow, 1).style = totalStyle;

        if (isMonthlyView) {
          months.forEach((month) => {
            const monthlyTotal = accountsToRender.reduce(
              (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
              0
            );
            worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
            worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

            if (showPercentages) {
              const percentValue =
                sectionName === "Revenue" && monthlyTotal !== 0 ? "100.0%" : calculatePercentageForMonth(monthlyTotal, month);
              worksheet.getCell(currentRow, colIndex++).value =
                percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
              worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
            }
          });

          // Total column
          worksheet.getCell(currentRow, colIndex++).value = sectionTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
            const percentValue =
              sectionName === "Revenue" && totalRevenue !== 0 ? "100.0%" : formatPercentage(sectionTotal, totalRevenue);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        } else if (isQuarterlyView) {
          quarters.forEach((quarter) => {
            const quarterlyTotal = accountsToRender.reduce(
              (sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter),
              0
            );
            worksheet.getCell(currentRow, colIndex++).value = quarterlyTotal;
            worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

            if (showPercentages) {
              const percentValue =
                sectionName === "Revenue" && quarterlyTotal !== 0 ? "100.0%" : calculatePercentageForQuarter(quarterlyTotal, quarter);
              worksheet.getCell(currentRow, colIndex++).value =
                percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
              worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
            }
          });

          // Total column
          worksheet.getCell(currentRow, colIndex++).value = sectionTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
            const percentValue =
              sectionName === "Revenue" && totalRevenue !== 0 ? "100.0%" : formatPercentage(sectionTotal, totalRevenue);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        } else {
          worksheet.getCell(currentRow, colIndex++).value = sectionTotal;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
            const percentValue =
              sectionName === "Revenue" && totalRevenue !== 0 ? "100.0%" : formatPercentage(sectionTotal, totalRevenue);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        }
        currentRow++;

        return sectionTotal;
      };

      // Add sections
      const totalRevenue = addAccountRows(revenueRows, "Revenue");
      const totalCOGS = addAccountRows(cogsRows, "Cost of Goods Sold (COGS)");

      // Gross Profit
      const grossProfit = totalRevenue - totalCOGS;
      colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = "Gross Profit";
      worksheet.getCell(currentRow, 1).style = totalStyle;

      if (isMonthlyView) {
        months.forEach((month) => {
          const monthlyGrossProfit =
            revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
            cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0);
          worksheet.getCell(currentRow, colIndex++).value = monthlyGrossProfit;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForMonth(monthlyGrossProfit, month);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = grossProfit;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
          const percentValue = formatPercentage(grossProfit, totalRevenue);
          worksheet.getCell(currentRow, colIndex++).value =
            percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else if (isQuarterlyView) {
        quarters.forEach((quarter) => {
          const quarterlyGrossProfit =
            revenueRows.reduce((sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter), 0) -
            cogsRows.reduce((sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter), 0);
          worksheet.getCell(currentRow, colIndex++).value = quarterlyGrossProfit;
          worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

          if (showPercentages) {
            const percentValue = calculatePercentageForQuarter(quarterlyGrossProfit, quarter);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = grossProfit;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
          const percentValue = formatPercentage(grossProfit, totalRevenue);
          worksheet.getCell(currentRow, colIndex++).value =
            percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      } else {
        worksheet.getCell(currentRow, colIndex++).value = grossProfit;
        worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

        if (showPercentages) {
          const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
          const percentValue = formatPercentage(grossProfit, totalRevenue);
          worksheet.getCell(currentRow, colIndex++).value =
            percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = { ...totalStyle, numFmt: '0.0%;-0.0%;"—"' };
        }
      }
      currentRow++;

      const totalExpenses = addAccountRows(expenseRows, "Expenses");

      // Net Income
      const netIncome = totalRevenue - totalCOGS - totalExpenses;
      colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = "Net Income";
      worksheet.getCell(currentRow, 1).style = {
        font: { bold: true },
        alignment: { horizontal: "left" as const },
      };

      if (isMonthlyView) {
        months.forEach((month) => {
          const monthlyNetIncome =
            revenueRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
            cogsRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0) -
            expenseRows.reduce((sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month), 0);
          worksheet.getCell(currentRow, colIndex++).value = monthlyNetIncome;
          worksheet.getCell(currentRow, colIndex - 1).style = {
            font: { bold: true },
            numFmt: '#,##0.00;(#,##0.00);"—"', // Correct number format with dash for zero values
            alignment: { horizontal: "right" as const },
          };

          if (showPercentages) {
            const percentValue = calculatePercentageForMonth(monthlyNetIncome, month);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = {
              font: { bold: true },
              numFmt: '0.0%;-0.0%;\"—\"',
              alignment: { horizontal: "right" as const },
            };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = netIncome;
        worksheet.getCell(currentRow, colIndex - 1).style = {
          font: { bold: true },
          numFmt: '#,##0.00;(#,##0.00);"—"', // Correct number format with dash for zero values
          alignment: { horizontal: "right" as const },
        };

        if (showPercentages) {
          const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
          const percentValue = formatPercentage(netIncome, totalRevenue);
          worksheet.getCell(currentRow, colIndex++).value =
            percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = {
            font: { bold: true },
            numFmt: "0.0%",
            alignment: { horizontal: "right" as const },
          };
        }
      } else if (isQuarterlyView) {
        quarters.forEach((quarter) => {
          const quarterlyNetIncome =
            revenueRows.reduce((sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter), 0) -
            cogsRows.reduce((sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter), 0) -
            expenseRows.reduce((sum, a) => sum + calculateAccountTotalForQuarterWithSubaccounts(a, quarter), 0);
          worksheet.getCell(currentRow, colIndex++).value = quarterlyNetIncome;
          worksheet.getCell(currentRow, colIndex - 1).style = {
            font: { bold: true },
            numFmt: '#,##0.00;(#,##0.00);"—"', // Correct number format with dash for zero values
            alignment: { horizontal: "right" as const },
          };

          if (showPercentages) {
            const percentValue = calculatePercentageForQuarter(quarterlyNetIncome, quarter);
            worksheet.getCell(currentRow, colIndex++).value =
              percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
            worksheet.getCell(currentRow, colIndex - 1).style = {
              font: { bold: true },
              numFmt: '0.0%;-0.0%;\"—\"',
              alignment: { horizontal: "right" as const },
            };
          }
        });

        // Total column
        worksheet.getCell(currentRow, colIndex++).value = netIncome;
        worksheet.getCell(currentRow, colIndex - 1).style = {
          font: { bold: true },
          numFmt: '#,##0.00;(#,##0.00);"—"', // Correct number format with dash for zero values
          alignment: { horizontal: "right" as const },
        };

        if (showPercentages) {
          const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
          const percentValue = formatPercentage(netIncome, totalRevenue);
          worksheet.getCell(currentRow, colIndex++).value =
            percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = {
            font: { bold: true },
            numFmt: "0.0%",
            alignment: { horizontal: "right" as const },
          };
        }
      } else {
        worksheet.getCell(currentRow, colIndex++).value = netIncome;
        worksheet.getCell(currentRow, colIndex - 1).style = {
          font: { bold: true },
          numFmt: '#,##0.00;(#,##0.00);"—"', // Correct number format with dash for zero values
          alignment: { horizontal: "right" as const },
        };

        if (showPercentages) {
          const totalRevenue = revenueRows.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
          const percentValue = formatPercentage(netIncome, totalRevenue);
          worksheet.getCell(currentRow, colIndex++).value =
            percentValue === "—" ? null : parseFloat(percentValue.replace("%", "")) / 100;
          worksheet.getCell(currentRow, colIndex - 1).style = {
            font: { bold: true },
            numFmt: "0.0%",
            alignment: { horizontal: "right" as const },
          };
        }
      }

      // Set column widths
      worksheet.getColumn("A").width = 35;
      for (let i = 2; i <= totalColumns; i++) {
        worksheet.getColumn(i).width = 20; // Increased from 15 to 20 to accommodate larger numbers
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
      link.download = `${currentCompany?.name}-Profit & Loss-${startDate}-to-${endDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    };
  }, [
    categories,
    journalEntries,
    revenueRows,
    cogsRows,
    expenseRows,
    currentCompany,
    isMonthlyView,
    isQuarterlyView,
    showPercentages,
    startDate,
    endDate,
    collapsedAccounts,
    calculateAccountTotal,
    calculateAccountDirectTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts,
    calculateAccountTotalForQuarter,
    calculateAccountTotalForQuarterWithSubaccounts,
    formatPercentageForAccount,
    calculatePercentageForMonth,
    calculatePercentageForQuarter,
  ]);

  return { exportToXLSX };
};
