# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Commands
- `npm run dev` - Start development server (Next.js on localhost:3000)
- `npm run build` - Build production application
- `npm run start` - Start production server
- `npm run lint` - Run ESLint (note: lint errors are ignored during builds)

### Database Commands
- `npx supabase start` - Start local Supabase instance
- `npx supabase stop` - Stop local Supabase instance
- `npx supabase db reset` - Reset database with migrations and seed data
- `npx supabase migration new <name>` - Create new migration
- `npx supabase gen types typescript --local > supabase/database.types.ts` - Generate TypeScript types
- `npx supabase studio` - Open Supabase Studio (localhost:54323)

### Utility Scripts
- `tsx scripts/cleanup-expired-tokens.ts` - Clean up expired email verification tokens
- `tsx scripts/enable-user-access.ts` - Enable user access for development

## Architecture Overview

### Technology Stack
- **Frontend**: Next.js 15.3.1 with React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes with server-side functions
- **Database**: Supabase (PostgreSQL) with real-time subscriptions
- **Authentication**: Custom JWT-based system with bcrypt password hashing
- **State Management**: Zustand for client-side state
- **UI Components**: Radix UI, React Hook Form, ShadCN components
- **Email**: Pluggable provider system (MailHog, SendGrid, Mailtrap)
- **Banking**: Plaid API for transaction synchronization
- **Charts**: Recharts for data visualization
- **Data Processing**: ExcelJS for Excel export, PapaParse for CSV handling

### Multi-Tenant Architecture
- Companies are the primary organizational unit
- Users can belong to multiple companies with different roles (Owner, Member, Accountant)
- All data is scoped by `company_id` for strict isolation
- Accountants can have special access patterns to client companies

### Authentication System
- JWT-based with access tokens (15min) and refresh tokens (7 days)
- Three-tier security: middleware → API token validation → database scoping
- Email verification with 6-digit codes
- Invitation system for team members
- Refresh tokens stored in HTTP-only cookies

### Key Database Tables
- `users` - User accounts with basic info
- `companies` - Company/organization records
- `company_users` - Many-to-many user-company relationships with roles
- `chart_of_accounts` - Hierarchical accounting categories
- `transactions` - Processed financial transactions
- `imported_transactions` - Raw imported transactions awaiting categorization
- `journal` - Journal entries for double-entry bookkeeping
- `manual_journal_entries` - Manual accounting entries
- `plaid_items` - Bank connection information
- `accounts` - Bank accounts and manual accounts
- `automations` - Transaction categorization rules
- `email_verification_tokens` - Email verification and invitation tokens

### State Management (Zustand)
- `authStore` - User authentication, company selection, persistent storage
- `categoriesStore` - Chart of accounts with optimistic updates
- `aiStore` - AI chat interface state
- `transactionsStore` - Transaction data management
- `payeesStore` - Payee/vendor management

### API Client Pattern
- `publicApi` - Unauthenticated endpoints (auth, verification)
- `authApi` - Authenticated with automatic token refresh and company context
- Automatic `x-company-id` and `x-user-id` header injection
- Token refresh on 401 responses

### Email Service
- Provider abstraction with pluggable backends
- MailHog for development (localhost:54324)
- SendGrid/Mailtrap for production
- Template system for verification and invitations

## Key File Locations

### Configuration
- `next.config.ts` - Next.js configuration
- `supabase/config.toml` - Supabase local configuration
- `middleware.ts` - Request middleware for auth and CORS
- `.cursor/rules/database-schema.mdc` - Complete database schema reference

### Authentication
- `src/lib/auth.ts` - Server-side auth utilities
- `src/lib/auth-client.ts` - Client-side auth utilities
- `src/lib/jwt.ts` - JWT token management
- `src/components/AuthProvider.tsx` - Auth context provider
- `docs/authentication_system.md` - Detailed auth documentation

### Database
- `src/lib/supabase.ts` - Supabase client configuration
- `supabase/migrations/` - Database schema migrations
- `supabase/seed.sql` - Database seed data

