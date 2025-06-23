# Authentication System Documentation

## Overview

This document provides comprehensive documentation for the production-ready authentication system that combines:
- **JWT (JSON Web Tokens)** for stateless authentication
- **Zustand** for client-side state management
- **HTTP-only cookies** for secure refresh token storage

## Architecture

### Core Components

1. **JWT Tokens**
   - Access Token: Short-lived (15 minutes), stored in memory
   - Refresh Token: Long-lived (7 days), stored in HTTP-only cookie

2. **Zustand Store** (`src/zustand/authStore.ts`)
   - Manages authentication state
   - Handles automatic token refresh
   - Provides authenticated HTTP client

3. **HTTP-only Cookies**
   - Stores refresh tokens securely
   - Immune to XSS attacks
   - Automatic handling by browser

4. **API Endpoints** (`/api/auth/*`)
   - Sign in/up, token refresh, logout
   - Email verification
   - Protected route middleware

## Security Features

### Token Security
- **Access tokens** stored only in memory (no localStorage/sessionStorage)
- **Refresh tokens** stored in HTTP-only cookies
- **Automatic rotation** on refresh
- **Secure transmission** (HTTPS in production)

### Cookie Configuration
```typescript
{
  httpOnly: true,                          // No JavaScript access
  secure: process.env.NODE_ENV === "production", // HTTPS only
  sameSite: "lax",                         // CSRF protection
  maxAge: 60 * 60 * 24 * 7,               // 7 days
  path: "/"                                // Available to all paths
}
```

### Protection Mechanisms
- **XSS Protection**: HTTP-only cookies prevent token theft via JavaScript
- **CSRF Protection**: SameSite=Lax cookie attribute
- **MITM Protection**: Secure flag ensures HTTPS transmission
- **Token Expiry**: Short-lived access tokens minimize exposure

## Implementation Guide

### 1. Authentication Flow

#### Sign Up
```typescript
POST /api/auth/signup
{
  "email": "user@example.com",
  "password": "securepassword"
}

// Response: User created, verification email sent
```

#### Sign In
```typescript
POST /api/auth/signin
{
  "email": "user@example.com",
  "password": "securepassword"
}

// Response body
{
  "user": { "id": "...", "email": "...", "role": "..." },
  "companies": [...],
  "currentCompany": {...},
  "accessToken": "jwt_access_token"
}
// Cookie set: refreshToken=jwt_refresh_token
```

#### Token Refresh
```typescript
POST /api/auth/refresh
// No body needed - refresh token from cookie

// Response
{
  "accessToken": "new_jwt_access_token"
}
// Cookie updated: refreshToken=new_jwt_refresh_token
```

#### Logout
```typescript
POST /api/auth/logout
// Clears refresh token cookie
```

### 2. Client-Side Setup

#### Zustand Store Structure
```typescript
// Main auth store
interface AuthState {
  user: User | null;
  companies: UserCompany[];
  currentCompany: Company | null;
  isAuthenticated: boolean;
  
  // Actions
  setAuth: (auth: AuthData) => void;
  clearAuth: () => void;
  refreshTokens: () => Promise<boolean>;
}

// Separate token store (memory only)
interface TokenState {
  accessToken: string | null;
  setAccessToken: (accessToken: string) => void;
  clearTokens: () => void;
}
```

#### Using the Authenticated HTTP Client
```typescript
import { useAuthStore } from '@/zustand/authStore';

const MyComponent = () => {
  const httpClient = createAuthenticatedFetch();
  
  const fetchData = async () => {
    // Automatically includes auth token and handles refresh
    const response = await httpClient('/api/protected-endpoint', {
      method: 'POST',
      body: JSON.stringify({ data: 'example' })
    });
    
    return response.json();
  };
};
```

### 3. Server-Side Protection

#### Protecting API Routes
```typescript
// src/lib/jwt.ts
import { withAuth } from '@/lib/jwt';

async function handler(request: Request) {
  const userId = getUserIdFromRequest(request);
  // Your protected logic here
}

export const POST = withAuth(handler);
```

#### JWT Utilities
```typescript
// Generate tokens
generateTokens(payload): { accessToken, refreshToken }

// Verify tokens
verifyToken(token): payload | null

// Extract user from request
getUserIdFromRequest(request): string | null
```

### 4. Component Integration

#### Auth Provider
```typescript
// src/components/AuthProvider.tsx
export function AuthProvider({ children }) {
  const { validateSession, isLoading } = useAuthStore();
  
  useEffect(() => {
    validateSession(); // Check existing session on mount
  }, []);
  
  if (isLoading) return <LoadingSpinner />;
  return <>{children}</>;
}
```

