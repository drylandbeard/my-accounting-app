import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function PUT(request: NextRequest) {
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

    // Get the payee data from the request body
    const { id, name } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Payee ID is required" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: "Payee name is required" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Verify the payee exists and belongs to the company
    const { data: payee, error: payeeError } = await supabase
      .from("payees")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (payeeError || !payee) {
      return NextResponse.json(
        { error: "Payee not found" },
        { status: 404 }
      );
    }

    // Check for duplicate names (case-insensitive, excluding current payee)
    const { data: existingPayees, error: checkError } = await supabase
      .from("payees")
      .select("id, name")
      .eq("company_id", companyId)
      .neq("id", id)
      .ilike("name", trimmedName);

    if (checkError) {
      console.error("Error checking for duplicate payees:", checkError);
      return NextResponse.json(
        { error: "Error checking for duplicate payees" },
        { status: 500 }
      );
    }

    if (existingPayees && existingPayees.length > 0) {
      return NextResponse.json(
        { error: `Payee "${trimmedName}" already exists.` },
        { status: 400 }
      );
    }

    // Update the payee
    const { data: updatedPayee, error: updateError } = await supabase
      .from("payees")
      .update({ name: trimmedName })
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating payee:", updateError);
      return NextResponse.json(
        { error: `Failed to update payee: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Get updated payees list
    const { data: payees, error: payeesError } = await supabase
      .from("payees")
      .select("*")
      .eq("company_id", companyId)
      .order("name");

    if (payeesError) {
      console.error("Error fetching updated payees:", payeesError);
    }

    return NextResponse.json({
      payee: updatedPayee,
      payees: payees || []
    });
  } catch (error) {
    console.error("Error in PUT /api/payee/update:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 