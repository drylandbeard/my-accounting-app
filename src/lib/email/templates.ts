import { EmailTemplate, EmailVerificationData, EmailVerificationCodeData } from "./types";

/**
 * Generate email verification template with verification code
 */
export function createVerificationCodeEmailTemplate(data: EmailVerificationCodeData): EmailTemplate {
  const subject = "Your verification code - SWITCH";
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Verification Code</title>
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
          .code-container {
            background-color: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            padding: 24px;
            margin: 32px 0;
          }
          .code {
            font-size: 36px;
            font-weight: 700;
            color: #1a1a1a;
            letter-spacing: 8px;
            margin: 0;
            font-family: 'Courier New', Courier, monospace;
          }
          .code-label {
            font-size: 14px;
            color: #666666;
            margin: 8px 0 0 0;
            text-transform: uppercase;
            letter-spacing: 1px;
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
          @media (max-width: 600px) {
            body { padding: 20px 16px; }
            .title { font-size: 24px; }
            .code { font-size: 28px; letter-spacing: 4px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="brand">SWITCH</div>
          
          <h1 class="title">Your verification code</h1>
          
          <p class="description">
            Enter this code in the verification page to complete your account setup:
          </p>
          
          <div class="code-container">
            <div class="code">${data.verificationCode}</div>
            <div class="code-label">Verification Code</div>
          </div>
          
          <p class="help-text">
            This verification code will expire in 10 minutes. If you didn't create an account with us, you can safely ignore this email.
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
    
    Your verification code
    
    Enter this code in the verification page to complete your account setup:
    
    ${data.verificationCode}
    
    This verification code will expire in 10 minutes. If you didn't create an account with us, you can safely ignore this email.
    
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

/**
 * Generate team invitation email template
 */
export function createInvitationEmailTemplate(data: {
  email: string;
  invitationUrl: string;
  companyName: string;
  inviterName: string;
  role: string;
}): EmailTemplate {
  const subject = `Join ${data.companyName} on SWITCH`;
  
  const htmlBody = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You're Invited to Join ${data.companyName}</title>
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
          .company-name {
            font-weight: 600;
            color: #1a1a1a;
          }
          .role-badge {
            display: inline-block;
            background-color: #f3f4f6;
            color: #374151;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            margin: 0 4px;
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
          
          <h1 class="title">You're invited to join <span class="company-name">${data.companyName}</span></h1>
          
          <p class="description">
            ${data.inviterName} has invited you to join <strong>${data.companyName}</strong> on SWITCH as a <span class="role-badge">${data.role}</span>.
          </p>
          
          <p class="description">
            SWITCH is a comprehensive accounting solution for managing transactions, automations, and financial reporting.
          </p>
          
          <a href="${data.invitationUrl}" class="button">Accept Invitation</a>
          
          <p class="help-text">
            If the button doesn't work, you can copy and paste this link into your browser:<br>
            <a href="${data.invitationUrl}" class="link">${data.invitationUrl}</a>
          </p>
          
          <p class="help-text">
            This invitation will expire in 24 hours. If you don't want to join this company, you can safely ignore this email.
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
    
    You're invited to join ${data.companyName}
    
    ${data.inviterName} has invited you to join ${data.companyName} on SWITCH as a ${data.role}.
    
    SWITCH is a comprehensive accounting solution for managing transactions, automations, and financial reporting.
    
    Accept the invitation by clicking this link:
    ${data.invitationUrl}
    
    This invitation will expire in 24 hours. If you don't want to join this company, you can safely ignore this email.
    
    SWITCH is a comprehensive accounting solution for managing transactions, automations, and financial reporting.
    
    © ${new Date().getFullYear()} SWITCH. All rights reserved.
  `;

  return {
    subject,
    htmlBody,
    textBody
  };
} 