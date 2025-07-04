import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const context = validateCompanyContext(request);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Report ID is required" }, { status: 400 });
    }

    // Delete the saved report (RLS policy will ensure only company members can delete their company's reports)
    const { error } = await supabase.from("saved_reports").delete().eq("id", id).eq("company_id", companyId);

    if (error) {
      console.error("Error deleting saved report:", error);
      return NextResponse.json({ error: "Failed to delete saved report" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/reports/saved/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const context = validateCompanyContext(request);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Report ID is required" }, { status: 400 });
    }

    const { name, description, parameters } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: "Report name is required" }, { status: 400 });
    }

    if (!parameters) {
      return NextResponse.json({ error: "Report parameters are required" }, { status: 400 });
    }

    // Validate parameters structure
    const { startDate, endDate, primaryDisplay, secondaryDisplay, period } = parameters;
    if (!startDate || !endDate || !primaryDisplay || !secondaryDisplay) {
      return NextResponse.json({ error: "All report parameters are required" }, { status: 400 });
    }

    // Validate period if provided
    if (period) {
      const validPeriods = [
        "lastMonth",
        "thisMonth",
        "last4Months",
        "last12Months",
        "thisQuarter",
        "lastQuarter",
        "thisYearToLastMonth",
        "thisYearToToday",
      ];
      if (!validPeriods.includes(period)) {
        return NextResponse.json({ error: "Invalid period value" }, { status: 400 });
      }
    }

    // Validate date format and range
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    if (start > end) {
      return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 });
    }

    // Update the saved report (RLS policy will ensure only company members can update their company's reports)
    const { data: updatedReport, error } = await supabase
      .from("saved_reports")
      .update({
        name: name.trim(),
        description: description || "",
        parameters,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      console.error("Error updating saved report:", error);
      return NextResponse.json({ error: "Failed to update saved report" }, { status: 500 });
    }

    if (!updatedReport) {
      return NextResponse.json(
        { error: "Report not found or you don't have permission to update it" },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedReport);
  } catch (error) {
    console.error("Error in PUT /api/reports/saved/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const context = validateCompanyContext(request);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Report ID is required" }, { status: 400 });
    }

    // Fetch the specific saved report
    const { data: savedReport, error } = await supabase
      .from("saved_reports")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (error) {
      console.error("Error fetching saved report:", error);
      return NextResponse.json({ error: "Failed to fetch saved report" }, { status: 500 });
    }

    if (!savedReport) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json(savedReport);
  } catch (error) {
    console.error("Error in GET /api/reports/saved/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
