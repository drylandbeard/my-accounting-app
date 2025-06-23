import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function DELETE(request: NextRequest) {
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

    // Get the payee ID from the request body
    const { payeeId } = await request.json();

    if (!payeeId) {
      return NextResponse.json(
        { error: "Payee ID is required" },
        { status: 400 }
      );
    }

    // Verify the payee exists and belongs to the company
    const { data: payee, error: payeeError } = await supabase
      .from("payees")
      .select("*")
      .eq("id", payeeId)
      .eq("company_id", companyId)
      .single();

    if (payeeError || !payee) {
      return NextResponse.json(
        { error: "Payee not found" },
        { status: 404 }
      );
    }

    // Check if payee is used in transactions
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("id")
      .eq("payee_id", payeeId)
      .eq("company_id", companyId)
      .limit(1);

    if (txError) {
      console.error("Error checking transactions:", txError);
      return NextResponse.json(
        { error: "Error checking if payee is in use" },
        { status: 500 }
      );
    }

    if (transactions && transactions.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete payee because it is used in existing transactions. Please reassign or delete the transactions first." },
        { status: 400 }
      );
    }

    // Delete the payee
    const { error: deleteError } = await supabase
      .from("payees")
      .delete()
      .eq("id", payeeId)
      .eq("company_id", companyId);

    if (deleteError) {
      console.error("Error deleting payee:", deleteError);
      return NextResponse.json(
        { error: `Failed to delete payee: ${deleteError.message}` },
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
      success: true,
      payees: payees || []
    });
  } catch (error) {
    console.error("Error in DELETE /api/payee/delete:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 