import sgMail from "@sendgrid/mail";
import { EmailProvider, EmailMessage, EmailResponse } from "../types";

export class SendGridProvider implements EmailProvider {
  public readonly name = "sendgrid";

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error("SENDGRID_API_KEY environment variable is required");
    }
    sgMail.setApiKey(apiKey);
  }

  async sendEmail(message: EmailMessage): Promise<EmailResponse> {
    try {
      const msg = {
        to: message.to,
        from: message.from,
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody,
      };

      const response = await sgMail.send(msg);
      
      return {
        success: true,
        messageId: response[0].headers["x-message-id"] as string,
      };
    } catch (error) {
      console.error("SendGrid send error:", error);
      
      let errorMessage = "Failed to send email via SendGrid";
      
      if (error && typeof error === "object" && "response" in error) {
        const sgError = error as { response?: { body?: { errors?: { message: string }[] } } };
        if (sgError.response?.body?.errors) {
          errorMessage = sgError.response.body.errors.map((e) => e.message).join(", ");
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
} 