import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    // Verify authentication and company context
    const contextResult = validateCompanyContext(request);
    if ('error' in contextResult) {
      return NextResponse.json(
        { error: contextResult.error },
        { status: 401 }
      );
    }

    const { companyId } = contextResult;

    // Fetch payees for the company
    const { data: payees, error } = await supabase
      .from("payees")
      .select("*")
      .eq("company_id", companyId)
      .order("name");

    if (error) {
      console.error("Error fetching payees:", error);
      return NextResponse.json(
        { error: "Failed to fetch payees" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      payees: payees || []
    });
  } catch (error) {
    console.error("Error in GET /api/payee:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
 