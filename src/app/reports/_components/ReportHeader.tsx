"use client";

import React from "react";
import { Download, Loader2, Save } from "lucide-react";
import { PeriodSelector } from "@/components/ui/period-selector";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { PrimaryDisplayType, SecondaryDisplayType } from "../_types";

export interface ReportHeaderProps {
  title?: string;
  startDate: string;
  endDate: string;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  selectedPeriod: string;
  selectedPrimaryDisplay: PrimaryDisplayType;
  selectedSecondaryDisplay: SecondaryDisplayType;
  handlePeriodChange?: (period: string) => void;
  onPeriodChange?: (period: string) => void;
  handlePrimaryDisplayChange?: (display: string) => void;
  onPrimaryDisplayChange?: (display: string) => void;
  handleSecondaryDisplayChange?: (display: string) => void;
  onSecondaryDisplayChange?: (display: string) => void;
  onCollapseAllCategories: () => void;
  onExpandAllCategories?: () => void;
  collapsedAccounts?: Set<string>;
  parentAccounts?: Array<{ id: string }>;
  exportToXLSX?: () => void;
  onSaveReport?: () => void;
  loading?: boolean;
  isBalanceSheet?: boolean;
}

export function ReportHeader({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  selectedPeriod,
  selectedPrimaryDisplay,
  selectedSecondaryDisplay,
  handlePeriodChange,
  onPeriodChange,
  handlePrimaryDisplayChange,
  onPrimaryDisplayChange,
  handleSecondaryDisplayChange,
  onSecondaryDisplayChange,
  onCollapseAllCategories,
  onExpandAllCategories,
  collapsedAccounts,
  parentAccounts,
  exportToXLSX,
  onSaveReport,
  loading,
  isBalanceSheet,
}: ReportHeaderProps) {
  // Calculate today's date once
  const today = React.useMemo(() => new Date().toISOString().split("T")[0], []);

  // Use either the handle* or on* prop versions
  const periodChangeHandler = onPeriodChange || handlePeriodChange;
  const primaryDisplayChangeHandler = onPrimaryDisplayChange || handlePrimaryDisplayChange;
  const secondaryDisplayChangeHandler = onSecondaryDisplayChange || handleSecondaryDisplayChange;

  return (
    <div className="flex flex-col space-y-4 mb-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <PeriodSelector
            selectedPeriod={selectedPeriod}
            onPeriodChange={periodChangeHandler!}
            selectedPrimaryDisplay={selectedPrimaryDisplay}
            onPrimaryDisplayChange={primaryDisplayChangeHandler!}
            selectedSecondaryDisplay={selectedSecondaryDisplay}
            onSecondaryDisplayChange={secondaryDisplayChangeHandler!}
            onCollapseAllCategories={onCollapseAllCategories}
            onExpandAllCategories={onExpandAllCategories}
            collapsedAccounts={collapsedAccounts}
            parentAccounts={parentAccounts}
          />

          {/* Manual date override option */}
          <div className="flex items-center justify-center gap-4 text-xs">
            {isBalanceSheet ? (
              <>
                <span className="text-slate-600">As of</span>
                <DatePicker
                  value={endDate}
                  max={new Date(today)}
                  onChange={(date) => {
                    if (date) {
                      const formattedDate = format(date, "yyyy-MM-dd");
                      setEndDate(formattedDate);
                    }
                  }}
                  className="text-xs h-8 transition-none w-32"
                />
              </>
            ) : (
              <>
                <DatePicker
                  value={startDate}
                  max={new Date(endDate || today)}
                  onChange={(date) => {
                    if (date) {
                      const formattedDate = format(date, "yyyy-MM-dd");
                      setStartDate(formattedDate);
                      // If start date is after end date, update end date
                      if (endDate && formattedDate > endDate) {
                        setEndDate(formattedDate);
                      }
                    }
                  }}
                  className="text-xs h-8 transition-none w-32"
                />
                <span className="text-slate-600">to</span>
                <DatePicker
                  value={endDate}
                  max={new Date(today)}
                  onChange={(date) => {
                    if (date) {
                      const formattedDate = format(date, "yyyy-MM-dd");
                      setEndDate(formattedDate);
                    }
                  }}
                  className="text-xs h-8 transition-none w-32"
                />
              </>
            )}
          </div>
        </div>

        <div className="flex justify-center gap-2">
          {onSaveReport && (
            <button
              onClick={onSaveReport}
              title="Save Report"
              className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
            >
              <Save className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={exportToXLSX}
            disabled={loading}
            title="Export to XLSX"
            className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
