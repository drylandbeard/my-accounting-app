import { Transaction, DateRange, DateRangeType, Category } from "./_types";
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subQuarters, subYears, format, startOfDay, endOfDay, parseISO, isValid } from "date-fns";

// Date formatting helpers
export const formatDate = (date: Date): string => {
  return format(date, "yyyy-MM-dd");
};

export const formatDateForDisplay = (dateString: string): string => {
  if (!dateString) return "";
  
  // Handle different date string formats
  let date: Date;
  
  if (dateString.includes("T")) {
    // ISO string with time
    date = parseISO(dateString);
  } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // YYYY-MM-DD format
    date = parseISO(dateString);
  } else {
    // Fallback to manual parsing for YYYY-MM-DD format
    const [year, month, day] = dateString.split("-").map(Number);
    if (year && month && day) {
      date = new Date(year, month - 1, day);
    } else {
      return dateString; // Return original if parsing fails
    }
  }
  
  // Check if date is valid
  if (!isValid(date)) {
    return dateString; // Return original if invalid
  }
  
  return format(date, "MMM d, yyyy");
};

// Date range helpers
export const getMonthRange = (date: Date): DateRange => {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  return { start, end };
};

export const getQuarterRange = (date: Date): DateRange => {
  const start = startOfQuarter(date);
  const end = endOfQuarter(date);
  return { start, end };
};

export const getYearRange = (date: Date): DateRange => {
  const start = startOfYear(date);
  const end = endOfYear(date);
  return { start, end };
};

export const getPreviousPeriodRange = (start: Date, end: Date): DateRange => {
  const duration = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - duration);
  const previousEnd = new Date(start.getTime() - 1); // One day before current period starts

  // Ensure dates are set to start and end of day in local timezone
  const startOfPreviousStart = startOfDay(previousStart);
  const endOfPreviousEnd = endOfDay(previousEnd);

  return { start: startOfPreviousStart, end: endOfPreviousEnd };
};

export const getDateRangeFromType = (range: DateRangeType): DateRange => {
  // Create a date object for the current date in local timezone
  const today = startOfDay(new Date());

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
      const lastMonth = subMonths(today, 1);
      const range = getMonthRange(lastMonth);
      start = range.start;
      end = range.end;
      break;
    }
    case "previousQuarter": {
      const lastQuarter = subQuarters(today, 1);
      const range = getQuarterRange(lastQuarter);
      start = range.start;
      end = range.end;
      break;
    }
    case "previousYear": {
      const lastYear = subYears(today, 1);
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
      start = startOfYear(today);
      const lastMonth = subMonths(today, 1);
      end = endOfMonth(lastMonth);
      break;
    }
    case "ytd": {
      start = startOfYear(today);
      end = today;
      break;
    }
  }

  // Ensure dates are set to start and end of day in local timezone
  start = startOfDay(start);
  end = endOfDay(end);

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
  if (percentage === 0) return "—";
  return `${percentage.toFixed(1)}%`;
};

// Account helpers
export const getSubaccounts = (accounts: Category[], parentId: string): Category[] => {
  return accounts.filter((acc) => acc.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name));
};

export const getAllAccountIds = (accounts: Category[], account: Category): string[] => {
  const subaccounts = getSubaccounts(accounts, account.id);
  return [account.id, ...subaccounts.flatMap((sub) => getAllAccountIds(accounts, sub))];
};

export const getAllGroupAccountIds = (accounts: Category[], groupAccounts: Category[]): string[] => {
  return groupAccounts.flatMap((acc) => getAllAccountIds(accounts, acc));
};

// Helper: check if an account or its subaccounts have any transactions
export const hasTransactions = (account: Category, journalEntries: Transaction[], accounts: Category[]): boolean => {
  // Check if the account has any direct transactions at all
  const directTransactions = journalEntries.some((tx) => tx.chart_account_id === account.id);
  if (directTransactions) return true;

  // Check subaccounts recursively
  const subaccounts = getSubaccounts(accounts, account.id);
  return subaccounts.some((sub) => hasTransactions(sub, journalEntries, accounts));
};

// Quarter range helpers
export const getQuartersInRange = (startDate: string, endDate: string): string[] => {
  const quarters: string[] = [];

  // Parse dates using date-fns to avoid timezone issues
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  // Start from the first quarter that contains the start date
  let currentYear = start.getFullYear();
  let currentQuarter = Math.floor(start.getMonth() / 3) + 1; // 1-indexed quarter

  while (true) {
    const quarterStart = startOfQuarter(new Date(currentYear, (currentQuarter - 1) * 3, 1));
    const quarterEnd = endOfQuarter(new Date(currentYear, (currentQuarter - 1) * 3, 1));

    // If the quarter start is after the end date, we're done
    if (quarterStart > end) break;

    // If the quarter overlaps with our date range, include it
    if (quarterEnd >= start) {
      quarters.push(`${currentYear}-Q${currentQuarter}`);
    }

    // Move to next quarter
    currentQuarter++;
    if (currentQuarter > 4) {
      currentQuarter = 1;
      currentYear++;
    }
  }

  return quarters;
};

export const formatQuarter = (quarterStr: string): string => {
  const [year, quarter] = quarterStr.split("-");
  return `${quarter} ${year}`;
};

// Month range helpers
export const getMonthsInRange = (startDate: string, endDate: string): string[] => {
  const months: string[] = [];

  // Parse dates using date-fns to avoid timezone issues
  const start = parseISO(startDate);
  const end = parseISO(endDate);

  // Start from the first day of the start month
  let current = startOfMonth(start);

  while (current <= end) {
    months.push(format(current, "yyyy-MM")); // Format: YYYY-MM

    // Move to next month
    current = startOfMonth(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }
  return months;
};

export const formatMonth = (monthStr: string): string => {
  const [year, month] = monthStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return format(date, "MMM yyyy");
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
