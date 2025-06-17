import { MailtrapClient } from "mailtrap";
import { EmailProvider, EmailMessage, EmailResponse } from "../types";

export class MailtrapProvider implements EmailProvider {
  public readonly name = "mailtrap";
  private client: MailtrapClient;

  constructor() {
    const token = process.env.MAILTRAP_API_TOKEN;
    if (!token) {
      throw new Error("MAILTRAP_API_TOKEN environment variable is required");
    }
    this.client = new MailtrapClient({
      token: token,
    });
  }

  async sendEmail(message: EmailMessage): Promise<EmailResponse> {
    try {
      const sender = {
        email: message.from,
        name: "SWITCH",
      };

      const recipients = [
        {
          email: message.to,
        },
      ];

      const response = await this.client.send({
        from: sender,
        to: recipients,
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody,
      });

      return {
        success: true,
        messageId: response.message_ids?.[0] || "unknown",
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