import { useMemo } from "react";
import ExcelJS from "exceljs";
import { Account, Transaction } from "../_types";
import {
  formatDateForDisplay,
  formatPercentage,
  getMonthsInRange,
  formatMonth,
  getSubaccounts,
  hasTransactions,
} from "../_utils";

interface UseExportProfitLossParams {
  // Data
  accounts: Account[];
  journalEntries: Transaction[];
  revenueRows: Account[];
  cogsRows: Account[];
  expenseRows: Account[];

  // Company info
  currentCompany: { name: string } | null;

  // Display configuration
  isMonthlyView: boolean;
  showPercentages: boolean;
  startDate: string;
  endDate: string;

  // Account operations
  collapsedAccounts: Set<string>;
  calculateAccountTotal: (account: Account) => number;
  calculateAccountDirectTotal: (account: Account) => number;
  calculateAccountTotalForMonth: (account: Account, month: string) => number;
  calculateAccountTotalForMonthWithSubaccounts: (account: Account, month: string) => number;

  // Formatting functions
  formatPercentageForAccount: (num: number, account?: Account) => string;
  calculatePercentageForMonth: (amount: number, month: string) => string;
}

export const useExportProfitLoss = (params: UseExportProfitLossParams) => {
  const {
    accounts,
    journalEntries,
    revenueRows,
    cogsRows,
    expenseRows,
    currentCompany,
    isMonthlyView,
    showPercentages,
    startDate,
    endDate,
    collapsedAccounts,
    calculateAccountTotal,
    calculateAccountDirectTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts,
    formatPercentageForAccount,
    calculatePercentageForMonth,
  } = params;

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
      const totalColumns = isMonthlyView
        ? 1 + months.length * (showPercentages ? 2 : 1) + (showPercentages ? 2 : 1)
        : showPercentages
        ? 3
        : 2;

      if (currentCompany) {
        worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
        worksheet.getCell(`A${currentRow}`).value = currentCompany.name;
        worksheet.getCell(`A${currentRow}`).style = companyStyle;
        currentRow++;
      }

      // Title and company info at top
      worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = "Profit & Loss";
      worksheet.getCell(`A${currentRow}`).style = {
        font: { size: 10 },
        alignment: { horizontal: "center" as const },
      };
      currentRow++;

      worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(
        endDate
      )}`;
      worksheet.getCell(`A${currentRow}`).style = { font: { size: 10 }, alignment: { horizontal: "center" as const } };
      currentRow++;

      // Table headers
      let colIndex = 1;
      worksheet.getCell(currentRow, colIndex++).value = "Account";
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
      const addAccountRows = (accounts: Account[], sectionName: string, level = 0) => {
        if (accounts.length === 0) return 0;

        // Section header
        worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
        worksheet.getCell(`A${currentRow}`).value = sectionName;
        worksheet.getCell(`A${currentRow}`).style = sectionStyle;
        currentRow++;

        // Account rows
        accounts.forEach((account) => {
          const addAccountRow = (acc: Account, accountLevel: number) => {
            const subaccounts = getSubaccounts(accounts, acc.id).filter((sub) =>
              hasTransactions(sub, journalEntries, accounts)
            );
            const isParent = subaccounts.length > 0;
            const isCollapsed = collapsedAccounts.has(acc.id);
            const accountTotal = calculateAccountTotal(acc);
            const directTotal = calculateAccountDirectTotal(acc);

            if (Math.abs(isParent && isCollapsed ? accountTotal : directTotal) < 0.01 && !isParent) return;

            let colIndex = 1;
            const indent = "        ".repeat(accountLevel);
            worksheet.getCell(currentRow, colIndex++).value = `${indent}${acc.name}`;
            worksheet.getCell(currentRow, 1).style = { font: { size: 10 } };

            if (isMonthlyView) {
              months.forEach((month) => {
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

              // Total column
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
        const sectionTotal = accounts.reduce((sum, a) => sum + calculateAccountTotal(a), 0);
        colIndex = 1;
        worksheet.getCell(currentRow, colIndex++).value = `Total ${sectionName}`;
        worksheet.getCell(currentRow, 1).style = totalStyle;

        if (isMonthlyView) {
          months.forEach((month) => {
            const monthlyTotal = accounts.reduce(
              (sum, a) => sum + calculateAccountTotalForMonthWithSubaccounts(a, month),
              0
            );
            worksheet.getCell(currentRow, colIndex++).value = monthlyTotal;
            worksheet.getCell(currentRow, colIndex - 1).style = totalStyle;

            if (showPercentages) {
              const percentValue =
                sectionName === "Revenue" ? "100.0%" : calculatePercentageForMonth(monthlyTotal, month);
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
              numFmt: "0.0%",
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
        worksheet.getColumn(i).width = 15;
      }

      // Add footer
      currentRow += 3;

      const today = new Date();
      worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + totalColumns)}${currentRow}`);
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
    accounts,
    journalEntries,
    revenueRows,
    cogsRows,
    expenseRows,
    currentCompany,
    isMonthlyView,
    showPercentages,
    startDate,
    endDate,
    collapsedAccounts,
    calculateAccountTotal,
    calculateAccountDirectTotal,
    calculateAccountTotalForMonth,
    calculateAccountTotalForMonthWithSubaccounts,
    formatPercentageForAccount,
    calculatePercentageForMonth,
  ]);

  return { exportToXLSX };
};
