import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication and company context
    const contextResult = validateCompanyContext(request);
    if ("error" in contextResult) {
      return NextResponse.json({ error: contextResult.error }, { status: 401 });
    }

    const { companyId } = contextResult;

    // Get the payee data from the request body
    const { name } = await request.json();

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Payee name is required" }, { status: 400 });
    }

    const trimmedName = name.trim();
    console.log("API received name:", name); // Debug log
    console.log("API trimmed name:", trimmedName); // Debug log

    // Check for duplicate names (case-insensitive)
    const { data: existingPayees, error: checkError } = await supabase
      .from("payees")
      .select("id, name")
      .eq("company_id", companyId)
      .ilike("name", trimmedName);

    if (checkError) {
      console.error("Error checking for duplicate payees:", checkError);
      return NextResponse.json({ error: "Error checking for duplicate payees" }, { status: 500 });
    }

    if (existingPayees && existingPayees.length > 0) {
      return NextResponse.json({ error: `Payee "${trimmedName}" already exists.` }, { status: 400 });
    }

    // Create the payee
    const { data: payee, error: createError } = await supabase
      .from("payees")
      .insert([
        {
          name: trimmedName,
          company_id: companyId,
        },
      ])
      .select()
      .single();

    if (createError) {
      console.error("Error creating payee:", createError);
      return NextResponse.json({ error: `Failed to create payee: ${createError.message}` }, { status: 500 });
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
      payee,
      payees: payees || [],
    });
  } catch (error) {
    console.error("Error in POST /api/payee:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
