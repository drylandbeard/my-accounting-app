import { EmailProvider, EmailProviderType } from "../types";
import { MailHogProvider } from "./mailhog";
import { SendGridProvider } from "./sendgrid";
import { MailtrapProvider } from "./mailtrap";

export { MailHogProvider } from "./mailhog";
export { SendGridProvider } from "./sendgrid";
export { MailtrapProvider } from "./mailtrap";

/**
 * Create email provider based on configuration
 */
export function createEmailProvider(type: EmailProviderType): EmailProvider {
  switch (type) {
    case "mailhog":
      return new MailHogProvider();
    case "sendgrid":
      return new SendGridProvider();
    case "mailtrap":
      return new MailtrapProvider();
    default:
      throw new Error(`Unsupported email provider: ${type}`);
  }
}

/**
 * Get configured email provider type from environment
 */
export function getEmailProviderType(): EmailProviderType {
  const provider = process.env.EMAIL_PROVIDER as EmailProviderType;
  
  if (!provider) {
    return "mailhog"; // Default to mailhog for local development
  }
  
  if (!["mailhog", "sendgrid", "mailtrap"].includes(provider)) {
    throw new Error(`Invalid EMAIL_PROVIDER: ${provider}. Must be one of: mailhog, sendgrid, mailtrap`);
  }
  
  return provider;
} 