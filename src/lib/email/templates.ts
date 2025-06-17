import { EmailTemplate, EmailVerificationData } from "./types";

/**
 * Generate email verification template
 */
export function createVerificationEmailTemplate(data: EmailVerificationData): EmailTemplate {
  const subject = "Verify your email address - SWITCH";
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 0; 
            background-color: #f8f9fa; 
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background-color: white; 
          }
          .header { 
            background-color: #1a1a1a; 
            color: white; 
            padding: 24px; 
            text-align: center; 
          }
          .content { 
            padding: 32px 24px; 
          }
          .button { 
            display: inline-block; 
            background-color: #1a1a1a; 
            color: white; 
            padding: 12px 24px; 
            text-decoration: none; 
            border-radius: 6px; 
            font-weight: 500; 
            margin: 16px 0; 
          }
          .footer { 
            padding: 24px; 
            background-color: #f8f9fa; 
            text-align: center; 
            color: #6b7280; 
            font-size: 14px; 
          }
          .link { 
            color: #1a1a1a; 
            word-break: break-all; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; font-size: 24px;">SWITCH</h1>
          </div>
          <div class="content">
            <h2 style="color: #1a1a1a; margin-bottom: 16px;">Verify your email address</h2>
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
              Thank you for signing up for SWITCH! To complete your registration and start managing your finances, please verify your email address by clicking the button below.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
            </div>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
              If the button doesn't work, you can copy and paste this link into your browser:<br>
              <a href="${data.verificationUrl}" class="link">${data.verificationUrl}</a>
            </p>
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 24px;">
              This verification link will expire in 24 hours. If you didn't create an account with us, you can safely ignore this email.
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">© ${new Date().getFullYear()} SWITCH. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textBody = `
    Verify your email address - SWITCH
    
    Thank you for signing up for SWITCH!
    
    To complete your registration and start managing your finances, please verify your email address by visiting this link:
    
    ${data.verificationUrl}
    
    This verification link will expire in 24 hours. If you didn't create an account with us, you can safely ignore this email.
    
    © ${new Date().getFullYear()} SWITCH. All rights reserved.
  `;

  return {
    subject,
    htmlBody,
    textBody
  };
} 