export type Account = {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  parent_id?: string | null;
  _viewerType?: string;
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
};

export type ViewerModalState = {
  isOpen: boolean;
  category: Account | null;
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
