# Authentication System Setup

This document outlines the setup and usage of the new authentication system for the SWITCH accounting app.

## Features Added

### 1. User Authentication
- **Email/Password signup and login**
- **Password hashing using bcryptjs**
- **Manual access control** (isAccessEnabled flag)
- **Three user roles**: Owner, Member, Accountant

### 2. Multi-Company Support
- **Users can have multiple companies**
- **Company switching via NavBar dropdown**
- **Role-based access per company**
- **Easy company creation**

### 3. Enhanced UI
- **Login/Signup form on homepage for unauthenticated users**
- **Updated NavBar with Settings and company management**
- **Settings modal showing user information**

## Database Schema

The following tables were added:

### users
```sql
- id (UUID, PRIMARY KEY)
- email (TEXT, UNIQUE, NOT NULL)
- password_hash (TEXT, NOT NULL) 
- role (user_role ENUM, DEFAULT 'Owner')
- is_access_enabled (BOOLEAN, DEFAULT FALSE)
- created_at, updated_at (TIMESTAMPS)
```

### companies
```sql
- id (UUID, PRIMARY KEY)
- name (TEXT, NOT NULL)
- description (TEXT)
- created_at, updated_at (TIMESTAMPS)
```

### company_users (Junction table)
```sql
- id (UUID, PRIMARY KEY)
- company_id (UUID, REFERENCES companies)
- user_id (UUID, REFERENCES users)
- role (user_role ENUM, DEFAULT 'Owner')
- is_active (BOOLEAN, DEFAULT TRUE)
- created_at (TIMESTAMP)
```

### Updated existing tables
- **plaid_items**: Added `company_id` column
- **accounts**: Added `company_id` column

## Setup Instructions

### 1. Database Migration

If you have Supabase CLI installed:
```bash
npx supabase db push
```

Or manually run the migration file:
`supabase/migrations/20241220000001_create_auth_system.sql`

### 2. Environment Variables

Ensure these are set in your `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # For admin scripts
```

### 3. Install Dependencies

The following were added:
```bash
npm install bcryptjs @types/bcryptjs
```

## Usage

### For New Users

1. **Signup**: Users can create accounts with email/password
2. **Access Control**: Accounts start with `is_access_enabled = false`
3. **Admin Approval**: Use the admin script to enable access:
   ```bash
   npx tsx scripts/enable-user-access.ts user@example.com
   ```

### For Existing Users

1. **Login**: Use email/password to access the app
2. **Company Management**: 
   - Create companies via NavBar dropdown
   - Switch between companies
   - View current company in NavBar

### Settings

- Click the dropdown in NavBar
- Select "Settings" to view user information
- Password changes are not implemented in this version

## File Structure

### New Components
- `src/components/AuthContext.tsx` - Authentication state management
- `src/components/AuthForm.tsx` - Login/Signup form
- `src/components/AuthenticatedApp.tsx` - Wrapper for authenticated routes
- `src/components/NavBar.tsx` - Enhanced NavBar with auth features
- `src/components/SettingsModal.tsx` - User settings popup

### New API Routes
- `src/app/api/auth/signup/route.ts` - User registration endpoint
- `src/app/api/auth/signin/route.ts` - User login endpoint

### Authentication Library
- `src/lib/auth.ts` - Core authentication functions

### Admin Scripts
- `scripts/enable-user-access.ts` - Enable user access manually

## Security Notes

1. **Passwords are hashed** using bcryptjs with 12 salt rounds
2. **Access control** requires manual approval via admin script
3. **Company isolation** ensures users only see their company data
4. **Role-based permissions** can be extended as needed

## Next Steps

1. Run the database migration
2. Set up environment variables
3. Test signup/login flow
4. Enable access for test users
5. Create companies and test multi-company features

## Troubleshooting

### Common Issues

1. **Database connection**: Ensure Supabase credentials are correct
2. **Migration errors**: Check if tables already exist
3. **Access denied**: Verify user has `is_access_enabled = true`
4. **Company not showing**: Check `company_users` table relationships

### Admin Tasks

To enable a user's access:
```bash
npx tsx scripts/enable-user-access.ts user@example.com
```

To check user status in Supabase dashboard:
```sql
SELECT email, is_access_enabled, role FROM users WHERE email = 'user@example.com';
``` 