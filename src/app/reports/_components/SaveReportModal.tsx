"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface SaveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (reportName: string) => void;
  reportType: string;
  isLoading?: boolean;
}

export function SaveReportModal({ isOpen, onClose, onSave, reportType, isLoading = false }: SaveReportModalProps) {
  const [reportName, setReportName] = useState("");

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setReportName("");
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportName.trim()) return;
    onSave(reportName.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  const handleClose = () => {
    setReportName("");
    onClose();
  };

  if (!isOpen) return null;

  const getReportDisplayName = (type: string) => {
    switch (type) {
      case "pnl":
        return "P&L";
      case "balance-sheet":
        return "Balance Sheet";
      case "cash-flow":
        return "Cash Flow";
      default:
        return "Report";
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50"
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Save {getReportDisplayName(reportType)} Report</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Report Name</label>
            <input
              type="text"
              placeholder="Enter report name..."
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:border-black focus:outline-none focus:ring-black text-sm"
              autoFocus
              disabled={isLoading}
              required
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading} className="text-sm">
              Cancel
            </Button>
            <Button type="submit" disabled={!reportName.trim() || isLoading} className="text-sm">
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
