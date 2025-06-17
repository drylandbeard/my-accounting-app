# Email Verification Setup

This document explains how to set up email verification for user signup using multiple email providers (MailHog, SendGrid, Mailtrap).

## Environment Variables

Add the following environment variables to your `.env.local` file:

```bash
# Email Provider Configuration
EMAIL_PROVIDER=mailhog  # Options: mailhog, sendgrid, mailtrap
EMAIL_FROM=noreply@yourdomain.com

# MailHog Configuration (Default - Local Development)
MAILHOG_HOST=localhost      # Optional, defaults to localhost
MAILHOG_PORT=1025          # Optional, defaults to 1025

# Mailtrap Configuration (Alternative)
MAILTRAP_API_TOKEN=your_mailtrap_api_token

# SendGrid Configuration (Production)
SENDGRID_API_KEY=your_sendgrid_api_key

# Application Configuration  
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Email Provider Setup

### Option 1: MailHog (Default - Local Development)

MailHog is perfect for local development as it catches all emails and displays them in a web interface.

1. **Docker Setup (Recommended)**:
   ```bash
   # Run MailHog in Docker
   docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
   ```

2. **Or install locally**:
   ```bash
   # macOS with Homebrew
   brew install mailhog
   mailhog
   
   # Or download from https://github.com/mailhog/MailHog/releases
   ```

3. **Access the Web Interface**:
   - Open http://localhost:8025 to view caught emails
   - SMTP server runs on localhost:1025

4. **Configuration** (Optional):
   ```bash
   MAILHOG_HOST=localhost  # Default
   MAILHOG_PORT=1025      # Default SMTP port
   ```

### Option 2: Mailtrap (Staging/Testing)

Mailtrap is perfect for staging and testing environments as it catches all emails in a safe testing inbox.

1. **Create a Mailtrap Account**
   - Sign up at [https://mailtrap.io/](https://mailtrap.io/)
   - Create a new project

2. **Get Your API Token**
   - Navigate to your project settings
   - Copy the "API Token"
   - Add it to your environment variables as `MAILTRAP_API_TOKEN`

3. **Configure Domain**
   - Set up your domain verification in Mailtrap
   - Update `EMAIL_FROM` with your verified email address

### Option 3: SendGrid (Production)

SendGrid is recommended for production due to its reliability and deliverability.

1. **Create a SendGrid Account**
   - Sign up at [https://sendgrid.com/](https://sendgrid.com/)
   - Complete the setup process

2. **Get Your API Key**
   - Navigate to Settings > API Keys
   - Create a new API key with Mail Send permissions
   - Add it to your environment variables as `SENDGRID_API_KEY`

3. **Configure Sender Authentication**
   - Set up domain authentication or single sender verification
   - Update `EMAIL_FROM` with your verified email address

## Switching Email Providers

To switch between email providers, simply change the `EMAIL_PROVIDER` environment variable:

```bash
# Use MailHog (default - local development)
EMAIL_PROVIDER=mailhog

# Use Mailtrap (staging/testing)
EMAIL_PROVIDER=mailtrap

# Use SendGrid (production)
EMAIL_PROVIDER=sendgrid
```

## Email Provider Configuration

The system will automatically:
- Initialize the correct email provider based on `EMAIL_PROVIDER`
- Use the appropriate API credentials for that provider
- Log which provider is being used for debugging

## Application URL

Set `NEXT_PUBLIC_APP_URL` to your application's URL:
- For development: `http://localhost:3000`
- For production: `https://yourdomain.com`

## Database Migration

Run the email verification migration:

```bash
# This migration creates the email_verification_tokens table
npx supabase db reset
```

Or manually run the migration file:
```sql
-- See: supabase/migrations/20250611030000_add_email_verification.sql
```

## How It Works

1. **User Signup**
   - User enters email and password
   - Account is created with `is_access_enabled = false`
   - Verification token is generated and stored
   - Email is sent with verification link

2. **Email Verification**
   - User clicks link in email
   - Token is validated and marked as used
   - User's `is_access_enabled` is set to `true`
   - Default company is created

3. **User Signin**
   - If email is not verified, user sees verification message
   - User can request new verification email
   - After verification, user can sign in normally

## API Endpoints

- `GET/POST /api/auth/verify-email?token=...` - Verify email with token
- `POST /api/auth/resend-verification` - Resend verification email

## Features

- ✅ Email verification required for new accounts
- ✅ Automatic token expiration (24 hours)
- ✅ Resend verification email functionality
- ✅ Clean up expired tokens
- ✅ Professional email templates
- ✅ Error handling and user feedback
- ✅ Default company creation after verification

## Security Features

- Tokens expire after 24 hours
- Tokens are single-use (marked as used after verification)
- User accounts are disabled until email verification
- Clean database cleanup of expired tokens 