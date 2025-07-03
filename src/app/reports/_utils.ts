import { Account, Transaction, DateRange, DateRangeType } from "./_types";

// Date formatting helpers
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDateForDisplay = (dateString: string): string => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Date range helpers
export const getMonthRange = (date: Date): DateRange => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
};

export const getQuarterRange = (date: Date): DateRange => {
  const quarter = Math.floor(date.getMonth() / 3);
  const start = new Date(date.getFullYear(), quarter * 3, 1);
  const end = new Date(date.getFullYear(), (quarter + 1) * 3, 0);
  return { start, end };
};

export const getYearRange = (date: Date): DateRange => {
  const start = new Date(date.getFullYear(), 0, 1);
  const end = new Date(date.getFullYear(), 11, 31);
  return { start, end };
};

export const getPreviousPeriodRange = (start: Date, end: Date): DateRange => {
  const duration = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - duration);
  const previousEnd = new Date(start.getTime() - 1); // One day before current period starts

  // Ensure dates are set to start and end of day in local timezone
  previousStart.setHours(0, 0, 0, 0);
  previousEnd.setHours(23, 59, 59, 999);

  return { start: previousStart, end: previousEnd };
};

export const getDateRangeFromType = (range: DateRangeType): DateRange => {
  // Create a date object for the current date in local timezone
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset time to start of day

  let start: Date;
  let end: Date;

  switch (range) {
    case "currentMonth": {
      const range = getMonthRange(today);
      start = range.start;
      end = range.end;
      break;
    }
    case "currentQuarter": {
      const range = getQuarterRange(today);
      start = range.start;
      end = range.end;
      break;
    }
    case "previousMonth": {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const range = getMonthRange(lastMonth);
      start = range.start;
      end = range.end;
      break;
    }
    case "previousQuarter": {
      const lastQuarter = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      const range = getQuarterRange(lastQuarter);
      start = range.start;
      end = range.end;
      break;
    }
    case "previousYear": {
      const lastYear = new Date(today.getFullYear() - 1, 0, 1);
      const range = getYearRange(lastYear);
      start = range.start;
      end = range.end;
      break;
    }
    case "currentYear": {
      const range = getYearRange(today);
      start = range.start;
      end = range.end;
      break;
    }
    case "yearToLastMonth": {
      start = new Date(today.getFullYear(), 0, 1); // January 1st of current year
      const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of previous month
      end = lastMonth;
      break;
    }
    case "ytd": {
      start = new Date(today.getFullYear(), 0, 1); // January 1st of current year
      end = today; // Today
      break;
    }
  }

  // Ensure dates are set to start and end of day in local timezone
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

// Formatting helpers
export const formatNumber = (num: number): string => {
  if (Math.abs(num) < 0.01) return "—"; // Em dash for zero values
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatPercentage = (num: number, base: number): string => {
  if (base === 0) return "—";
  const percentage = (num / Math.abs(base)) * 100;
  return `${percentage.toFixed(1)}%`;
};

// Account helpers
export const getSubaccounts = (accounts: Account[], parentId: string): Account[] => {
  return accounts.filter((acc) => acc.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name));
};

export const getAllAccountIds = (accounts: Account[], account: Account): string[] => {
  const subaccounts = getSubaccounts(accounts, account.id);
  return [account.id, ...subaccounts.flatMap((sub) => getAllAccountIds(accounts, sub))];
};

export const getAllGroupAccountIds = (accounts: Account[], groupAccounts: Account[]): string[] => {
  return groupAccounts.flatMap((acc) => getAllAccountIds(accounts, acc));
};

// Helper: check if an account or its subaccounts have any transactions
export const hasTransactions = (account: Account, journalEntries: Transaction[], accounts: Account[]): boolean => {
  // Check if the account has any direct transactions at all
  const directTransactions = journalEntries.some((tx) => tx.chart_account_id === account.id);
  if (directTransactions) return true;

  // Check subaccounts recursively
  const subaccounts = getSubaccounts(accounts, account.id);
  return subaccounts.some((sub) => hasTransactions(sub, journalEntries, accounts));
};

// Month range helpers
export const getMonthsInRange = (startDate: string, endDate: string): string[] => {
  const months: string[] = [];

  // Parse dates as local dates to avoid timezone issues
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

  const start = new Date(startYear, startMonth - 1, startDay); // Month is 0-indexed
  const end = new Date(endYear, endMonth - 1, endDay);

  // Start from the first day of the start month
  let current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0"); // Convert back to 1-indexed
    months.push(`${year}-${month}`); // Format: YYYY-MM

    // Move to next month
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }
  return months;
};

export const formatMonth = (monthStr: string): string => {
  const [year, month] = monthStr.split("-");
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
};

// Transaction helpers
export const getTransactionDisplayAmount = (tx: Transaction, accountType: string): number => {
  if (accountType === "Revenue") {
    // For revenue: credits are positive, debits are negative
    return Number(tx.credit) - Number(tx.debit);
  } else if (accountType === "Expense" || accountType === "COGS") {
    // For expenses/COGS: debits are positive, credits are negative
    return Number(tx.debit) - Number(tx.credit);
  } else if (accountType === "Asset") {
    // For assets: debits increase, credits decrease
    return Number(tx.debit) - Number(tx.credit);
  } else if (accountType === "Liability" || accountType === "Equity") {
    // For liabilities and equity: credits increase, debits decrease
    return Number(tx.credit) - Number(tx.debit);
  }
  return Number(tx.debit); // fallback
};