### Email System
- `src/lib/email/` - Email service implementation
- `src/lib/email/providers/` - Email provider implementations
- `src/lib/email/templates.ts` - Email templates
- `docs/email_service_architecture.md` - Email service documentation

### Financial Logic
- `src/lib/financial.ts` - Financial calculations and utilities
- `src/lib/plaid.ts` - Plaid API integration
- `src/lib/preset-categories.ts` - Default chart of accounts
- `docs/multi_company_plaid_integration.md` - Plaid integration documentation

### API Routes
- `src/app/api/auth/` - Authentication endpoints
- `src/app/api/accountant/` - Accountant-specific endpoints
- `src/app/api/transactions/` - Transaction management
- `src/app/api/reports/` - Financial reporting
- `src/app/api/plaid/` - Plaid integration endpoints
- `src/app/api/companies/` - Company management
- `src/app/api/journal/` - Journal entries

### UI Components
- `src/components/ui/` - Base UI components (ShadCN)
- `src/components/auth/` - Authentication components
- `src/components/transactions/` - Transaction management UI
- `src/components/charts/` - Data visualization components

## Database Operations

### Migration Pattern
1. Create migration: `npx supabase migration new <name>`
2. Write SQL in `supabase/migrations/<timestamp>_<name>.sql`
3. Always include company_id for multi-tenancy
4. Test with `npx supabase db reset`
5. Update schema documentation if needed

### Key Patterns
- All queries must filter by company_id
- Use parameterized queries via Supabase client
- Implement optimistic updates for better UX
- Use Supabase subscriptions for real-time updates

## Environment Configuration

### Required Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `JWT_SECRET` - JWT signing secret
- `REFRESH_TOKEN_SECRET` - Refresh token secret
- `PLAID_CLIENT_ID` - Plaid client ID
- `PLAID_SECRET` - Plaid secret key
- `PLAID_ENV` - Plaid environment (sandbox/development/production)
- `PLAID_WEBHOOK_URL` - Webhook URL for Plaid events

### Email Provider Configuration
- `EMAIL_PROVIDER` - Email provider (mailhog/sendgrid/mailtrap)
- `SENDGRID_API_KEY` - SendGrid API key (if using SendGrid)
- `MAILTRAP_TOKEN` - Mailtrap token (if using Mailtrap)

### Optional Configuration
- `NEXT_PUBLIC_APP_URL` - Application URL for email links
- `ANTHROPIC_API_KEY` - For AI features

## Security Considerations

### Database Security
- Always scope queries by company_id
- Use Row Level Security (RLS) policies where appropriate
- Validate user access to company resources
- Never expose sensitive data in API responses

### Authentication Security
- Use HTTP-only cookies for refresh tokens
- Implement proper CORS configuration
- Validate JWT tokens on every protected route
- Hash passwords with bcrypt (12 rounds)

### Input Validation
- Validate all user inputs on server side
- Sanitize data before database insertion
- Use parameterized queries to prevent SQL injection
- Implement rate limiting for sensitive endpoints

## Performance Considerations

### Database Performance
- Use appropriate indexes on frequently queried columns
- Optimize queries with proper joins and filtering
- Consider pagination for large datasets
- Monitor query performance with Supabase dashboard

### Client Performance
- Use optimistic updates for better UX
- Implement proper loading states
- Cache data appropriately in Zustand stores
- Use React.memo for expensive components

### Real-time Performance
- Subscribe only to necessary data updates
- Unsubscribe from Supabase subscriptions when components unmount
- Use company-scoped subscriptions to reduce data transfer

## Testing Approach

### Local Development
1. Use MailHog for email testing (localhost:54324)
2. Use Supabase Studio for database inspection (localhost:54323)
3. Test with multiple companies and user roles
4. Verify JWT token refresh flow

### Common Test Scenarios
- User registration and email verification
- Multi-company switching
- Transaction import and categorization
- Real-time subscription updates
- Accountant access to client companies