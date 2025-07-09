"use client";

import { useState, useEffect, useCallback } from "react";
import { PeriodType, DateRangeType, PrimaryDisplayType, SecondaryDisplayType } from "../_types";
import { formatDate, getDateRangeFromType } from "../_utils";
import { startOfMonth, endOfMonth, subMonths, startOfDay } from "date-fns";

interface UsePeriodSelectionReturn {
  selectedPeriod: PeriodType;
  selectedPrimaryDisplay: PrimaryDisplayType;
  selectedSecondaryDisplay: SecondaryDisplayType;
  startDate: string;
  endDate: string;
  showPercentages: boolean;
  isMonthlyView: boolean;
  isQuarterlyView: boolean;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  handlePeriodChange: (period: string) => void;
  handlePrimaryDisplayChange: (display: string) => void;
  handleSecondaryDisplayChange: (display: string) => void;
  handleDateRangeSelect: (range: DateRangeType) => void;
}

export const usePeriodSelection = (): UsePeriodSelectionReturn => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("thisYearToLastMonth");
  const [selectedPrimaryDisplay, setSelectedPrimaryDisplay] = useState<PrimaryDisplayType>("byMonth");
  const [selectedSecondaryDisplay, setSelectedSecondaryDisplay] = useState<SecondaryDisplayType>("withoutPercentages");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [isMonthlyView, setIsMonthlyView] = useState(true);
  const [isQuarterlyView, setIsQuarterlyView] = useState(false);
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
        const today = startOfDay(new Date());
        const fourMonthsAgo = startOfMonth(subMonths(today, 4));
        const endOfLastMonth = endOfMonth(subMonths(today, 1));
        setStartDate(formatDate(fourMonthsAgo));
        setEndDate(formatDate(endOfLastMonth));
        break;
      case "last12Months":
        // Last 12 months
        const todayFor12 = startOfDay(new Date());
        const twelveMonthsAgo = startOfMonth(subMonths(todayFor12, 12));
        const endOfCurrentMonth = endOfMonth(todayFor12);
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

  const handlePrimaryDisplayChange = useCallback((display: string) => {
    setSelectedPrimaryDisplay(display as PrimaryDisplayType);
    // Set monthly view based on primary display
    setIsMonthlyView(display === "byMonth");
    setIsQuarterlyView(display === "byQuarter");
  }, []);

  const handleSecondaryDisplayChange = useCallback((display: string) => {
    setSelectedSecondaryDisplay(display as SecondaryDisplayType);
    // Set percentages based on secondary display
    setShowPercentages(display === "withPercentages");
  }, []);

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
    selectedPrimaryDisplay,
    selectedSecondaryDisplay,
    startDate,
    endDate,
    showPercentages,
    isMonthlyView,
    isQuarterlyView,
    setStartDate,
    setEndDate,
    handlePeriodChange,
    handlePrimaryDisplayChange,
    handleSecondaryDisplayChange,
    handleDateRangeSelect,
  };
};
