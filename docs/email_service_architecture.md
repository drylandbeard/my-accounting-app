# Email Service Architecture

This document explains the flexible email service architecture that supports multiple email providers.

## Architecture Overview

The email service is built with a pluggable provider architecture that allows easy switching between different email services without changing application code.

```
EmailService (Singleton)
    ↓
EmailProvider Interface
    ↓
┌─────────────┬─────────────┬─────────────┐
│   MailHog   │  Mailtrap   │  SendGrid   │
│  Provider   │  Provider   │  Provider   │
│   (Local)   │ (Staging)   │(Production) │
└─────────────┴─────────────┴─────────────┘
```

## File Structure

```
src/lib/email/
├── types.ts           # Interface definitions
├── templates.ts       # Email template functions
├── utils.ts          # Utility functions
├── service.ts        # Main email service
└── providers/
    ├── index.ts      # Provider factory
    ├── mailhog.ts    # MailHog implementation (local dev)
    ├── mailtrap.ts   # Mailtrap implementation (staging)
    └── sendgrid.ts   # SendGrid implementation (production)
```

## Core Components

### 1. EmailProvider Interface (`types.ts`)

```typescript
interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<EmailResponse>;
  name: string;
}
```

All email providers implement this interface, ensuring consistent behavior across different services.

### 2. Email Service (`service.ts`)

The main service class that:
- Initializes the correct provider based on configuration
- Provides a consistent API for sending emails
- Handles template generation
- Logs provider usage for debugging

### 3. Provider Implementations

#### MailHog Provider
- **Use Case**: Local development, quick testing
- **Features**: Local SMTP server with web UI for viewing emails
- **Configuration**: `MAILHOG_HOST`, `MAILHOG_PORT` (optional)
- **Web UI**: http://localhost:8025

#### Mailtrap Provider
- **Use Case**: Staging, testing environments
- **Features**: Email testing without actual delivery, team collaboration
- **Configuration**: `MAILTRAP_API_TOKEN`

#### SendGrid Provider
- **Use Case**: Production environments, high-volume sending
- **Features**: Advanced analytics, deliverability tools, scaling
- **Configuration**: `SENDGRID_API_KEY`

## Configuration

### Environment Variables

```bash
# Primary Configuration
EMAIL_PROVIDER=mailhog      # Choose provider (mailhog, mailtrap, sendgrid)
EMAIL_FROM=noreply@yourdomain.com

# MailHog Configuration (Local Development)
MAILHOG_HOST=localhost      # Optional, defaults to localhost
MAILHOG_PORT=1025          # Optional, defaults to 1025

# Mailtrap Configuration (Staging)
MAILTRAP_API_TOKEN=your_token

# SendGrid Configuration (Production)
SENDGRID_API_KEY=your_key

# Application
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### Provider Selection

The system automatically selects the provider based on `EMAIL_PROVIDER`:

1. **MailHog** (default) - Perfect for local development
2. **Mailtrap** - Great for staging and testing
3. **SendGrid** - Excellent for production scaling

## Usage Examples

### Basic Usage

```typescript
import { getEmailService } from "@/lib/email/service";

const emailService = getEmailService();

// Send verification email
const result = await emailService.sendVerificationEmail({
  email: "user@example.com",
  verificationUrl: "https://app.com/verify?token=abc123"
});

if (result.success) {
  console.log("Email sent!", result.messageId);
} else {
  console.error("Failed:", result.error);
}
```

### Custom Email

```typescript
const result = await emailService.sendEmail(
  "user@example.com",
  "Welcome to SWITCH!",
  "<h1>Welcome!</h1>",
  "Welcome to SWITCH!"
);
```

### Check Current Provider

```typescript
const providerName = emailService.getProviderName();
console.log(`Using: ${providerName}`);
```

## Testing

### Test Email Service

```bash
# Set test email and run test
TEST_EMAIL=your-email@domain.com tsx __tests__/test-email-service.ts
```

This will:
1. Show current configuration
2. Send a test verification email
3. Display results and troubleshooting tips

### Manual Testing

```typescript
import { testEmailService } from "../scripts/test-email-service";

