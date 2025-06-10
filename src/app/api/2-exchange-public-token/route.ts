import { NextRequest, NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { supabase } from "@/lib/supabaseAdmin";
import { CountryCode } from "plaid";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function POST(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId, userId } = context;

    // Get the public_token from the request body
    const { public_token } = await req.json();

    if (!public_token) {
      return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
    }

    // 1. Exchange public_token for access_token and item_id
    const response = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = response.data;

    // 2. Get institution information
    let institutionName = "Unknown Institution";
    try {
      const itemResponse = await plaidClient.itemGet({ access_token });
      if (itemResponse.data.item.institution_id) {
        const institutionResponse = await plaidClient.institutionsGetById({
          institution_id: itemResponse.data.item.institution_id,
          country_codes: ["US" as CountryCode]
        });
        institutionName = institutionResponse.data.institution.name;
      }
    } catch (institutionError) {
      console.warn("Could not fetch institution name:", institutionError);
    }

    // 3. Save to plaid_items table (check for existing first, then insert or update)
    const { data: existingItem } = await supabase
      .from("plaid_items")
      .select("id")
      .eq("item_id", item_id)
      .eq("company_id", companyId)
      .single();

    let savedData;
    if (existingItem) {
      // Update existing record
      const { data: updatedData, error: updateError } = await supabase
        .from("plaid_items")
        .update({
          access_token,
          institution_name: institutionName,
          updated_at: new Date().toISOString()
        })
        .eq("item_id", item_id)
        .eq("company_id", companyId)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating plaid_items:", updateError);
        return NextResponse.json({ 
          error: "Failed to update connection data",
          details: updateError.message 
        }, { status: 500 });
      }
      savedData = updatedData;
      console.log("✅ Successfully updated existing plaid item:", savedData);
    } else {
      // Insert new record
      const { data: insertedData, error: insertError } = await supabase
        .from("plaid_items")
        .insert({
          user_id: userId,
          company_id: companyId,
          item_id,
          access_token,
          institution_name: institutionName,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting into plaid_items:", insertError);
        return NextResponse.json({ 
          error: "Failed to save connection data",
          details: insertError.message 
        }, { status: 500 });
      }
      savedData = insertedData;
      console.log("✅ Successfully inserted new plaid item:", savedData);
    }

    // 4. Return the access_token and item_id to the frontend
    return NextResponse.json({ 
      access_token, 
      item_id,
      institution_name: institutionName 
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    console.error("Plaid exchange error:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
