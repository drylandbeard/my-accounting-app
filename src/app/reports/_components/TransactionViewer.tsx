"use client";

import React from "react";
import { Download } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Category, Transaction, ViewerModalState } from "../_types";
import { formatDateForDisplay, formatNumber, getTransactionDisplayAmount, formatMonth } from "../_utils";
import ExcelJS from "exceljs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface TransactionViewerProps {
  viewerModal: ViewerModalState;
  setViewerModal: (state: ViewerModalState) => void;
  selectedCategoryTransactions: Transaction[];
  startDate: string;
  endDate: string;
  companyName?: string;
  getCategoryName: (tx: Transaction, category: Category) => string;
  onTransactionClick?: (tx: Transaction) => void;
  payees?: Array<{ id: string; name: string }>;
  accounts?: Array<{ plaid_account_id: string | null; name: string }>;
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
  payees = [],
  accounts = [],
}) => {
  // Helper functions to get names
  const getPayeeName = (tx: Transaction): string => {
    if (!tx.payee_id) return "";
    const payee = payees.find(p => p.id === tx.payee_id);
    return payee?.name || "";
  };

  const getAccountName = (tx: Transaction): string => {
    if (tx.plaid_account_name) return tx.plaid_account_name;
    if (!tx.plaid_account_id) return "";
    const account = accounts.find(a => a.plaid_account_id === tx.plaid_account_id);
    return account?.name || "";
  };

  // Calculate running balance
  const calculateRunningBalance = (): Array<{ transaction: Transaction; balance: number }> => {
    let runningBalance = 0;
    return selectedCategoryTransactions.map(tx => {
      const displayAmount = getTransactionDisplayAmount(tx, viewerModal.category?.type || "");
      runningBalance += displayAmount;
      return { transaction: tx, balance: runningBalance };
    });
  };

  const transactionsWithBalance = calculateRunningBalance();

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
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `${viewerModal.category.name} Transactions`;
    worksheet.getCell(`A${currentRow}`).style = {
      font: { size: 12, bold: true },
      alignment: { horizontal: "center" as const },
    };
    currentRow++;

    if (companyName) {
      worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = companyName;
      worksheet.getCell(`A${currentRow}`).style = { font: { size: 10 }, alignment: { horizontal: "center" as const } };
      currentRow++;
    }

    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = viewerModal.selectedMonth
      ? `for ${formatMonth(viewerModal.selectedMonth)}`
      : `${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;
    worksheet.getCell(`A${currentRow}`).style = { font: { size: 10 }, alignment: { horizontal: "center" as const } };
    currentRow++; // Empty row

    // Headers
    worksheet.getCell(`A${currentRow}`).value = "Date";
    worksheet.getCell(`A${currentRow}`).style = headerStyle;
    worksheet.getCell(`B${currentRow}`).value = "Payee";
    worksheet.getCell(`B${currentRow}`).style = headerStyle;
    worksheet.getCell(`C${currentRow}`).value = "Description";
    worksheet.getCell(`C${currentRow}`).style = headerStyle;
    worksheet.getCell(`D${currentRow}`).value = "Category";
    worksheet.getCell(`D${currentRow}`).style = headerStyle;
    worksheet.getCell(`E${currentRow}`).value = "Source/Account";
    worksheet.getCell(`E${currentRow}`).style = headerStyle;
    worksheet.getCell(`F${currentRow}`).value = "Amount";
    worksheet.getCell(`F${currentRow}`).style = headerStyle;
    worksheet.getCell(`G${currentRow}`).value = "Balance";
    worksheet.getCell(`G${currentRow}`).style = headerStyle;
    currentRow++;

    // Transaction rows with running balance
    let runningBalance = 0;
    selectedCategoryTransactions.forEach((tx) => {
      const displayAmount = getTransactionDisplayAmount(tx, viewerModal.category?.type || "");
      runningBalance += displayAmount;
      const categoryName = viewerModal.category ? getCategoryName(tx, viewerModal.category) : "";
      const payeeName = getPayeeName(tx);
      const accountName = getAccountName(tx);
      const source = tx.source === "manual" ? "Manual" : "Journal";

      worksheet.getCell(`A${currentRow}`).value = tx.date;
      worksheet.getCell(`A${currentRow}`).style = dateStyle;
      worksheet.getCell(`B${currentRow}`).value = payeeName;
      worksheet.getCell(`B${currentRow}`).style = dateStyle;
      worksheet.getCell(`C${currentRow}`).value = tx.description;
      worksheet.getCell(`C${currentRow}`).style = dateStyle;
      worksheet.getCell(`D${currentRow}`).value = categoryName;
      worksheet.getCell(`D${currentRow}`).style = dateStyle;
      worksheet.getCell(`E${currentRow}`).value = accountName || source;
      worksheet.getCell(`E${currentRow}`).style = dateStyle;
      worksheet.getCell(`F${currentRow}`).value = displayAmount;
      worksheet.getCell(`F${currentRow}`).style = numberStyle;
      worksheet.getCell(`G${currentRow}`).value = runningBalance;
      worksheet.getCell(`G${currentRow}`).style = numberStyle;
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
    worksheet.getCell(`F${currentRow}`).value = total;
    worksheet.getCell(`F${currentRow}`).style = {
      font: { bold: true, size: 10 },
      numFmt: '#,##0.00;(#,##0.00);"—"',
      alignment: { horizontal: "right" as const },
    };

    // Add footer
    currentRow += 3;

    const today = new Date();
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = `switch | ${companyName || ""} | ${formatDateForDisplay(
      today.toISOString().split("T")[0]
    )} ${today.toLocaleTimeString()}`;
    worksheet.getCell(`A${currentRow}`).style = {
      font: { size: 9, color: { argb: "FF666666" } },
      alignment: { horizontal: "center" as const },
    };

    // Set column widths
    worksheet.getColumn("A").width = 12; // Date
    worksheet.getColumn("B").width = 20; // Payee
    worksheet.getColumn("C").width = 30; // Description
    worksheet.getColumn("D").width = 20; // Category
    worksheet.getColumn("E").width = 20; // Source/Account
    worksheet.getColumn("F").width = 15; // Amount
    worksheet.getColumn("G").width = 15; // Balance

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
    <Dialog open={viewerModal.isOpen} onOpenChange={() => setViewerModal({ isOpen: false, category: null })}>
      <DialogContent className="min-w-[80%] max-h-[80vh] overflow-y-scroll">
        <DialogHeader className="flex-row justify-between items-center">
          <DialogTitle className="text-lg font-semibold">
            {viewerModal.category?.name} Transactions
            {viewerModal.selectedMonth && ` for ${formatMonth(viewerModal.selectedMonth)}`}
          </DialogTitle>
          {selectedCategoryTransactions.length > 0 && (
            <button
              onClick={exportModalTransactions}
              className="border px-3 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200 mr-5"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </DialogHeader>
        <div className="overflow-auto">
          <Table className="w-full text-xs">
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="text-left p-2 w-20">Date</TableHead>
                <TableHead className="text-left p-2 w-32">Payee</TableHead>
                <TableHead className="text-left p-2 w-auto">Description</TableHead>
                <TableHead className="text-left p-2 w-32">Category</TableHead>
                <TableHead className="text-left p-2 w-32">Source/Account</TableHead>
                <TableHead className="text-right p-2 w-24">Amount</TableHead>
                <TableHead className="text-right p-2 w-24">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactionsWithBalance.map(({ transaction: tx, balance }) => (
                <TableRow
                  key={tx.id}
                  className={`${onTransactionClick ? "cursor-pointer hover:bg-gray-100" : "hover:bg-gray-50"}`}
                  onClick={() => onTransactionClick && onTransactionClick(tx)}
                >
                  <TableCell className="p-2">{tx.date}</TableCell>
                  <TableCell className="p-2">{getPayeeName(tx)}</TableCell>
                  <TableCell className="p-2 w-auto max-w-0">
                    <div className="truncate cursor-default" title={tx.description}>
                      {tx.description}
                    </div>
                  </TableCell>
                  <TableCell className="p-2">
                    {viewerModal.category ? getCategoryName(tx, viewerModal.category) : ""}
                  </TableCell>
                  <TableCell className="p-2">
                    {getAccountName(tx) || (
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          tx.source === "manual" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {tx.source === "manual" ? "Manual" : "Journal"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="p-2 text-right">
                    {formatNumber(getTransactionDisplayAmount(tx, viewerModal.category?.type || ""))}
                  </TableCell>
                  <TableCell className="p-2 text-right">
                    {formatNumber(balance)}
                  </TableCell>
                </TableRow>
              ))}
              {selectedCategoryTransactions.length > 0 && (
                <TableRow className="bg-gray-50 font-semibold">
                  <TableCell colSpan={5} className="p-2 text-right">
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
                  <TableCell className="p-2 text-right">
                    {formatNumber(
                      transactionsWithBalance.length > 0 
                        ? transactionsWithBalance[transactionsWithBalance.length - 1].balance 
                        : 0
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
      </DialogContent>
    </Dialog>
  );
};
