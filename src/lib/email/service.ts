import { EmailProvider, EmailVerificationData, EmailVerificationCodeData, EmailInvitationData, EmailResponse } from "./types";
import { createVerificationEmailTemplate, createVerificationCodeEmailTemplate, createInvitationEmailTemplate } from "./templates";

export class EmailService {
  private provider: EmailProvider | null = null;
  private fromEmail: string;

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || "noreply@use-switch.com";
    
    // Only initialize on server-side
    if (typeof window === "undefined") {
      this.initializeProvider();
    }
  }

  private async initializeProvider() {
    try {
      // Dynamic import to avoid bundling providers on client-side
      const { createEmailProvider, getEmailProviderType } = await import("./providers");
      const providerType = getEmailProviderType();
      this.provider = createEmailProvider(providerType);
      
      console.log(`Email service initialized with provider: ${this.provider.name}`);
    } catch (error) {
      console.error("Failed to initialize email provider:", error);
    }
  }

  /**
   * Send email verification code email
   */
  async sendVerificationCodeEmail(data: EmailVerificationCodeData): Promise<EmailResponse> {
    // Ensure provider is initialized
    if (!this.provider) {
      await this.initializeProvider();
    }

    if (!this.provider) {
      return {
        success: false,
        error: "Email service not available on client-side",
      };
    }

    try {
      const template = createVerificationCodeEmailTemplate(data);
      
      const result = await this.provider.sendEmail({
        to: data.email,
        from: this.fromEmail,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
      });

      if (result.success) {
        console.log(`Verification code email sent successfully via ${this.provider.name} to ${data.email}`);
      } else {
        console.error(`Failed to send verification code email via ${this.provider.name}:`, result.error);
      }

      return result;
    } catch (error) {
      console.error("Email service error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send verification code email",
      };
    }
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(data: EmailVerificationData): Promise<EmailResponse> {
    // Ensure provider is initialized
    if (!this.provider) {
      await this.initializeProvider();
    }

    if (!this.provider) {
      return {
        success: false,
        error: "Email service not available on client-side",
      };
    }

    try {
      const template = createVerificationEmailTemplate(data);
      
      const result = await this.provider.sendEmail({
        to: data.email,
        from: this.fromEmail,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
      });

      if (result.success) {
        console.log(`Verification email sent successfully via ${this.provider.name} to ${data.email}`);
      } else {
        console.error(`Failed to send verification email via ${this.provider.name}:`, result.error);
      }

      return result;
    } catch (error) {
      console.error("Email service error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send verification email",
      };
    }
  }

  /**
   * Send team invitation email
   */
  async sendInvitationEmail(data: EmailInvitationData): Promise<EmailResponse> {
    // Ensure provider is initialized
    if (!this.provider) {
      await this.initializeProvider();
    }

    if (!this.provider) {
      return {
        success: false,
        error: "Email service not available on client-side",
      };
    }

    try {
      const template = createInvitationEmailTemplate(data);
      
      const result = await this.provider.sendEmail({
        to: data.email,
        from: this.fromEmail,
        subject: template.subject,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
      });

      if (result.success) {
        console.log(`Invitation email sent successfully via ${this.provider.name} to ${data.email}`);
      } else {
        console.error(`Failed to send invitation email via ${this.provider.name}:`, result.error);
      }

      return result;
    } catch (error) {
      console.error("Email service error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send invitation email",
      };
    }
  }

  /**
   * Get current provider name
   */
  getProviderName(): string {
    return this.provider?.name || "not-initialized";
  }

  /**
   * Send custom email (for future use)
   */
  async sendEmail(to: string, subject: string, htmlBody: string, textBody: string): Promise<EmailResponse> {
    // Ensure provider is initialized
    if (!this.provider) {
      await this.initializeProvider();
    }

    if (!this.provider) {
      return {
        success: false,
        error: "Email service not available on client-side",
      };
    }

    return this.provider.sendEmail({
      to,
      from: this.fromEmail,
      subject,
      htmlBody,
      textBody,
    });
  }
}

// Create singleton instance
let emailServiceInstance: EmailService | null = null;

/**
 * Get email service singleton instance
 */
export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
} 