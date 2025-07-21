"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
    <Dialog
      open={isOpen}
      onOpenChange={handleClose}
    >
      <DialogContent className="min-w-[400px] w-full">
        <DialogHeader>
          <DialogTitle>Save {getReportDisplayName(reportType)} Report</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
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
      </DialogContent>
    </Dialog>
  );
}
