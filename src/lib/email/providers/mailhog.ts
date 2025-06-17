import nodemailer from "nodemailer";
import { EmailProvider, EmailMessage, EmailResponse } from "../types";

export class MailHogProvider implements EmailProvider {
  public readonly name = "mailhog";
  private transporter: nodemailer.Transporter;

  constructor() {
    // Default MailHog SMTP configuration
    const host = process.env.MAILHOG_HOST || "localhost";
    const port = parseInt(process.env.MAILHOG_PORT || "1025");

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false, // MailHog doesn't use SSL
      auth: undefined, // MailHog doesn't require authentication
      tls: {
        rejectUnauthorized: false
      }
    });

    console.log(`MailHog provider initialized: ${host}:${port}`);
  }

  async sendEmail(message: EmailMessage): Promise<EmailResponse> {
    try {
      const mailOptions = {
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody,
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error("MailHog send error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send email via MailHog",
      };
    }
  }

  /**
   * Test the connection to MailHog
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error("MailHog connection test failed:", error);
      return false;
    }
  }
} 