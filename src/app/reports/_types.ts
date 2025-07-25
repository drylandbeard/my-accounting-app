import { FinancialAmount } from "@/lib/financial";

export type Category = {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  parent_id?: string | null;
  _viewerType?: string;
};

export type Account = {
  plaid_account_id: string | null;
  name: string;
  starting_balance: FinancialAmount | null;
  current_balance: FinancialAmount | null;
  last_synced: string | null;
  is_manual?: boolean;
  plaid_account_name?: string;
  institution_name?: string;
  type?: string;
  created_at?: string;
  subtype?: string;
  display_order?: number;
  plaid_item_id?: string;
};

export type Transaction = {
  id: string;
  date: string;
  description: string;
  chart_account_id: string;
  debit: number;
  credit: number;
  transaction_id: string;
  source: "journal" | "manual";
  payee_id?: string;
  plaid_account_id?: string | null;
  plaid_account_name?: string | null;
};

export type ViewerModalState = {
  isOpen: boolean;
  category: Category | null;
  selectedMonth?: string;
};

export type DateRange = {
  start: Date;
  end: Date;
};

export type PeriodType =
  | "thisMonth"
  | "lastMonth"
  | "last4Months"
  | "last12Months"
  | "thisQuarter"
  | "lastQuarter"
  | "thisYearToLastMonth"
  | "thisYearToToday";

export type PrimaryDisplayType = "byMonth" | "byQuarter" | "totalOnly";
export type SecondaryDisplayType = "withPercentages" | "withoutPercentages";
export type CategoryCollapseType = "expanded" | "collapsed";

// New type for the collapse button action
export type CollapseActionType = "collapse" | "none";

export type DateRangeType =
  | "currentMonth"
  | "currentQuarter"
  | "previousMonth"
  | "previousQuarter"
  | "previousYear"
  | "currentYear"
  | "yearToLastMonth"
  | "ytd";
