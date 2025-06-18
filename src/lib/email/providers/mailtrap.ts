import nodemailer from "nodemailer";
import { EmailProvider, EmailMessage, EmailResponse } from "../types";

export class MailtrapProvider implements EmailProvider {
  public readonly name = "mailtrap";
  private transporter: nodemailer.Transporter;

  constructor() {
    const host = "live.smtp.mailtrap.io";
    const port = 587;
    const user = "api";
    const pass = process.env.MAILTRAP_API_TOKEN;

    if (!host || !port || !user || !pass) {
      throw new Error("MAILTRAP_SMTP_HOST, MAILTRAP_SMTP_PORT, MAILTRAP_SMTP_USER, and MAILTRAP_SMTP_PASS environment variables are required");
    }

    this.transporter = nodemailer.createTransport({
      host: host,
      port: port,
      auth: {
        user: user,
        pass: pass,
      },
    });
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

      const result = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: result.messageId || "unknown",
      };
    } catch (error) {
      console.error("Mailtrap send error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send email via Mailtrap",
      };
    }
  }
} 