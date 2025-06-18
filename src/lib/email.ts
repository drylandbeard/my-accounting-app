// Re-export types and functions from the new email service
export type { EmailVerificationData, EmailResponse } from "./email/types";
export { getEmailService } from "./email/service";
export { generateVerificationToken, createVerificationUrl } from "./email/utils";
import { getEmailService } from "./email/service";

// Legacy function for backward compatibility
export async function sendVerificationEmail(data: { email: string; verificationUrl: string; userName?: string }) {
  const emailService = getEmailService();
  return emailService.sendVerificationEmail(data);
} 