"use client";

import { useState, useEffect } from "react";
import { PeriodType, DateRangeType } from "../_types";
import { formatDate, getDateRangeFromType } from "../_utils";

interface UsePeriodSelectionReturn {
  selectedPeriod: PeriodType;
  selectedDisplay: string;
  startDate: string;
  endDate: string;
  showPercentages: boolean;
  isMonthlyView: boolean;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  handlePeriodChange: (period: string) => void;
  handleDisplayChange: (display: string) => void;
  handleDateRangeSelect: (range: DateRangeType) => void;
}

export const usePeriodSelection = (): UsePeriodSelectionReturn => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("thisYearToLastMonth");
  const [selectedDisplay, setSelectedDisplay] = useState("byMonth");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isMonthlyView, setIsMonthlyView] = useState(true);
  const [showPercentages, setShowPercentages] = useState(false);

  // Handle period selector changes
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period as PeriodType);

    switch (period) {
      case "thisMonth":
        handleDateRangeSelect("currentMonth");
        break;
      case "lastMonth":
        handleDateRangeSelect("previousMonth");
        break;
      case "last4Months":
        // Last 4 months
        const today = new Date();
        const fourMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 4, 1);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        setStartDate(formatDate(fourMonthsAgo));
        setEndDate(formatDate(endOfLastMonth));
        break;
      case "last12Months":
        // Last 12 months
        const todayFor12 = new Date();
        const twelveMonthsAgo = new Date(todayFor12.getFullYear(), todayFor12.getMonth() - 12, 1);
        const endOfCurrentMonth = new Date(todayFor12.getFullYear(), todayFor12.getMonth() + 1, 0);
        setStartDate(formatDate(twelveMonthsAgo));
        setEndDate(formatDate(endOfCurrentMonth));
        break;
      case "thisQuarter":
        handleDateRangeSelect("currentQuarter");
        break;
      case "lastQuarter":
        handleDateRangeSelect("previousQuarter");
        break;
      case "thisYearToLastMonth":
        handleDateRangeSelect("yearToLastMonth");
        break;
      case "thisYearToToday":
        handleDateRangeSelect("ytd");
        break;
      default:
        handleDateRangeSelect("yearToLastMonth");
    }
  };

  const handleDisplayChange = (display: string) => {
    setSelectedDisplay(display);
    // Map display options to existing view state
    setIsMonthlyView(display === "byMonth");
    setShowPercentages(display === "withPercentages");
  };

  const handleDateRangeSelect = (range: DateRangeType) => {
    const { start, end } = getDateRangeFromType(range);
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };

  useEffect(() => {
    // Initialize with the default period setting
    handlePeriodChange("thisYearToLastMonth");
  }, []); // Empty dependency array so it only runs once on mount

  return {
    selectedPeriod,
    selectedDisplay,
    startDate,
    endDate,
    showPercentages,
    isMonthlyView,
    setStartDate,
    setEndDate,
    handlePeriodChange,
    handleDisplayChange,
    handleDateRangeSelect,
  };
};
