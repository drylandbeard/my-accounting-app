import { NextRequest, NextResponse } from "next/server";
import { createCompany } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description } = body;
    
    // Get user ID from headers (set by authentication middleware)
    const userId = req.headers.get("x-user-id");
    
    if (!userId) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }
    
    if (!name?.trim()) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }
    
    // Create company with preset categories and payees
    const result = await createCompany(userId, name.trim(), description?.trim());
    
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      company: result.company,
      presetCategoriesCreated: result.presetCategoriesCreated,
      presetPayeesCreated: result.presetPayeesCreated
    });
    
  } catch (error) {
    console.error("Error in company creation API:", error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
} 