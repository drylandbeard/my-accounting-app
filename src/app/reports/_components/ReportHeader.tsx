"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { PeriodSelector } from "@/components/ui/period-selector";
import { DatePicker } from "@/components/ui/date-picker";
import { format } from "date-fns";
import { PeriodType, DisplayType } from "../_types";

interface ReportHeaderProps {
  startDate: string;
  endDate: string;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  selectedPeriod: string;
  selectedDisplay: string;
  handlePeriodChange: (period: string) => void;
  handleDisplayChange: (display: string) => void;
  exportToXLSX: () => Promise<void>;
  loading: boolean;
}

export const ReportHeader: React.FC<ReportHeaderProps> = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  selectedPeriod,
  selectedDisplay,
  handlePeriodChange,
  handleDisplayChange,
  exportToXLSX,
  loading,
}) => {
  // Calculate today's date once
  const today = React.useMemo(() => new Date().toISOString().split("T")[0], []);

  return (
    <div className="text-center mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex justify-center">
            <PeriodSelector
              selectedPeriod={selectedPeriod as PeriodType}
              onPeriodChange={handlePeriodChange}
              selectedDisplay={selectedDisplay as DisplayType}
              onDisplayChange={handleDisplayChange}
            />
          </div>

          {/* Manual date override option */}
          <div className="flex items-center justify-center gap-4 text-xs">
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
};
