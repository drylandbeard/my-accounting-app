import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const {
      company_id,
      name,
      condition_type,
      condition_value,
      action_value,
      enabled,
    } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!name || !condition_type || !condition_value || !action_value) {
      return NextResponse.json(
        { error: "Missing required fields" },
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
      .update({
        name: name.trim(),
        condition_type,
        condition_value: condition_value.trim(),
        action_value: action_value.trim(),
        enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("company_id", company_id)
      .select()
      .single();

    if (error) {
      console.error("Error updating automation:", error);
      return NextResponse.json(
        { error: "Failed to update automation" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ automation: data });
  } catch (error) {
    console.error("Error in PUT /api/automations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("company_id");

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("automations")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      console.error("Error deleting automation:", error);
      return NextResponse.json(
        { error: "Failed to delete automation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/automations/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
