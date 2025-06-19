// Re-export types and functions from the new email service
export type { EmailVerificationData, EmailVerificationCodeData, EmailResponse } from "./email/types";
export { getEmailService } from "./email/service";
export { generateVerificationToken, generateVerificationCode, createVerificationUrl } from "./email/utils";
import { getEmailService } from "./email/service";

// Legacy function for backward compatibility
export async function sendVerificationEmail(data: { email: string; verificationUrl: string; userName?: string }) {
  const emailService = getEmailService();
  return emailService.sendVerificationEmail(data);
}

// New function for sending verification codes
export async function sendVerificationCodeEmail(data: { email: string; verificationCode: string; userName?: string }) {
  const emailService = getEmailService();
  return emailService.sendVerificationCodeEmail(data);
} 