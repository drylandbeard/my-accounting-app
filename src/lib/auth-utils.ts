import { NextRequest } from "next/server";

/**
 * Get company ID from request headers
 * This should be set by the frontend from the current company context
 */
export function getCompanyIdFromRequest(req: NextRequest): string | null {
  return req.headers.get("x-company-id");
}

/**
 * Get user ID from request headers  
 * This should be set by the frontend from the current user context
 */
export function getUserIdFromRequest(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

/**
 * Validate that required company and user context is available
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