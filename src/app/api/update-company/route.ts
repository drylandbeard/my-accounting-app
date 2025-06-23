import { NextRequest, NextResponse } from "next/server";
import { validateCompanyContext } from "@/lib/auth-utils";
import { supabase } from "@/lib/supabase";

export async function PUT(request: NextRequest) {
  try {
    // Validate company and user context
    const context = validateCompanyContext(request);
    if ("error" in context) {
      return NextResponse.json({ error: context.error }, { status: 400 });
    }

    const { companyId, userId } = context;

    // Check if user is the owner of the company
    const { data: companyUserData, error: companyUserError } = await supabase
      .from("company_users")
      .select("role, is_active")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .single();

    if (companyUserError || !companyUserData) {
      return NextResponse.json({ 
        error: "User is not associated with this company" 
      }, { status: 403 });
    }

    if (!companyUserData.is_active) {
      return NextResponse.json({ 
        error: "User access is not active for this company" 
      }, { status: 403 });
    }

    if (companyUserData.role !== "Owner") {
      return NextResponse.json(
        { error: "Only owners can update company information" },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { name, description } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Company name is required and cannot be empty" },
        { status: 400 }
      );
    }

    if (name.trim().length > 100) {
      return NextResponse.json(
        { error: "Company name cannot exceed 100 characters" },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: { name: string; description?: string } = {
      name: name.trim(),
    };

    // Handle description - can be empty string or undefined
    if (description !== undefined) {
      if (typeof description === "string") {
        updateData.description = description.trim();
      } else {
        updateData.description = "";
      }
    }

    // Update company in database
    const { data: updatedCompany, error } = await supabase
      .from("companies")
      .update(updateData)
      .eq("id", companyId)
      .select("id, name, description")
      .single();

    if (error) {
      console.error("Error updating company:", error);
      return NextResponse.json(
        { error: "Failed to update company" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      company: updatedCompany
    });

  } catch (error) {
    console.error("Error in update-company endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 