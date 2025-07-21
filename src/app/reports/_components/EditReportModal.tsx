"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SavedReport {
  id: string;
  name: string;
  type: "balance-sheet" | "pnl" | "cash-flow";
  description: string;
  parameters: {
    startDate: string;
    endDate: string;
    primaryDisplay: string;
    secondaryDisplay: string;
    period?: string;
  };
  createdAt: string;
  companyId: string;
}

interface EditReportModalProps {
  report: SavedReport | null;
  isOpen: boolean;
  onClose: () => void;
  onReportUpdated: (updatedReport: SavedReport) => void;
}

const PRIMARY_DISPLAY_OPTIONS = [
  { value: "byMonth", label: "By month" },
  { value: "byQuarter", label: "By quarter" },
  { value: "totalOnly", label: "Total only" },
];

const SECONDARY_DISPLAY_OPTIONS = [
  { value: "withoutPercentages", label: "Without %'s" },
  { value: "withPercentages", label: "With %'s" },
];

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

export const EditReportModal: React.FC<EditReportModalProps> = ({ report, isOpen, onClose, onReportUpdated }) => {
  const [reportName, setReportName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [primaryDisplay, setPrimaryDisplay] = useState("");
  const [secondaryDisplay, setSecondaryDisplay] = useState("");
  const [period, setPeriod] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Initialize form with report data
  useEffect(() => {
    if (report && isOpen) {
      setReportName(report.name);
      setStartDate(report.parameters.startDate);
      setEndDate(report.parameters.endDate);
      setPrimaryDisplay(report.parameters.primaryDisplay);
      setSecondaryDisplay(report.parameters.secondaryDisplay);
      setPeriod(report.parameters.period || "thisMonth");
      setError("");
    }
  }, [report, isOpen]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setReportName("");
      setStartDate("");
      setEndDate("");
      setPrimaryDisplay("");
      setSecondaryDisplay("");
      setPeriod("");
      setError("");
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!report) return;

    if (!reportName.trim()) {
      setError("Report name is required");
      return;
    }

    if (!startDate || !endDate) {
      setError("Start date and end date are required");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date must be before end date");
      return;
    }

    if (!primaryDisplay || (report.type !== "cash-flow" && !secondaryDisplay)) {
      setError("Display options are required");
      return;
    }

    if (!period) {
      setError("Period is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Generate description based on report type
      const description =
        report.type === "balance-sheet"
          ? `Balance Sheet as of ${new Date(endDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`
          : report.type === "pnl"
          ? `Profit & Loss from ${new Date(startDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })} to ${new Date(endDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`
          : `Cash Flow from ${new Date(startDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })} to ${new Date(endDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}`;

      const response = await api.put(`/api/reports/saved/${report.id}`, {
        name: reportName.trim(),
        description,
        parameters: {
          startDate,
          endDate,
          primaryDisplay,
          secondaryDisplay: report.type === "cash-flow" ? "withoutPercentages" : secondaryDisplay,
          period,
        },
      });

      if (response.ok) {
        const updatedReport = await response.json();
        onReportUpdated(updatedReport);
        onClose();
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to update report");
      }
    } catch (error) {
      console.error("Error updating report:", error);
      setError("Failed to update report");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter" && e.metaKey) {
      handleSave();
    }
  };

  if (!isOpen || !report) return null;

  const getReportTypeLabel = (type: string) => {
    switch (type) {
      case "balance-sheet":
        return "Balance Sheet";
      case "pnl":
        return "P&L";
      case "cash-flow":
        return "Cash Flow";
      default:
        return "Report";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {getReportTypeLabel(report.type)} Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Report Name */}
          <div className="space-y-2">
            <Label htmlFor="reportName">Report Name</Label>
            <Input
              id="reportName"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="Enter report name"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">{report.type === "balance-sheet" ? "Start Date" : "Start Date"}</Label>
              <DatePicker
                id="startDate"
                value={startDate}
                onChange={(date) => setStartDate(date?.toISOString() || "")}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">{report.type === "balance-sheet" ? "As of Date" : "End Date"}</Label>
              <DatePicker
                id="endDate"
                value={endDate}
                onChange={(date) => setEndDate(date?.toISOString() || "")}
                className="w-full"
              />
            </div>
          </div>

          {/* Period Selection */}
          <div className="space-y-2">
            <Label htmlFor="period">Period</Label>
            <Select
              options={PERIOD_OPTIONS}
              value={PERIOD_OPTIONS.find((option) => option.value === period) || null}
              onChange={(selectedOption) => {
                const option = selectedOption as { value: string; label: string } | null;
                setPeriod(option?.value || "");
              }}
              placeholder="Select period"
              isSearchable={false}
              className="w-full"
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: "36px",
                  height: "36px",
                  fontSize: "14px",
                  borderColor: "#d1d5db",
                  borderRadius: "6px",
                  "&:hover": {
                    borderColor: "#9ca3af",
                  },
                }),
                valueContainer: (base) => ({
                  ...base,
                  padding: "0 12px",
                }),
                input: (base) => ({
                  ...base,
                  margin: "0",
                  padding: "0",
                }),
                indicatorsContainer: (base) => ({
                  ...base,
                  height: "36px",
                }),
                dropdownIndicator: (base) => ({
                  ...base,
                  padding: "0 8px",
                }),
              }}
            />
          </div>

          <div className={`grid gap-4 ${report.type === "cash-flow" ? "grid-cols-1" : "grid-cols-2"}`}>
            {/* Primary Display */}
            <div className="space-y-2">
              <Label htmlFor="primaryDisplay">Primary Display</Label>
              <Select
                options={PRIMARY_DISPLAY_OPTIONS}
                value={PRIMARY_DISPLAY_OPTIONS.find((option) => option.value === primaryDisplay) || null}
                onChange={(selectedOption) => {
                  const option = selectedOption as { value: string; label: string } | null;
                  setPrimaryDisplay(option?.value || "");
                }}
                placeholder="Select primary display"
                isSearchable={false}
                className="w-full"
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: "36px",
                    height: "36px",
                    fontSize: "14px",
                    borderColor: "#d1d5db",
                    borderRadius: "6px",
                    "&:hover": {
                      borderColor: "#9ca3af",
                    },
                  }),
                  valueContainer: (base) => ({
                    ...base,
                    padding: "0 12px",
                  }),
                  input: (base) => ({
                    ...base,
                    margin: "0",
                    padding: "0",
                  }),
                  indicatorsContainer: (base) => ({
                    ...base,
                    height: "36px",
                  }),
                  dropdownIndicator: (base) => ({
                    ...base,
                    padding: "0 8px",
                  }),
                }}
              />
            </div>

            {/* Secondary Display - Hidden for Cash Flow reports */}
            {report.type !== "cash-flow" && (
              <div className="space-y-2">
                <Label htmlFor="secondaryDisplay">Secondary Display</Label>
                <Select
                  options={SECONDARY_DISPLAY_OPTIONS}
                  value={SECONDARY_DISPLAY_OPTIONS.find((option) => option.value === secondaryDisplay) || null}
                  onChange={(selectedOption) => {
                    const option = selectedOption as { value: string; label: string } | null;
                    setSecondaryDisplay(option?.value || "");
                  }}
                  placeholder="Select secondary display"
                  isSearchable={false}
                  className="w-full"
                  styles={{
                    control: (base) => ({
                      ...base,
                      minHeight: "36px",
                      height: "36px",
                      fontSize: "14px",
                      borderColor: "#d1d5db",
                      borderRadius: "6px",
                      "&:hover": {
                        borderColor: "#9ca3af",
                      },
                    }),
                    valueContainer: (base) => ({
                      ...base,
                      padding: "0 12px",
                    }),
                    input: (base) => ({
                      ...base,
                      margin: "0",
                      padding: "0",
                    }),
                    indicatorsContainer: (base) => ({
                      ...base,
                      height: "36px",
                    }),
                    dropdownIndicator: (base) => ({
                      ...base,
                      padding: "0 8px",
                    }),
                  }}
                />
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">{error}</div>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>Update</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
