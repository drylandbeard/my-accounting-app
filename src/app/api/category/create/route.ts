import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifyAccessToken } from "@/lib/jwt";

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "COGS", "Expense", "Bank Account", "Credit Card"];

export async function POST(request: NextRequest) {
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
    const { name, type, parent_id } = body;

    // Validate required fields
    if (!name || !type) {
      return NextResponse.json(
        { error: "Name and type are required" },
        { status: 400 }
      );
    }

    // Validate type
    if (!ACCOUNT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${ACCOUNT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate parent_id if provided
    if (parent_id) {
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
      if (parentCategory.type !== type) {
        return NextResponse.json(
          { error: "Parent and child categories must have the same type" },
          { status: 400 }
        );
      }
    }

    // Check if category name already exists for this company
    const { data: existingCategory, error: checkError } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("name", name.trim())
      .eq("company_id", companyId)
      .maybeSingle();

    if (checkError) {
      console.error("Error checking existing category:", checkError);
      return NextResponse.json(
        { error: "Failed to validate category name" },
        { status: 500 }
      );
    }

    if (existingCategory) {
      return NextResponse.json(
        { error: "A category with this name already exists" },
        { status: 409 }
      );
    }

    // Create the category
    const categoryData = {
      name: name.trim(),
      type,
      parent_id: parent_id || null,
      company_id: companyId,
    };

    const { data: newCategory, error: insertError } = await supabase
      .from("chart_of_accounts")
      .insert(categoryData)
      .select()
      .single();

    if (insertError) {
      console.error("Error creating category:", insertError);
      return NextResponse.json(
        { error: "Failed to create category" },
        { status: 500 }
      );
    }

    // Fetch all categories for this company with proper sorting
    const { data: allCategories, error: fetchError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (fetchError) {
      console.error("Error fetching sorted categories:", fetchError);
      // Still return success for the creation, but without sorted list
      return NextResponse.json(
        { 
          message: "Category created successfully",
          category: newCategory
        },
        { status: 201 }
      );
    }

    return NextResponse.json(
      { 
        message: "Category created successfully",
        category: newCategory,
        categories: allCategories || []
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("Unexpected error in category creation:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
