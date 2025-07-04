"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
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
  exportToXLSX?: () => void;
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
  exportToXLSX,
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
    <div className="flex flex-col space-y-4 mb-6">
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

        <div className="flex justify-center">
          <Button variant="outline" onClick={exportToXLSX} disabled={loading} className="text-xs font-medium">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
