import { useMemo } from "react";
import ExcelJS from "exceljs";
import { Account, Category, Transaction } from "../_types";
import { formatDateForDisplay, getMonthsInRange, getQuartersInRange, formatMonth, formatQuarter } from "../_utils";

interface UseExportCashFlowParams {
  // Data
  categories: Category[];
  journalEntries: Transaction[];
  actualBankAccounts: Account[];
  revenueRows: Category[];
  cogsRows: Category[];
  expenseRows: Category[];

  // Company info
  currentCompany: { name: string } | null;

  // Display configuration
  isMonthlyView: boolean;
  isQuarterlyView: boolean;
  startDate: string;
  endDate: string;

  // Calculated values
  beginningBankBalance: number;
  endingBankBalance: number;
  operatingActivities: {
    revenue: number;
    cogs: number;
    expenses: number;
    netIncome: number;
  };
  investingActivities: {
    increaseInAssets: number;
    decreaseInAssets: number;
    netInvestingChange: number;
  };
  financingActivities: {
    increaseInCreditCards: number;
    decreaseInCreditCards: number;
    netCreditCardChange: number;
    increaseInLiabilities: number;
    decreaseInLiabilities: number;
    ownerInvestment: number;
    ownerWithdrawal: number;
    netFinancingChange: number;
  };

  // Account operations
  collapsedAccounts: Set<string>;
  calculateAccountTotal: (category: Category) => number;

  // Period calculation functions
  calculateBankBalanceForPeriod: (periodEnd: string) => number;
  calculateOperatingActivitiesForPeriod: (
    periodStart: string,
    periodEnd: string
  ) => {
    revenue: number;
    cogs: number;
    expenses: number;
    netIncome: number;
  };
  calculateInvestingActivitiesForPeriod: (
    periodStart: string,
    periodEnd: string
  ) => {
    increaseInAssets: number;
    decreaseInAssets: number;
    netInvestingChange: number;
  };
  calculateFinancingActivitiesForPeriod: (
    periodStart: string,
    periodEnd: string
  ) => {
    increaseInCreditCards: number;
    decreaseInCreditCards: number;
    netCreditCardChange: number;
    increaseInLiabilities: number;
    decreaseInLiabilities: number;
    ownerInvestment: number;
    ownerWithdrawal: number;
    netFinancingChange: number;
  };
}

