import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("company_id");
    const automationType = searchParams.get("automation_type");

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    // Build query
    let query = supabase
      .from("automations")
      .select("*")
      .eq("company_id", companyId)
      .order("name");

    // Filter by automation type if provided
    if (automationType && ["payee", "category"].includes(automationType)) {
      query = query.eq("automation_type", automationType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching automations:", error);
      return NextResponse.json(
        { error: "Failed to fetch automations" },
        { status: 500 }
      );
    }

    return NextResponse.json({ automations: data });
  } catch (error) {
    console.error("Error in GET /api/automations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
