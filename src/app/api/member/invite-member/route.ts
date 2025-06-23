import { NextRequest, NextResponse } from "next/server";
import { sendTeamInvitation } from "@/lib/auth";
import { validateCompanyContext } from "@/lib/auth-utils";

export async function POST(request: NextRequest) {
  try {
    const { email, role } = await request.json();
    console.log("📧 Invite member request:", { email, role });

    if (!email || !role) {
      return NextResponse.json(
        { error: "Email and role are required" },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate role
    if (!["Owner", "Member", "Accountant"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role" },
        { status: 400 }
      );
    }

    // Get company and user context
    const context = validateCompanyContext(request);
    if ("error" in context) {
      console.log("❌ Company context validation failed:", context.error);
      return NextResponse.json(
        { error: context.error },
        { status: 400 }
      );
    }

    const { companyId, userId } = context;
    console.log("✅ Company context:", { companyId, userId });

    // Send invitation
    console.log("📤 Sending invitation...");
    const result = await sendTeamInvitation(email, role, companyId, userId);
    console.log("📬 Invitation result:", result);

    if (result.error) {
      console.log("❌ Invitation failed:", result.error);
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    console.log("✅ Invitation sent successfully");
    return NextResponse.json({
      message: "Invitation sent successfully",
      userId: result.userId
    });
  } catch (error) {
    console.error("💥 Invite member error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
