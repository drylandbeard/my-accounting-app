import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.config({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9e15,
  toExpPos: 9e15,
  modulo: Decimal.ROUND_HALF_UP,
});

/**
 * Type for financial amounts represented as strings to avoid floating-point errors
 */
export type FinancialAmount = string;

/**
 * Parse a financial amount from various input types to a Decimal
 */
export function parseAmount(amount: number | string | null | undefined) {
  if (amount === null || amount === undefined || amount === '') {
    return new Decimal(0);
  }
  
  if (typeof amount === 'string') {
    // Remove any formatting characters like commas, but preserve decimal points and negative signs
    const cleaned = amount.replace(/[^\d.-]/g, '');
    return new Decimal(cleaned || '0');
  }
  
  return new Decimal(amount);
}

/**
 * Convert a number or string to a FinancialAmount string
 */
export function toFinancialAmount(amount: number | string | null | undefined): FinancialAmount {
  return parseAmount(amount).toFixed(2);
}

/**
 * Format a financial amount for display with proper currency formatting
 */
export function formatAmount(amount: number | string | null | undefined, options?: {
  showCurrency?: boolean;
  currencySymbol?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}): string {
  const {
    showCurrency = true,
    currencySymbol = '$',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options || {};

  const decimal = parseAmount(amount);
  const formatted = decimal.toFixed(maximumFractionDigits);
  
  // Parse to number for toLocaleString formatting
  const num = parseFloat(formatted);
  
  const localeFormatted = num.toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  });

  return showCurrency ? `${currencySymbol}${localeFormatted}` : localeFormatted;
}

/**
 * Add two financial amounts
 */
export function addAmounts(a: number | string | null | undefined, b: number | string | null | undefined): FinancialAmount {
  const decimalA = parseAmount(a);
  const decimalB = parseAmount(b);
  return decimalA.plus(decimalB).toFixed(2);
}

/**
 * Subtract two financial amounts (a - b)
 */
export function subtractAmounts(a: number | string | null | undefined, b: number | string | null | undefined): FinancialAmount {
  const decimalA = parseAmount(a);
  const decimalB = parseAmount(b);
  return decimalA.minus(decimalB).toFixed(2);
}

/**
 * Multiply a financial amount by a number
 */
export function multiplyAmount(amount: number | string | null | undefined, multiplier: number | string): FinancialAmount {
  const decimalAmount = parseAmount(amount);
  const decimalMultiplier = new Decimal(multiplier);
  return decimalAmount.times(decimalMultiplier).toFixed(2);
}

/**
 * Divide a financial amount by a number
 */
export function divideAmount(amount: number | string | null | undefined, divisor: number | string): FinancialAmount {
  const decimalAmount = parseAmount(amount);
  const decimalDivisor = new Decimal(divisor);
  return decimalAmount.dividedBy(decimalDivisor).toFixed(2);
}

/**
 * Compare two financial amounts
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareAmounts(a: number | string | null | undefined, b: number | string | null | undefined): number {
  const decimalA = parseAmount(a);
  const decimalB = parseAmount(b);
  return decimalA.comparedTo(decimalB);
}

/**
 * Check if an amount is zero
 */
export function isZeroAmount(amount: number | string | null | undefined): boolean {
  return parseAmount(amount).equals(0);
}

/**
 * Check if an amount is positive
 */
export function isPositiveAmount(amount: number | string | null | undefined): boolean {
  return parseAmount(amount).greaterThan(0);
}

/**
 * Check if an amount is negative
 */
export function isNegativeAmount(amount: number | string | null | undefined): boolean {
  return parseAmount(amount).lessThan(0);
}

/**
 * Get the absolute value of an amount
 */
export function absoluteAmount(amount: number | string | null | undefined): FinancialAmount {
  return parseAmount(amount).abs().toFixed(2);
}

/**
 * Negate an amount (multiply by -1)
 */
export function negateAmount(amount: number | string | null | undefined): FinancialAmount {
  return parseAmount(amount).negated().toFixed(2);
}

/**
 * Sum an array of financial amounts
 */
export function sumAmounts(amounts: (number | string | null | undefined)[]): FinancialAmount {
  let sum = new Decimal(0);
  for (const amount of amounts) {
    sum = sum.plus(parseAmount(amount));
  }
  return sum.toFixed(2);
}

/**
 * Parse a user input string to a valid financial amount
 * Handles common user input patterns like "1,000.50", "$100", etc.
 */
export function parseUserInput(input: string): FinancialAmount {
  if (!input || input.trim() === '') {
    return '0.00';
  }
  
  // Remove currency symbols and whitespace
  let cleaned = input.replace(/[$,\s]/g, '');
  
  // Handle negative signs
  const isNegative = cleaned.includes('-');
  cleaned = cleaned.replace(/[-]/g, '');
  
  // Validate that we only have digits and at most one decimal point
  if (!/^\d*\.?\d*$/.test(cleaned)) {
    return '0.00';
  }
  
  let amount = new Decimal(cleaned || '0');
  if (isNegative) {
    amount = amount.negated();
  }
  
  return amount.toFixed(2);
}

/**
 * Validate that a string represents a valid financial amount
 */
export function isValidAmount(input: string): boolean {
  try {
    const parsed = parseUserInput(input);
    return !isNaN(parseFloat(parsed));
  } catch {
    return false;
  }
}

/**
 * Convert between spent/received format and net amount
 */
export function calculateNetAmount(spent: number | string | null | undefined, received: number | string | null | undefined): FinancialAmount {
  const spentDecimal = parseAmount(spent);
  const receivedDecimal = parseAmount(received);
  return receivedDecimal.minus(spentDecimal).toFixed(2);
}

/**
 * Convert net amount to spent/received format
 * Positive amounts become "received", negative amounts become "spent"
 */
export function netToSpentReceived(netAmount: number | string | null | undefined): { spent: FinancialAmount; received: FinancialAmount } {
  const decimal = parseAmount(netAmount);
  
  if (decimal.isNegative()) {
    return {
      spent: decimal.abs().toFixed(2),
      received: '0.00'
    };
  } else {
    return {
      spent: '0.00',
      received: decimal.toFixed(2)
    };
  }
}

/**
 * Format amount for CSV export (no currency symbol, proper decimal formatting)
 */
export function formatAmountForExport(amount: number | string | null | undefined): string {
  return parseAmount(amount).toFixed(2);
}

/**
 * Format amount for API/database (ensure consistent string format)
 */
export function formatAmountForStorage(amount: number | string | null | undefined): FinancialAmount {
  return parseAmount(amount).toFixed(4); // Use 4 decimal places for storage precision
} 