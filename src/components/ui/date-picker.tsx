"use client";

import * as React from "react";
import { format, parse, parseISO, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  value?: Date | string;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  label?: string;
  max?: Date;
}

function formatDate(date: Date | undefined) {
  if (!date) {
    return "";
  }
  return format(date, "MM/dd/yyyy");
}

function isValidDate(date: Date | undefined) {
  if (!date) {
    return false;
  }
  return isValid(date);
}

export function DatePicker({
  value,
  onChange,
  placeholder = "MM/DD/YYYY",
  disabled = false,
  className,
  id,
  max,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Handle initial value
  const initialDate = React.useMemo(() => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    try {
      // Use parseISO for YYYY-MM-DD format to avoid timezone issues
      const parsedDate = typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/) 
        ? parseISO(value)
        : new Date(value);
      return isValidDate(parsedDate) ? parsedDate : undefined;
    } catch {
      return undefined;
    }
  }, []);

  const [date, setDate] = React.useState<Date | undefined>(initialDate);
  const [month, setMonth] = React.useState<Date | undefined>(date);
  const [inputValue, setInputValue] = React.useState(formatDate(date));

  // Update when external value changes
  React.useEffect(() => {
    if (!value) {
      setDate(undefined);
      setInputValue("");
      return;
    }

    const newDate = value instanceof Date 
      ? value 
      : (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/) 
          ? parseISO(value)
          : new Date(value));
    if (isValidDate(newDate)) {
      setDate(newDate);
      setMonth(newDate);
      setInputValue(formatDate(newDate));
    }
  }, [value]);

  const handleSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;

    setDate(selectedDate);
    setMonth(selectedDate);
    setInputValue(formatDate(selectedDate));
    onChange?.(selectedDate);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    // Try to parse the input value
    try {
      // Handle different input formats
      let parsedDate: Date | undefined;

      // Check if it's MM/DD/YYYY format
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        parsedDate = parse(value, "MM/dd/yyyy", new Date());
      }
      // Check if it's M/D/YYYY format
      else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
        const [month, day, year] = value.split("/").map(Number);
        parsedDate = new Date(year, month - 1, day);
      }
      // Check if it's YYYY-MM-DD format
      else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        parsedDate = parse(value, "yyyy-MM-dd", new Date());
      }

      if (parsedDate && isValidDate(parsedDate)) {
        setDate(parsedDate);
        setMonth(parsedDate);
        onChange?.(parsedDate);
      }
    } catch {
      // Invalid date format, just update the input
    }
  };

  const handleBlur = () => {
    // If the input is empty, clear the date
    if (!inputValue) {
      setDate(undefined);
      onChange?.(undefined);
      return;
    }

    // If the input doesn't match the expected format, reset to the current date
    if (date && inputValue !== formatDate(date)) {
      setInputValue(formatDate(date));
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`pr-10 ${className}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" disabled={disabled} className="absolute top-1/2 right-2 h-6 w-6 -translate-y-1/2 p-0">
            <CalendarIcon className="h-4 w-4" />
            <span className="sr-only">Open calendar</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end" alignOffset={-8} sideOffset={10}>
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleSelect}
            captionLayout="dropdown"
            month={month}
            onMonthChange={setMonth}
            disabled={max ? (date) => date > max : undefined}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