await testEmailService();
```

## Development Workflow

### 1. Local Development (MailHog)

```bash
EMAIL_PROVIDER=mailhog
MAILHOG_HOST=localhost    # optional
MAILHOG_PORT=1025        # optional
EMAIL_FROM=dev@yourapp.com
```

- Use MailHog for instant local testing
- View emails at http://localhost:8025
- No external dependencies or API keys
- Perfect for rapid development

### 2. Staging (Mailtrap)

```bash
EMAIL_PROVIDER=mailtrap
MAILTRAP_API_TOKEN=your_token
EMAIL_FROM=staging@yourapp.com
```

- Use Mailtrap for safe testing
- View emails in Mailtrap inbox
- Test with team members
- No risk of sending real emails

### 3. Production (SendGrid)

```bash
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your_production_key
EMAIL_FROM=noreply@yourapp.com
```

- Use SendGrid for reliable delivery
- Monitor deliverability metrics
- Scale with volume

## Provider Comparison

| Feature | MailHog | Mailtrap | SendGrid |
|---------|---------|----------|----------|
| **Best For** | Local Dev | Staging | Production |
| **Real Delivery** | ❌ | ❌ | ✅ |
| **Cost** | Free | Free Tier | Paid Plans |
| **Setup** | Docker/Local | Account + API | Account + API |
| **Web UI** | ✅ localhost:8025 | ✅ Online | ✅ Dashboard |
| **Team Access** | Local Only | ✅ | ✅ |
| **Analytics** | Basic | Basic | Advanced |
| **Deliverability** | N/A | N/A | Excellent |

## Error Handling

The service provides consistent error handling across providers:

```typescript
interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}
```

Common error scenarios:
- Invalid API credentials
- Network connectivity issues
- Rate limiting
- Invalid email addresses
- Domain verification issues

## Security Considerations

1. **API Key Management**
   - Store keys in environment variables
   - Use different keys for different environments
   - Rotate keys regularly

2. **Email Validation**
   - Validate email addresses before sending
   - Implement rate limiting
   - Monitor for abuse

3. **Content Security**
   - Sanitize email content
   - Use templates to prevent injection
   - Monitor for spam patterns

## Monitoring & Debugging

### Logging

The service logs important events:
- Provider initialization
- Email sending attempts
- Success/failure with message IDs
- Error details for troubleshooting

### Health Checks

```typescript
// Check if service is properly configured
try {
  const service = getEmailService();
  console.log(`Provider: ${service.getProviderName()}`);
} catch (error) {
  console.error("Email service not configured:", error);
}
```

## Migration Guide

### Migrating Between Providers

1. **From any provider** - just update environment variables:
```bash
# Switch from MailHog to Mailtrap
EMAIL_PROVIDER=mailtrap
MAILTRAP_API_TOKEN=your_token

# Switch to SendGrid for production
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your_key
```

2. Test the migration:
```bash
tsx __tests__/test-email-service.ts
```

3. No code changes needed - the service handles provider switching automatically.

## Future Enhancements

1. **Additional Providers**
   - Amazon SES
   - Mailgun
   - Brevo (Sendinblue)

2. **Advanced Features**
   - Email templates with variables
   - A/B testing
   - Scheduled sending
   - Bulk email operations

3. **Monitoring**
   - Provider health checks
   - Automatic failover
   - Performance metrics

## Troubleshooting

### Common Issues

1. **"Provider not found" Error**
   - Check `EMAIL_PROVIDER` environment variable
   - Ensure it's one of: `mailhog`, `mailtrap`, `sendgrid`

2. **"API Token Missing" Error**
   - Verify provider-specific token is set
   - Check environment variable naming

3. **"Email sending failed" Error**
   - Test with `tsx __tests__/test-email-service.ts`
   - Check provider dashboard for errors
   - Verify email addresses and domains

### Debug Mode

Enable detailed logging:
```bash
NODE_ENV=development tsx __tests__/test-email-service.ts
```

This provides verbose output for troubleshooting configuration issues. 