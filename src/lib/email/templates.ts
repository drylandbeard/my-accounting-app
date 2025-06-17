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
            padding: 40px 20px; 
            background-color: #ffffff; 
            color: #333333;
            line-height: 1.5;
          }
          .container { 
            max-width: 500px; 
            margin: 0 auto; 
            text-align: center;
          }
          .brand { 
            font-size: 20px;
            font-weight: 600;
            color: #1a1a1a;
            margin: 0 0 48px 0;
            text-align: left;
          }
          .title {
            font-size: 28px;
            font-weight: 600;
            color: #1a1a1a;
            margin: 0 0 24px 0;
            line-height: 1.2;
          }
          .description {
            font-size: 16px;
            color: #666666;
            margin: 0 0 40px 0;
            line-height: 1.5;
          }
          .button { 
            display: inline-block; 
            background-color: #1a1a1a; 
            color: white !important; 
            padding: 14px 28px; 
            text-decoration: none; 
            border-radius: 4px; 
            font-weight: 500; 
            font-size: 16px;
            margin: 0 0 32px 0;
            border: 1px solid #1a1a1a;
          }
          .button:hover {
            background-color: #333333;
          }
          .help-text {
            font-size: 14px;
            color: #999999;
            margin: 32px 0;
            line-height: 1.4;
          }
          .footer { 
            margin-top: 60px;
            padding-top: 24px;
            border-top: 1px solid #eeeeee;
            font-size: 12px;
            color: #999999;
            line-height: 1.4;
          }
          .link { 
            color: #1a1a1a; 
            word-break: break-all; 
          }
          @media (max-width: 600px) {
            body { padding: 20px 16px; }
            .title { font-size: 24px; }
            .button { padding: 12px 24px; font-size: 15px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="brand">SWITCH</div>
          
          <h1 class="title">Verify your email address</h1>
          
          <p class="description">
            To start using SWITCH, just click the verify email button below:
          </p>
          
          <a href="${data.verificationUrl}" class="button">Verify email</a>
          
          <p class="help-text">
            If the button doesn't work, you can copy and paste this link into your browser:<br>
            <a href="${data.verificationUrl}" class="link">${data.verificationUrl}</a>
          </p>
          
          <p class="help-text">
            This verification link will expire in 24 hours. If you didn't create an account with us, you can safely ignore this email.
          </p>
          
          <p class="help-text">
            Questions about SWITCH? Check out our Help Center.
          </p>
          
          <div class="footer">
            <p style="margin: 0 0 8px 0;">
              SWITCH is a comprehensive accounting solution for managing transactions, automations, and financial reporting.
            </p>
            <p style="margin: 0;">
              © ${new Date().getFullYear()} SWITCH. All rights reserved.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textBody = `
    SWITCH
    
    Verify your email address
    
    To start using SWITCH, just click the verify email link below:
    
    ${data.verificationUrl}
    
    This verification link will expire in 24 hours. If you didn't create an account with us, you can safely ignore this email.
    
    Questions about SWITCH? Check out our Help Center.
    
    SWITCH is a comprehensive accounting solution for managing transactions, automations, and financial reporting.
    
    © ${new Date().getFullYear()} SWITCH. All rights reserved.
  `;

  return {
    subject,
    htmlBody,
    textBody
  };
} 