export const useExportCashFlow = (params: UseExportCashFlowParams) => {
  const {
    beginningBankBalance,
    endingBankBalance,
    currentCompany,
    isMonthlyView,
    isQuarterlyView,
    startDate,
    endDate,
    calculateBankBalanceForPeriod,
    calculateOperatingActivitiesForPeriod,
    calculateInvestingActivitiesForPeriod,
    calculateFinancingActivitiesForPeriod,
  } = params;

  const exportToXLSX = useMemo(() => {
    return async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Cash Flow Statement");

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

      let currentRow = 1;

      // Company name
      if (currentCompany) {
        worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
        worksheet.getCell(`A${currentRow}`).value = currentCompany.name;
        worksheet.getCell(`A${currentRow}`).style = companyStyle;
        currentRow++;
      }

      // Title
      worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = "Cash Flow Statement";
      worksheet.getCell(`A${currentRow}`).style = {
        font: { size: 10 },
        alignment: { horizontal: "center" as const },
      };
      currentRow++;

      // Date range
      worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(
        endDate
      )}`;
      worksheet.getCell(`A${currentRow}`).style = {
        font: { size: 10 },
        alignment: { horizontal: "center" as const },
      };
      currentRow++;

      // Empty row
      currentRow++;

      // Headers
      worksheet.getCell(currentRow, 1).value = "Cash Flow Activities";
      worksheet.getCell(currentRow, 1).style = headerStyle;

      if (isMonthlyView) {
        const months = getMonthsInRange(startDate, endDate);
        let col = 2;
        months.forEach((month) => {
          worksheet.getCell(currentRow, col).value = formatMonth(month);
          worksheet.getCell(currentRow, col).style = headerStyle;
          col++;
        });
        worksheet.getCell(currentRow, col).value = "Total";
        worksheet.getCell(currentRow, col).style = headerStyle;
      } else if (isQuarterlyView) {
        const quarters = getQuartersInRange(startDate, endDate);
        let col = 2;
        quarters.forEach((quarter) => {
          worksheet.getCell(currentRow, col).value = formatQuarter(quarter);
          worksheet.getCell(currentRow, col).style = headerStyle;
          col++;
        });
        worksheet.getCell(currentRow, col).value = "Total";
        worksheet.getCell(currentRow, col).style = headerStyle;
      } else {
        worksheet.getCell(currentRow, 2).value = "Amount";
        worksheet.getCell(currentRow, 2).style = headerStyle;
      }
      currentRow++;

      // Helper function to add period data rows
      const addPeriodRow = (label: string, getValue: (periodStart: string, periodEnd: string) => number) => {
        worksheet.getCell(currentRow, 1).value = label;

        if (isMonthlyView) {
          const months = getMonthsInRange(startDate, endDate);
          let col = 2;
          months.forEach((month) => {
            const monthStart = `${month}-01`;
            const lastDay = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).getDate();
            const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
            worksheet.getCell(currentRow, col).value = getValue(monthStart, monthEnd);
            worksheet.getCell(currentRow, col).style = numberStyle;
            col++;
          });
          worksheet.getCell(currentRow, col).value = getValue(startDate, endDate);
          worksheet.getCell(currentRow, col).style = numberStyle;
        } else if (isQuarterlyView) {
          const quarters = getQuartersInRange(startDate, endDate);
          let col = 2;
          quarters.forEach((quarter) => {
            const [year, q] = quarter.split("-Q");
            const quarterNum = parseInt(q);
            const quarterStart = `${year}-${String((quarterNum - 1) * 3 + 1).padStart(2, "0")}-01`;
            const quarterEndMonth = quarterNum * 3;
            const quarterEnd = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${new Date(
              parseInt(year),
              quarterEndMonth,
              0
            ).getDate()}`;
            worksheet.getCell(currentRow, col).value = getValue(quarterStart, quarterEnd);
            worksheet.getCell(currentRow, col).style = numberStyle;
            col++;
          });
          worksheet.getCell(currentRow, col).value = getValue(startDate, endDate);
          worksheet.getCell(currentRow, col).style = numberStyle;
        } else {
          worksheet.getCell(currentRow, 2).value = getValue(startDate, endDate);
          worksheet.getCell(currentRow, 2).style = numberStyle;
        }
        currentRow++;
      };

      // Beginning Bank Balance
      worksheet.getCell(currentRow, 1).value = "Beginning Bank Balance";
      worksheet.getCell(currentRow, 1).style = sectionStyle;

      if (isMonthlyView) {
        const months = getMonthsInRange(startDate, endDate);
        let col = 2;
        months.forEach((month, index) => {
          const monthStart = `${month}-01`;
          const prevMonthEnd =
            index === 0
              ? new Date(new Date(monthStart).getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0]
              : new Date(new Date(monthStart).getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          
          const balance = index === 0 ? beginningBankBalance : calculateBankBalanceForPeriod(prevMonthEnd);
          worksheet.getCell(currentRow, col).value = balance;
          worksheet.getCell(currentRow, col).style = numberStyle;
          col++;
        });
        // Total column - use beginning balance
        worksheet.getCell(currentRow, col).value = beginningBankBalance;
        worksheet.getCell(currentRow, col).style = numberStyle;
      } else if (isQuarterlyView) {
        const quarters = getQuartersInRange(startDate, endDate);
        let col = 2;
        quarters.forEach((quarter, index) => {
          const [year, q] = quarter.split("-Q");
          const quarterNum = parseInt(q);
          const quarterStart = `${year}-${String((quarterNum - 1) * 3 + 1).padStart(2, "0")}-01`;
          const prevQuarterEnd =
            index === 0
              ? new Date(new Date(quarterStart).getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0]
              : new Date(new Date(quarterStart).getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];
          
          const balance = index === 0 ? beginningBankBalance : calculateBankBalanceForPeriod(prevQuarterEnd);
          worksheet.getCell(currentRow, col).value = balance;
          worksheet.getCell(currentRow, col).style = numberStyle;
          col++;
        });
        // Total column - use beginning balance
        worksheet.getCell(currentRow, col).value = beginningBankBalance;
        worksheet.getCell(currentRow, col).style = numberStyle;
      } else {
        worksheet.getCell(currentRow, 2).value = beginningBankBalance;
        worksheet.getCell(currentRow, 2).style = numberStyle;
      }
      currentRow++;

      // Empty row
      currentRow++;

      // Operating Activities
      worksheet.getCell(currentRow, 1).value = "Operating:";
      worksheet.getCell(currentRow, 1).style = sectionStyle;
      currentRow++;

      addPeriodRow(
        "  Revenue",
        (periodStart, periodEnd) => calculateOperatingActivitiesForPeriod(periodStart, periodEnd).revenue
      );
      addPeriodRow(
        "  COGS",
        (periodStart, periodEnd) => -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).cogs
      );
      addPeriodRow(
        "  Expenses",
        (periodStart, periodEnd) => -calculateOperatingActivitiesForPeriod(periodStart, periodEnd).expenses
      );
      addPeriodRow(
        "  Net Income",
        (periodStart, periodEnd) => calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome
      );
      addPeriodRow(
        "Operating Change:",
        (periodStart, periodEnd) => calculateOperatingActivitiesForPeriod(periodStart, periodEnd).netIncome
      );

      // Empty row
      currentRow++;

      // Investing Activities
      worksheet.getCell(currentRow, 1).value = "Investing:";
      worksheet.getCell(currentRow, 1).style = sectionStyle;
      currentRow++;

      addPeriodRow(
        "  Increase in Assets (non bank accounts)",
        (periodStart, periodEnd) => calculateInvestingActivitiesForPeriod(periodStart, periodEnd).increaseInAssets
      );
      addPeriodRow(
        "  Decrease in Assets (non bank accounts)",
        (periodStart, periodEnd) => calculateInvestingActivitiesForPeriod(periodStart, periodEnd).decreaseInAssets
      );
      addPeriodRow(
        "Investing Change:",
        (periodStart, periodEnd) => calculateInvestingActivitiesForPeriod(periodStart, periodEnd).netInvestingChange
      );

      // Empty row
      currentRow++;

      // Financing Activities
      worksheet.getCell(currentRow, 1).value = "Financing:";
      worksheet.getCell(currentRow, 1).style = sectionStyle;
      currentRow++;

      addPeriodRow(
        "  Increase in Credit Cards",
        (periodStart, periodEnd) => calculateFinancingActivitiesForPeriod(periodStart, periodEnd).increaseInCreditCards
      );
      addPeriodRow(
        "  Decrease in Credit Cards",
        (periodStart, periodEnd) => -calculateFinancingActivitiesForPeriod(periodStart, periodEnd).decreaseInCreditCards
      );
      addPeriodRow(
        "  Increases in Liabilities (e.g. new loans)",
        (periodStart, periodEnd) => calculateFinancingActivitiesForPeriod(periodStart, periodEnd).increaseInLiabilities
      );
      addPeriodRow(
        "  Decreases in Liabilities (e.g. loan repayments)",
        (periodStart, periodEnd) => -calculateFinancingActivitiesForPeriod(periodStart, periodEnd).decreaseInLiabilities
      );
      addPeriodRow(
        "  Owner contributions (Equity increases)",
        (periodStart, periodEnd) => calculateFinancingActivitiesForPeriod(periodStart, periodEnd).ownerInvestment
      );
      addPeriodRow(
        "  Owner distributions (Equity decreases)",
        (periodStart, periodEnd) => -calculateFinancingActivitiesForPeriod(periodStart, periodEnd).ownerWithdrawal
      );
      addPeriodRow(
        "Financing Change:",
        (periodStart, periodEnd) => calculateFinancingActivitiesForPeriod(periodStart, periodEnd).netFinancingChange
      );

      // Empty row
      currentRow++;

      // Ending Bank Balance
      worksheet.getCell(currentRow, 1).value = "Ending Bank Balance";
      worksheet.getCell(currentRow, 1).style = { font: { bold: true, size: 10 } };

      if (isMonthlyView) {
        const months = getMonthsInRange(startDate, endDate);
        let col = 2;
        months.forEach((month) => {
          const lastDay = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).getDate();
          const monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
          worksheet.getCell(currentRow, col).value = calculateBankBalanceForPeriod(monthEnd);
          worksheet.getCell(currentRow, col).style = {
            font: { bold: true, size: 10 },
            numFmt: '#,##0.00;(#,##0.00);"—"',
            alignment: { horizontal: "right" as const },
          };
          col++;
        });
        worksheet.getCell(currentRow, col).value = endingBankBalance;
        worksheet.getCell(currentRow, col).style = {
          font: { bold: true, size: 10 },
          numFmt: '#,##0.00;(#,##0.00);"—"',
          alignment: { horizontal: "right" as const },
        };
      } else if (isQuarterlyView) {
        const quarters = getQuartersInRange(startDate, endDate);
        let col = 2;
        quarters.forEach((quarter) => {
          const [year, q] = quarter.split("-Q");
          const quarterNum = parseInt(q);
          const quarterEndMonth = quarterNum * 3;
          const quarterEnd = `${year}-${String(quarterEndMonth).padStart(2, "0")}-${new Date(
            parseInt(year),
            quarterEndMonth,
            0
          ).getDate()}`;
          worksheet.getCell(currentRow, col).value = calculateBankBalanceForPeriod(quarterEnd);
          worksheet.getCell(currentRow, col).style = {
            font: { bold: true, size: 10 },
            numFmt: '#,##0.00;(#,##0.00);"—"',
            alignment: { horizontal: "right" as const },
          };
          col++;
        });
        worksheet.getCell(currentRow, col).value = endingBankBalance;
        worksheet.getCell(currentRow, col).style = {
          font: { bold: true, size: 10 },
          numFmt: '#,##0.00;(#,##0.00);"—"',
          alignment: { horizontal: "right" as const },
        };
      } else {
        worksheet.getCell(currentRow, 2).value = endingBankBalance;
        worksheet.getCell(currentRow, 2).style = {
          font: { bold: true, size: 10 },
          numFmt: '#,##0.00;(#,##0.00);"—"',
          alignment: { horizontal: "right" as const },
        };
      }
      currentRow++;

      // Set column widths
      worksheet.getColumn(1).width = 50;
      worksheet.getColumn(2).width = 15;

      // Generate and download the file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentCompany?.name}-Cash Flow-${startDate}-to-${endDate}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    };
  }, [
    currentCompany,
    startDate,
    endDate,
    beginningBankBalance,
    endingBankBalance,
    isMonthlyView,
    isQuarterlyView,
    calculateBankBalanceForPeriod,
    calculateOperatingActivitiesForPeriod,
    calculateInvestingActivitiesForPeriod,
    calculateFinancingActivitiesForPeriod,
  ]);

  return { exportToXLSX };
};
