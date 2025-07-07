"use client";

import React from "react";
import { Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Account, Transaction, ViewerModalState } from "../_types";
import { formatDateForDisplay, formatNumber, getTransactionDisplayAmount } from "../_utils";
import ExcelJS from "exceljs";

interface TransactionViewerProps {
  viewerModal: ViewerModalState;
  setViewerModal: (state: ViewerModalState) => void;
  selectedCategoryTransactions: Transaction[];
  startDate: string;
  endDate: string;
  companyName?: string;
  getCategoryName: (tx: Transaction, category: Account) => string;
  onTransactionClick?: (transaction: Transaction) => void;
}

export const TransactionViewer: React.FC<TransactionViewerProps> = ({
  viewerModal,
  setViewerModal,
  selectedCategoryTransactions,
  startDate,
  endDate,
  companyName,
  getCategoryName,
  onTransactionClick,
}) => {
  // Export modal transactions function
  const exportModalTransactions = async () => {
    if (!viewerModal.category || selectedCategoryTransactions.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Transactions");

    // Set styles
    const headerStyle = { font: { bold: true, size: 10 } };
    const numberStyle = {
      font: { size: 10 },
      numFmt: '#,##0.00;(#,##0.00);"—"', // Format to show dash for zero values
      alignment: { horizontal: "right" as const },
    };
    const dateStyle = { font: { size: 10 }, alignment: { horizontal: "left" as const } };

    let currentRow = 1;

    // Title and company info
    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `${viewerModal.category.name} Transactions`;
    worksheet.getCell(`A${currentRow}`).style = {
      font: { size: 12, bold: true },
      alignment: { horizontal: "center" as const },
    };
    currentRow++;

    if (companyName) {
      worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = companyName;
      worksheet.getCell(`A${currentRow}`).style = { font: { size: 10 }, alignment: { horizontal: "center" as const } };
      currentRow++;
    }

    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = viewerModal.selectedMonth
      ? `for ${viewerModal.selectedMonth}`
      : `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;
    worksheet.getCell(`A${currentRow}`).style = { font: { size: 10 }, alignment: { horizontal: "center" as const } };
    currentRow++; // Empty row

    // Headers
    worksheet.getCell(`A${currentRow}`).value = "Date";
    worksheet.getCell(`A${currentRow}`).style = headerStyle;
    worksheet.getCell(`B${currentRow}`).value = "Description";
    worksheet.getCell(`B${currentRow}`).style = headerStyle;
    worksheet.getCell(`C${currentRow}`).value = "Category";
    worksheet.getCell(`C${currentRow}`).style = headerStyle;
    worksheet.getCell(`D${currentRow}`).value = "Source";
    worksheet.getCell(`D${currentRow}`).style = headerStyle;
    worksheet.getCell(`E${currentRow}`).value = "Amount";
    worksheet.getCell(`E${currentRow}`).style = headerStyle;
    currentRow++;

    // Transaction rows
    selectedCategoryTransactions.forEach((tx) => {
      const displayAmount = getTransactionDisplayAmount(tx, viewerModal.category?.type || "");
      const categoryName = viewerModal.category ? getCategoryName(tx, viewerModal.category) : "";
      const source = tx.source === "manual" ? "Manual" : "Journal";

      worksheet.getCell(`A${currentRow}`).value = tx.date;
      worksheet.getCell(`A${currentRow}`).style = dateStyle;
      worksheet.getCell(`B${currentRow}`).value = tx.description;
      worksheet.getCell(`B${currentRow}`).style = dateStyle;
      worksheet.getCell(`C${currentRow}`).value = categoryName;
      worksheet.getCell(`C${currentRow}`).style = dateStyle;
      worksheet.getCell(`D${currentRow}`).value = source;
      worksheet.getCell(`D${currentRow}`).style = dateStyle;
      worksheet.getCell(`E${currentRow}`).value = displayAmount;
      worksheet.getCell(`E${currentRow}`).style = numberStyle;
      currentRow++;
    });

    // Total row
    const total = selectedCategoryTransactions.reduce(
      (sum, tx) => sum + getTransactionDisplayAmount(tx, viewerModal.category?.type || ""),
      0
    );

    currentRow++; // Empty row
    worksheet.getCell(`A${currentRow}`).value = "Total";
    worksheet.getCell(`A${currentRow}`).style = { font: { bold: true, size: 10 } };
    worksheet.getCell(`E${currentRow}`).value = total;
    worksheet.getCell(`E${currentRow}`).style = {
      font: { bold: true, size: 10 },
      numFmt: '#,##0.00;(#,##0.00);"—"',
      alignment: { horizontal: "right" as const },
    };

    // Add footer
    currentRow += 3;

    const today = new Date();
    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `switch | ${companyName || ""} | ${formatDateForDisplay(
      today.toISOString().split("T")[0]
    )} ${today.toLocaleTimeString()}`;
    worksheet.getCell(`A${currentRow}`).style = {
      font: { size: 9, color: { argb: "FF666666" } },
      alignment: { horizontal: "center" as const },
    };

    // Set column widths
    worksheet.getColumn("A").width = 12;
    worksheet.getColumn("B").width = 30;
    worksheet.getColumn("C").width = 20;
    worksheet.getColumn("D").width = 10;
    worksheet.getColumn("E").width = 15;

    // Save the file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${viewerModal.category.name.replace(
      /[^a-zA-Z0-9]/g,
      "-"
    )}-transactions-${startDate}-to-${endDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  if (!viewerModal.isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[800px] max-h-[80vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">
            {viewerModal.category?.name} Transactions
            {viewerModal.selectedMonth && ` for ${viewerModal.selectedMonth}`}
          </h2>
          <div className="flex items-center gap-4">
            {selectedCategoryTransactions.length > 0 && (
              <button
                onClick={exportModalTransactions}
                className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setViewerModal({ isOpen: false, category: null })}
              className="text-gray-500 hover:text-gray-700"
            >
              ×
            </button>
          </div>
        </div>
        <div className="p-4 overflow-auto">
          <Table className="w-full text-xs">
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="text-left p-2">Date</TableHead>
                <TableHead className="text-left p-2">Description</TableHead>
                <TableHead className="text-left p-2">Category</TableHead>
                <TableHead className="text-left p-2">Source</TableHead>
                <TableHead className="text-right p-2">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedCategoryTransactions.map((tx) => (
                <TableRow 
                  key={tx.id} 
                  className={`${onTransactionClick ? 'cursor-pointer hover:bg-gray-100' : 'hover:bg-gray-50'}`}
                  onClick={() => onTransactionClick && onTransactionClick(tx)}
                >
                  <TableCell className="p-2">{tx.date}</TableCell>
                  <TableCell className="p-2">{tx.description}</TableCell>
                  <TableCell className="p-2">
                    {viewerModal.category ? getCategoryName(tx, viewerModal.category) : ""}
                  </TableCell>
                  <TableCell className="p-2">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        tx.source === "manual" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {tx.source === "manual" ? "Manual" : "Journal"}
                    </span>
                  </TableCell>
                  <TableCell className="p-2 text-right">
                    {formatNumber(getTransactionDisplayAmount(tx, viewerModal.category?.type || ""))}
                  </TableCell>
                </TableRow>
              ))}
              {selectedCategoryTransactions.length > 0 && (
                <TableRow className="bg-gray-50 font-semibold">
                  <TableCell colSpan={4} className="p-2 text-right">
                    Total
                  </TableCell>
                  <TableCell className="p-2 text-right">
                    {formatNumber(
                      selectedCategoryTransactions.reduce(
                        (sum, tx) => sum + getTransactionDisplayAmount(tx, viewerModal.category?.type || ""),
                        0
                      )
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {selectedCategoryTransactions.length === 0 && (
            <div className="text-gray-500 text-center py-4">No transactions to show.</div>
          )}
        </div>
      </div>
    </div>
  );
};
