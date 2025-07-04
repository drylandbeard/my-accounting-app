import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const context = validateCompanyContext(request);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    // Fetch saved reports for the company
    const { data: savedReports, error } = await supabase
      .from("saved_reports")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching saved reports:", error);
      return NextResponse.json({ error: "Failed to fetch saved reports" }, { status: 500 });
    }

    return NextResponse.json(savedReports);
  } catch (error) {
    console.error("Error in GET /api/reports/saved:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = validateCompanyContext(request);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    const body = await request.json();
    const { name, type, description, parameters } = body;

    // Validate required fields
    if (!name || !type || !parameters) {
      return NextResponse.json({ error: "Name, type, and parameters are required" }, { status: 400 });
    }

    // Validate type
    const validTypes = ["balance-sheet", "pnl", "cash-flow"];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    // Create saved report
    const { data: savedReport, error } = await supabase
      .from("saved_reports")
      .insert([
        {
          name,
          type,
          description,
          parameters,
          company_id: companyId,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating saved report:", error);
      return NextResponse.json({ error: "Failed to create saved report" }, { status: 500 });
    }

    return NextResponse.json(savedReport, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/reports/saved:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
