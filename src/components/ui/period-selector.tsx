"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PrimaryDisplayType, SecondaryDisplayType } from "@/app/reports/_types";
import { Separator } from "@/components/ui/separator";

export interface PeriodSelectorProps {
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  selectedPrimaryDisplay: PrimaryDisplayType;
  onPrimaryDisplayChange: (display: string) => void;
  selectedSecondaryDisplay: SecondaryDisplayType;
  onSecondaryDisplayChange: (display: string) => void;
  onCollapseAllCategories: () => void;
  onExpandAllCategories?: () => void;
  collapsedAccounts?: Set<string>;
  parentAccounts?: Array<{ id: string }>;
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

const PRIMARY_DISPLAY_OPTIONS = [
  { value: "byMonth", label: "By month" },
  { value: "byQuarter", label: "By quarter" },
  { value: "totalOnly", label: "Total only" },
];

const SECONDARY_DISPLAY_OPTIONS = [
  { value: "withoutPercentages", label: "Without %'s" },
  { value: "withPercentages", label: "With %'s" },
];

export function PeriodSelector({
  selectedPeriod,
  onPeriodChange,
  selectedPrimaryDisplay,
  onPrimaryDisplayChange,
  selectedSecondaryDisplay,
  onSecondaryDisplayChange,
  onCollapseAllCategories,
  onExpandAllCategories,
  collapsedAccounts,
  parentAccounts,
}: PeriodSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const getSelectedPeriodLabel = () => {
    const period = PERIOD_OPTIONS.find((p) => p.value === selectedPeriod);
    return period?.label.replace("", "") || "Select period...";
  };

  // Determine collapse/expand state
  const getCollapseExpandState = () => {
    if (!collapsedAccounts || !parentAccounts || parentAccounts.length === 0) {
      return "none"; // No parent accounts or no collapse data
    }

    const parentAccountIds = parentAccounts.map((acc) => acc.id);
    const collapsedParentIds = parentAccountIds.filter((id) => collapsedAccounts.has(id));

    if (collapsedParentIds.length === 0) {
      return "expanded"; // All parent accounts are expanded
    } else if (collapsedParentIds.length === parentAccountIds.length) {
      return "collapsed"; // All parent accounts are collapsed
    } else {
      return "mixed"; // Some collapsed, some expanded
    }
  };

  const collapseExpandState = getCollapseExpandState();

  const handleExpandAllCategories = () => {
    if (onExpandAllCategories) {
      onExpandAllCategories();
    }
  };

  return (
    <div className="flex items-center gap-4">
      {/* Period Selector Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-8 px-3 text-xs min-w-[200px] justify-between">
            {getSelectedPeriodLabel()}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="start">
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {/* Left Column - Period Options */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-1">Period</h3>
                <div className="space-y-1">
                  {PERIOD_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onPeriodChange(option.value)}
                      className="w-full flex items-center justify-between px-1 py-1.5 text-xs hover:bg-gray-50 rounded text-left"
                    >
                      <span
                        className={cn(
                          selectedPeriod === option.value ? "font-medium" : "font-normal",
                          "whitespace-nowrap"
                        )}
                      >
                        {option.label}
                      </span>
                      {selectedPeriod === option.value && <Check className="h-4 w-4 text-blue-600" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Column - Display Options */}
              <div className="space-y-6">
                {/* Primary Display Options */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Primary Display:</h3>
                  <div className="space-y-1">
                    {PRIMARY_DISPLAY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => onPrimaryDisplayChange(option.value)}
                        className="w-full flex items-center justify-between px-1 py-1.5 text-xs hover:bg-gray-50 rounded"
                      >
                        <span
                          className={cn(
                            selectedPrimaryDisplay === option.value ? "font-medium" : "font-normal",
                            "whitespace-nowrap"
                          )}
                        >
                          {option.label}
                        </span>
                        {selectedPrimaryDisplay === option.value && <Check className="h-4 w-4 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Secondary Display Options */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-1">Secondary Display:</h3>
                  <div className="space-y-1">
                    {SECONDARY_DISPLAY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => onSecondaryDisplayChange(option.value)}
                        className="w-full flex items-center justify-between px-1 py-1.5 text-xs hover:bg-gray-50 rounded"
                      >
                        <span
                          className={cn(
                            selectedSecondaryDisplay === option.value ? "font-medium" : "font-normal",
                            "whitespace-nowrap"
                          )}
                        >
                          {option.label}
                        </span>
                        {selectedSecondaryDisplay === option.value && <Check className="h-4 w-4 text-blue-600" />}
                      </button>
                    ))}
                    <Separator />
                    <button
                      onClick={onCollapseAllCategories}
                      className="w-full flex items-center justify-between px-1 py-1.5 text-xs hover:bg-gray-50 rounded"
                    >
                      <span className={cn("font-medium", "whitespace-nowrap")}>Collapsed</span>
                      {collapseExpandState === "collapsed" && <Check className="h-4 w-4 text-blue-600" />}
                    </button>
                    <button
                      onClick={handleExpandAllCategories}
                      className="w-full flex items-center justify-between px-1 py-1.5 text-xs hover:bg-gray-50 rounded"
                    >
                      <span className="font-medium">Expanded</span>
                      {collapseExpandState === "expanded" && <Check className="h-4 w-4 text-blue-600" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