#### Protected Routes
```typescript
// src/components/AuthenticatedApp.tsx
export default function AuthenticatedApp({ children }) {
  const { isAuthenticated } = useAuthStore();
  
  if (!isAuthenticated) {
    return <AuthForm />;
  }
  
  return <>{children}</>;
}
```

## Migration from localStorage

### Step 1: Update API Endpoints
```typescript
// Before: localStorage approach
localStorage.setItem('token', token);
const token = localStorage.getItem('token');

// After: Cookie + Zustand approach
// Tokens handled automatically
const { setAuth } = useAuthStore();
setAuth(authData); // Access token to memory, refresh token to cookie
```

### Step 2: Update HTTP Requests
```typescript
// Before: Manual token handling
fetch('/api/data', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

// After: Automatic with credentials
const httpClient = createAuthenticatedFetch();
await httpClient('/api/data'); // Token handling is automatic
```

### Step 3: Update Components
```typescript
// Before: Manual auth checks
const isAuthenticated = !!localStorage.getItem('token');

// After: Zustand store
const { isAuthenticated } = useAuthStore();
```

## Environment Configuration

### Required Environment Variables
```bash
# JWT Secrets (generate strong random values)
JWT_ACCESS_SECRET=your_access_secret_min_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_min_32_chars

# Optional: Custom expiry times
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Base URL for production
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### Middleware Configuration
The middleware (`src/middleware.ts`) handles:
- Security headers (X-Frame-Options, etc.)
- CORS with credentials support
- Preflight requests

## Best Practices

### Security
1. **Never expose tokens in URLs** or query parameters
2. **Use HTTPS in production** for Secure cookies
3. **Implement rate limiting** on auth endpoints
4. **Monitor failed login attempts**
5. **Log security events** for auditing

### Performance
1. **Cache user data** in Zustand to reduce API calls
2. **Use selective subscriptions** to prevent re-renders
3. **Implement request deduplication** for concurrent calls
4. **Preload auth state** on app initialization

### Error Handling
```typescript
try {
  const response = await httpClient('/api/data');
  if (!response.ok) {
    // Handle API errors
  }
} catch (error) {
  // Network errors automatically trigger re-auth if needed
}
```

## Troubleshooting

### Common Issues

#### "Token expired" errors
- **Cause**: Access token lifetime exceeded
- **Solution**: Automatic refresh handles this
- **Debug**: Check if refresh token cookie exists

#### "Cookies not being sent"
- **Cause**: Missing credentials in fetch
- **Solution**: Ensure `credentials: 'include'`
- **Debug**: Check Network tab for Cookie headers

#### "CORS errors with credentials"
- **Cause**: Wildcard origin with credentials
- **Solution**: Specify exact origins in middleware
- **Debug**: Check Access-Control headers

### Debug Tools

#### Browser DevTools
1. **Application > Cookies**: View refresh token cookie
2. **Network tab**: Check Authorization headers
3. **Console**: Monitor auth-related errors

#### Zustand DevTools
```typescript
// Enable in development
import { devtools } from 'zustand/middleware';

const useAuthStore = create()(
  devtools(
    persist(/* store config */),
    { name: 'auth-store' }
  )
);
```

## Testing

### Unit Tests
```typescript
describe('Authentication', () => {
  it('should generate valid JWT tokens', () => {
    const tokens = generateTokens({ userId: '123' });
    expect(tokens.accessToken).toBeDefined();
    expect(verifyToken(tokens.accessToken)).toHaveProperty('userId');
  });
});
```

### Integration Tests
```typescript
describe('Auth Flow', () => {
  it('should complete sign in flow', async () => {
    // Sign in
    const signInRes = await fetch('/api/auth/signin', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    
    const { accessToken } = await signInRes.json();
    expect(accessToken).toBeDefined();
    
    // Verify cookie was set
    const cookies = signInRes.headers.get('set-cookie');
    expect(cookies).toContain('refreshToken');
  });
});
```

## Production Checklist

- [ ] **HTTPS enabled** (required for Secure cookies)
- [ ] **Strong JWT secrets** (minimum 32 characters)
- [ ] **CORS origins configured** (no wildcards with credentials)
- [ ] **Rate limiting implemented** on auth endpoints
- [ ] **Security headers configured** via middleware
- [ ] **Error logging setup** for auth failures
- [ ] **Session monitoring** for suspicious activity
- [ ] **Backup auth recovery** (email verification working)

## Summary

This authentication system provides:
- **Enterprise-grade security** with HTTP-only cookies
- **Excellent performance** with Zustand state management
- **Developer-friendly API** with automatic token handling
- **Production-ready features** including email verification
- **Comprehensive protection** against common vulnerabilities

The combination of JWT tokens, Zustand for state management, and HTTP-only cookies for refresh tokens creates a robust, secure, and performant authentication system suitable for production applications. 