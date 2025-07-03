"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";

interface DatePickerFieldProps {
  id?: string;
  label: string;
  value?: Date | string;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  max?: Date;
  labelClassName?: string;
  required?: boolean;
}

export function DatePickerField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  max,
  labelClassName,
  required = false,
}: DatePickerFieldProps) {
  const uniqueId = React.useId();
  const fieldId = id || `date-field-${uniqueId}`;

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={fieldId} className={`px-1 ${labelClassName}`}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <DatePicker
        id={fieldId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        max={max}
      />
    </div>
  );
}
