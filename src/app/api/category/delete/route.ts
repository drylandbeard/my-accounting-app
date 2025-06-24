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

    // Get the category ID from the request body
    const { categoryId } = await request.json();

    if (!categoryId) {
      return NextResponse.json(
        { error: "Category ID is required" },
        { status: 400 }
      );
    }

    // Verify the category exists and belongs to the company
    const { data: category, error: categoryError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("id", categoryId)
      .eq("company_id", companyId)
      .single();

    if (categoryError || !category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    // Check if category has subcategories
    const { data: subcategories, error: subcategoriesError } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("parent_id", categoryId)
      .eq("company_id", companyId);

    if (subcategoriesError) {
      return NextResponse.json(
        { error: "Error checking subcategories" },
        { status: 500 }
      );
    }

    if (subcategories && subcategories.length > 0) {
      return NextResponse.json(
        { error: `Cannot delete category because it has ${subcategories.length} subcategories. Please delete or reassign them first.` },
        { status: 400 }
      );
    }

    // Check if category is used in transactions
    const { data: transactions, error: txError } = await supabase
      .from("transactions")
      .select("id")
      .or(`selected_category_id.eq.${categoryId},corresponding_category_id.eq.${categoryId}`)
      .eq("company_id", companyId)
      .limit(1);

    if (txError) {
      return NextResponse.json(
        { error: "Error checking if category is in use" },
        { status: 500 }
      );
    }

    if (transactions && transactions.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete category because it is used in existing transactions. Please reassign or delete the transactions first." },
        { status: 400 }
      );
    }

    // Delete the category
    const { error: deleteError } = await supabase
      .from("chart_of_accounts")
      .delete()
      .eq("id", categoryId)
      .eq("company_id", companyId);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete category: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // Get updated categories list
    const { data: categories, error: categoriesError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("parent_id", { ascending: true, nullsFirst: true })
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (categoriesError) {
      console.error("Error fetching updated categories:", categoriesError);
    }

    return NextResponse.json({
      success: true,
      categories: categories || []
    });
  } catch (error) {
    console.error("Error in DELETE /api/category/delete:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 