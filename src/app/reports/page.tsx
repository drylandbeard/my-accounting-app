"use client";

import React, { useState, useEffect } from "react";
import { useAuthStore } from "@/zustand/authStore";
import Loader from "@/components/ui/loader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, TrendingUp, DollarSign, BarChart3, Eye, Trash2, Edit2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { EditReportModal } from "@/app/reports/_components/EditReportModal";

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

export default function ReportsPage() {
  const { currentCompany } = useAuthStore();
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [hasCompanySelected, setHasCompanySelected] = useState(!!currentCompany?.id);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    report: SavedReport | null;
  }>({
    isOpen: false,
    report: null,
  });

  // Load saved reports on component mount
  useEffect(() => {
    const loadSavedReports = async () => {
      if (!currentCompany?.id) {
        setHasCompanySelected(false);
        return;
      }

      try {
        const response = await api.get("/api/reports/saved");

        if (response.ok) {
          const reports = await response.json();
          setSavedReports(reports);
          setHasCompanySelected(true);
        }
      } catch (error) {
        console.error("Failed to load saved reports:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSavedReports();
  }, [currentCompany]);

  const deleteSavedReport = async (reportId: string) => {
    if (!currentCompany?.id) return;

    try {
      const response = await api.delete(`/api/reports/saved/${reportId}`);

      if (response.ok) {
        setSavedReports((prev) => prev.filter((report) => report.id !== reportId));
      }
    } catch (error) {
      console.error("Failed to delete saved report:", error);
    }
  };

  const handleEditReport = (report: SavedReport) => {
    setEditModal({
      isOpen: true,
      report,
    });
  };

  const handleCloseEditModal = () => {
    setEditModal({
      isOpen: false,
      report: null,
    });
  };

  const handleReportUpdated = (updatedReport: SavedReport) => {
    setSavedReports((prev) => prev.map((report) => (report.id === updatedReport.id ? updatedReport : report)));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getReportIcon = (type: string) => {
    switch (type) {
      case "balance-sheet":
        return <BarChart3 className="w-5 h-5" />;
      case "pnl":
        return <TrendingUp className="w-5 h-5" />;
      case "cash-flow":
        return <DollarSign className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const getReportUrl = (type: string) => {
    switch (type) {
      case "balance-sheet":
        return "/reports/balance-sheet";
      case "pnl":
        return "/reports/pnl";
      case "cash-flow":
        return "/reports/cash-flow";
      default:
        return "/reports";
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-lg font-semibold mb-2">Reports</h1>
          <p className="text-gray-600 text-sm">Generate financial reports and manage your saved custom reports</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Quick Reports Section */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileText className="w-5 h-5" />
                  Quick Reports
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* P&L Report */}
                <Link href="/reports/pnl">
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 text-sm">P&L</h3>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">Quick</span>
                  </div>
                </Link>

                {/* Balance Sheet */}
                <Link href="/reports/balance-sheet">
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 text-sm">Balance Sheet</h3>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">Quick</span>
                  </div>
                </Link>

                {/* Cash Flow */}
                <Link href="/reports/cash-flow">
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900 text-sm">Cash Flow</h3>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md">Quick</span>
                  </div>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Created Reports Section */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Created Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading || !hasCompanySelected ? (
                  <div className="text-center py-8">
                    {hasCompanySelected ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader size="sm" />
                        <div className="text-sm text-gray-600">Loading saved reports...</div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">
                        Please select a company to view saved reports
                      </div>
                    )}
                  </div>
                ) : savedReports.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="font-medium text-gray-900 mb-2 text-sm">No Custom Reports</h3>
                    <p className="text-xs text-gray-500">
                      Save reports from P&L, Balance Sheet, or Cash Flow pages to see them here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedReports.map((report) => (
                      <div key={report.id} className="border rounded-lg p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="p-1.5 bg-gray-100 rounded">{getReportIcon(report.type)}</div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 text-sm max-w-[200px]">{report.name}</h4>
                              <p className="text-xs text-gray-500">
                                {report.type === "balance-sheet"
                                  ? "Balance Sheet"
                                  : report.type === "pnl"
                                  ? "P&L"
                                  : "Cash Flow"}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                {formatDate(report.parameters.startDate)} to {formatDate(report.parameters.endDate)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Link href={`${getReportUrl(report.type)}?reportId=${report.id}`}>
                              <button
                                className="border px-2 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
                                title="View Report"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </Link>
                            <button
                              className="border px-2 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
                              title="Edit Report"
                              onClick={() => handleEditReport(report)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              className="border px-2 py-1 rounded text-xs flex items-center space-x-1 bg-gray-100 hover:bg-gray-200"
                              title="Delete Report"
                              onClick={() => deleteSavedReport(report.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Edit Report Modal */}
      <EditReportModal
        report={editModal.report}
        isOpen={editModal.isOpen}
        onClose={handleCloseEditModal}
        onReportUpdated={handleReportUpdated}
      />
    </div>
  );
}
