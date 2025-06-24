import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validateCompanyContext } from "@/lib/auth-utils";

/**
 * GET /api/automations
 * Fetch all automations for the current company
 */
export async function GET(req: NextRequest) {
  try {
    // Validate company context
    const context = validateCompanyContext(req);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 401 });
    }

    const { companyId } = context;

    // Fetch automations for the company
    const { data: automations, error } = await supabase
      .from("automations")
      .select("id, automation_type, condition_type, condition_value, action_value, auto_add, enabled, company_id")
      .eq("company_id", companyId)
      .eq("enabled", true)
      .order("name");

    if (error) {
      console.error("Error fetching automations:", error);
      return NextResponse.json({ 
        error: "Failed to fetch automations" 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      automations: automations || []
    });

  } catch (err: unknown) {
    console.error("Error in GET /api/automations:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      company_id,
      name,
      automation_type,
      condition_type,
      condition_value,
      action_value,
      enabled = true,
    } = body;

    // Validate required fields
    if (
      !company_id ||
      !name ||
      !automation_type ||
      !condition_type ||
      !condition_value ||
      !action_value
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate automation_type
    if (!["payee", "category"].includes(automation_type)) {
      return NextResponse.json(
        { error: "Invalid automation type" },
        { status: 400 }
      );
    }

    // Validate condition_type
    if (
      !["contains", "equals", "starts_with", "ends_with"].includes(
        condition_type
      )
    ) {
      return NextResponse.json(
        { error: "Invalid condition type" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("automations")
      .insert([
        {
          company_id,
          name: name.trim(),
          automation_type,
          condition_type,
          condition_value: condition_value.trim(),
          action_value: action_value.trim(),
          enabled,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating automation:", error);
      return NextResponse.json(
        { error: "Failed to create automation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ automation: data }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/automations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
