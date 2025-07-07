import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyAccessToken } from "@/lib/jwt";

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"];

export async function PUT(request: NextRequest) {
  try {
    // Get authentication token from headers
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // Get company context from headers
    const companyId = request.headers.get("x-company-id");
    if (!companyId) {
      return NextResponse.json(
        { error: "Company context required" },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { id, name, type, parent_id } = body;

    // Validate required fields
    if (!id) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    // Validate type if provided
    if (type && !ACCOUNT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${ACCOUNT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Check if category exists and belongs to the company
    const { data: existingCategory, error: fetchError } = await supabase
      .from("chart_of_accounts")
      .select("id, name, type, parent_id, plaid_account_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();

    if (fetchError || !existingCategory) {
      return NextResponse.json(
        { error: "Category not found or access denied" },
        { status: 404 }
      );
    }

    // Validate parent_id if provided
    if (parent_id !== undefined && parent_id !== null) {
      const { data: parentCategory, error: parentError } = await supabase
        .from("chart_of_accounts")
        .select("id, type")
        .eq("id", parent_id)
        .eq("company_id", companyId)
        .single();

      if (parentError || !parentCategory) {
        return NextResponse.json(
          { error: "Invalid parent category" },
          { status: 400 }
        );
      }

      // Validate that parent and child have the same type
      const childType = type || existingCategory.type;
      if (parentCategory.type !== childType) {
        return NextResponse.json(
          { error: "Parent and child categories must have the same type" },
          { status: 400 }
        );
      }

      // Prevent circular dependencies
      if (parent_id === id) {
        return NextResponse.json(
          { error: "Category cannot be its own parent" },
          { status: 400 }
        );
      }
    }

    // Check if new name already exists (if name is being changed)
    if (name && name.trim() !== existingCategory.name) {
      const { data: nameCheck, error: nameError } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("name", name.trim())
        .eq("company_id", companyId)
        .neq("id", id)
        .maybeSingle();

      if (nameError) {
        console.error("Error checking category name:", nameError);
        return NextResponse.json(
          { error: "Failed to validate category name" },
          { status: 500 }
        );
      }

      if (nameCheck) {
        return NextResponse.json(
          { error: "A category with this name already exists" },
          { status: 409 }
        );
      }
    }

    // Build update data
    const updateData: {
      name?: string;
      type?: string;
      parent_id?: string | null;
    } = {};
    if (name !== undefined) updateData.name = name.trim();
    if (type !== undefined) updateData.type = type;
    if (parent_id !== undefined) updateData.parent_id = parent_id;

    // Update the category
    const { data: updatedCategory, error: updateError } = await supabase
      .from("chart_of_accounts")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating category:", updateError);
      return NextResponse.json(
        { error: "Failed to update category" },
        { status: 500 }
      );
    }

    // If this chart of accounts entry is linked to a plaid account, also update the accounts table
    if (existingCategory.plaid_account_id && (name || type)) {
      const accountUpdateData: {
        name?: string;
        type?: string;
      } = {};
      if (name !== undefined) accountUpdateData.name = name.trim();
      if (type !== undefined) accountUpdateData.type = type;

      const { error: accountsError } = await supabase
        .from("accounts")
        .update(accountUpdateData)
        .eq("plaid_account_id", existingCategory.plaid_account_id)
        .eq("company_id", companyId);

      if (accountsError) {
        console.error("Error updating accounts table:", accountsError);
        // Don't return error here as the main update succeeded
      }
    }

    // Fetch all categories for this company with proper sorting
    const { data: allCategories, error: fetchAllError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (fetchAllError) {
      console.error("Error fetching sorted categories:", fetchAllError);
      // Still return success for the update, but without sorted list
      return NextResponse.json(
        { 
          message: "Category updated successfully",
          category: updatedCategory
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { 
        message: "Category updated successfully",
        category: updatedCategory,
        categories: allCategories || []
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Unexpected error in category update:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 