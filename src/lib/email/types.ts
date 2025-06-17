export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailVerificationData {
  email: string;
  verificationUrl: string;
  userName?: string;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<EmailResponse>;
  name: string;
}

export type EmailProviderType = "mailhog" | "sendgrid" | "mailtrap"; 