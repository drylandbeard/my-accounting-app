import { NextRequest } from "next/server";
import { verifyAccessToken } from "./jwt";

/**
 * Get company ID from request headers
 * This should be set by the frontend from the current company context
 */
export function getCompanyIdFromRequest(req: NextRequest): string | null {
  return req.headers.get("x-company-id");
}

/**
 * Get user ID from JWT token in authorization header
 */
export function getUserIdFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const payload = verifyAccessToken(token);
  
  return payload?.userId || null;
}

/**
 * Validate that required company and user context is available
 * Now extracts user info from JWT token instead of relying on middleware headers
 */
export function validateCompanyContext(req: NextRequest): { 
  companyId: string; 
  userId: string; 
} | { error: string } {
  const companyId = getCompanyIdFromRequest(req);
  const userId = getUserIdFromRequest(req);

  if (!companyId) {
    return { error: "Missing company context. Please select a company." };
  }

  if (!userId) {
    return { error: "Missing user context. Please sign in." };
  }

  return { companyId, userId };
} 