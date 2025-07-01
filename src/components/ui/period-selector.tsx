"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PeriodSelectorProps {
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  selectedDisplay: string;
  onDisplayChange: (display: string) => void;
  // selectedComparison: string
  // onComparisonChange: (comparison: string) => void
}

const PERIOD_OPTIONS = [
  { value: "lastMonth", label: "Last month" },
  { value: "thisMonth", label: "This month" },
  { value: "last4Months", label: "Last 4 months" },
  { value: "last12Months", label: "Last 12 months" },
  { value: "thisQuarter", label: "This quarter" },
  { value: "lastQuarter", label: "Last quarter" },
  { value: "thisYearToLastMonth", label: "This year to last month" },
  { value: "thisYearToToday", label: "This year to today" },
];

const DISPLAY_OPTIONS = [
  { value: "byMonth", label: "By month" },
  { value: "totalOnly", label: "Total only" },
  { value: "withPercentages", label: "With %'s" },
];

// const COMPARISON_OPTIONS = [
//   { value: "previousPeriod", label: "Previous period" },
//   { value: "previousYear", label: "Previous year" },
//   { value: "none", label: "None" }
// ]

export function PeriodSelector({
  selectedPeriod,
  onPeriodChange,
  selectedDisplay,
  onDisplayChange,
}: // selectedComparison,
// onComparisonChange
PeriodSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const getSelectedPeriodLabel = () => {
    const period = PERIOD_OPTIONS.find((p) => p.value === selectedPeriod);
    return period?.label.replace("", "") || "Select period...";
  };

  return (
    <div className="flex items-center gap-4">
      {/* Period Selector Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 px-3 text-sm min-w-[200px] justify-between">
            {getSelectedPeriodLabel()}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Left Column - Period Options */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Period</h3>
                <div className="space-y-1">
                  {PERIOD_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onPeriodChange(option.value)}
                      className="w-full flex items-center justify-between px-1 py-1.5 text-xs hover:bg-gray-50 rounded text-left"
                    >
                      <span className={cn(selectedPeriod === option.value ? "font-medium" : "font-normal", "whitespace-nowrap")}>
                        {option.label}
                      </span>
                      {selectedPeriod === option.value && <Check className="h-4 w-4 text-blue-600" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Column - Display and Comparison Options */}
              <div className="space-y-6">
                {/* Display Options */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Display:</h3>
                  <div className="space-y-1">
                    {DISPLAY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => onDisplayChange(option.value)}
                        className="w-full flex items-center justify-between px-1 py-1.5 text-xs hover:bg-gray-50 rounded"
                      >
                        <span
                          className={cn(
                            selectedDisplay === option.value ? "font-medium" : "font-normal",
                            "whitespace-nowrap"
                          )}
                        >
                          {option.label}
                        </span>
                        {selectedDisplay === option.value && <Check className="h-4 w-4 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comparison Options */}
                {/* <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Compare with:</h3>
                  <div className="space-y-1">
                    {COMPARISON_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => onComparisonChange(option.value)}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-sm hover:bg-gray-50 rounded"
                      >
                        <span className={cn(
                          selectedComparison === option.value ? "font-medium" : "font-normal"
                        )}>
                          {option.label}
                        </span>
                        {selectedComparison === option.value && (
                          <Check className="h-4 w-4 text-blue-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </div> */}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
