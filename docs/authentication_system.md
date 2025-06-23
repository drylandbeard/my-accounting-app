# Authentication System Documentation

## Overview

This document provides comprehensive documentation for the production-ready authentication system that combines:
- **JWT (JSON Web Tokens)** for stateless authentication
- **Zustand** for client-side state management (memory only)
- **HTTP-only cookies** for secure refresh token storage

## Architecture

### Core Components

1. **JWT Tokens**
   - Access Token: Short-lived (15 minutes), stored in memory only
   - Refresh Token: Long-lived (7 days), stored in HTTP-only cookie

2. **Zustand Store** (`src/zustand/authStore.ts`)
   - Manages authentication state in memory only
   - No persistence to localStorage/sessionStorage
   - Handles automatic token refresh
   - Provides authenticated HTTP client

3. **HTTP-only Cookies**
   - Stores refresh tokens securely
   - Immune to XSS attacks
   - Automatic handling by browser

4. **API Endpoints** (`src/app/api/auth/*`)
   - Sign in/up, token refresh, logout
   - Email verification
   - Session validation
   - User companies fetching
   - Protected route middleware

## Security Features

### Token Security
- **Access tokens** stored only in memory (no browser storage)
- **Refresh tokens** stored in HTTP-only cookies
- **Automatic rotation** on refresh
- **Secure transmission** (HTTPS in production)
- **No sensitive data** persisted to browser storage

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
- **Memory-only State**: No sensitive data in browser storage

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
{
  "message": "User created successfully",
  "needsVerification": true
}
```

#### Email Verification
```typescript
POST /api/auth/verify-code
{
  "email": "user@example.com",
  "code": "123456"
}

// Response (after successful verification)
{
  "user": { "id": "...", "email": "...", "role": "..." },
  "companies": [...],
  "currentCompany": {...},
  "accessToken": "jwt_access_token"
}
// Cookie set: refreshToken=jwt_refresh_token
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

#### Session Validation
```typescript
GET /api/auth/validate
Authorization: Bearer <access_token>

// Response
{
  "valid": true,
  "user": { "id": "...", "email": "...", "role": "..." },
  "companies": [
    {
      "company_id": "uuid",
      "role": "Owner",
      "companies": {
        "id": "uuid",
        "name": "Company Name",
        "description": "Company Description"
      }
    }
  ],
  "currentCompany": {
    "id": "uuid",
    "name": "Company Name", 
    "description": "Company Description"
  }
}
```

#### Logout
```typescript
POST /api/auth/logout
// Clears refresh token cookie

// Response
{
  "message": "Logged out successfully"
}
```

### 2. Client-Side Setup

#### Zustand Store Structure (Memory Only)
```typescript
// Main auth store - no persistence
interface AuthState {
  user: User | null;
  companies: UserCompany[];
  currentCompany: Company | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setAuth: (auth: AuthData) => void;
  setCurrentCompany: (company: Company | null) => void;
  clearAuth: () => void;
  logout: () => void;
  refreshTokens: () => Promise<boolean>;
}

// Separate token store (memory only)
interface TokenState {
  accessToken: string | null;
  setAccessToken: (accessToken: string) => void;
  clearTokens: () => void;
}
```

#### Zustand Store Implementation
```typescript
// Token store - not persisted for security (access token only)
export const useTokenStore = create<TokenState>((set) => ({
  accessToken: null,
  setAccessToken: (accessToken) => set({ accessToken }),
  clearTokens: () => set({ accessToken: null }),
}));

// Main auth store - no persistence, everything in memory
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  companies: [],
  currentCompany: null,
  isAuthenticated: false,
  isLoading: false,

  setAuth: (auth) => {
    // Store user data in memory only
    set({ 
      user: auth.user,
      companies: auth.companies,
      currentCompany: auth.currentCompany,
      isAuthenticated: true 
    });
    
    // Store access token in separate non-persisted store
    useTokenStore.getState().setAccessToken(auth.accessToken);
  },

  clearAuth: () => {
    set({ 
      user: null,
      companies: [],
      currentCompany: null,
      isAuthenticated: false 
    });
    useTokenStore.getState().clearTokens();
  },

  logout: () => {
    const { clearAuth } = get();
    clearAuth();
    // Clear refresh token cookie by calling logout endpoint
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    // Redirect to login page
    window.location.href = '/';
  },

  refreshTokens: async () => {
    try {
      // No need to send refresh token - it's in cookies
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: include cookies
      });

      if (response.ok) {
        const { accessToken } = await response.json();
        useTokenStore.getState().setAccessToken(accessToken);
        return true;
      }
      
      // If refresh fails, clear auth
      get().clearAuth();
      return false;
    } catch {
      get().clearAuth();
      return false;
    }
  },
}));
```

#### Using the Authenticated HTTP Client
```typescript
import { createAuthenticatedFetch } from '@/zustand/authStore';

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

### 3. Initialization Flow

When the app loads:
1. Check for refresh token cookie (automatic via browser)
2. If exists, use it to get new access token
3. Validate session to get user data and companies in one call
4. Store everything in memory (Zustand)
5. If no valid session, user sees login form

```typescript
// src/zustand/authStore.ts - initializeAuth()
export const initializeAuth = async () => {
  const { setAuth, refreshTokens } = useAuthStore.getState();
  const { accessToken } = useTokenStore.getState();
  
  // If we have a refresh token cookie but no access token, try to refresh
  if (!accessToken) {
    const refreshed = await refreshTokens();
    
    if (refreshed) {
      // After refresh, validate the session to get user data and companies
      try {
        const response = await fetch('/api/auth/validate', {
          headers: { 
            'Authorization': `Bearer ${useTokenStore.getState().accessToken}` 
          },
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.user) {
            setAuth({
              user: data.user,
              companies: data.companies || [],
              currentCompany: data.currentCompany || null,
              accessToken: useTokenStore.getState().accessToken!,
            });
          }
        }
      } catch {
        // Silent fail - user will need to login
      }
    }
  }
};
```

### 4. Component Integration

#### Auth Provider
```typescript
// src/components/AuthProvider.tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      await initializeAuth();
      setIsInitialized(true);
    };
    init();
  }, []);

  if (!isInitialized) {
    return <LoadingFallback />;
  }

  return (
    <AuthContext.Provider value={{}}>
      {children}
    </AuthContext.Provider>
  );
}
```

#### Protected Routes
```typescript
// src/components/AuthenticatedApp.tsx
export default function AuthenticatedApp({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  
  if (!isAuthenticated) {
    return <AuthForm />;
  }
  
  return <>{children}</>;
}
```

#### Custom Hook for API Calls
```typescript
// src/hooks/useApiWithCompany.ts
export function useApiWithCompany() {
  const { currentCompany } = useAuthStore();
  const httpClient = createAuthenticatedFetch();
  
  const fetchWithCompany = async (url: string, options: RequestInit = {}) => {
    if (!currentCompany) {
      throw new Error('No company selected');
    }
    
    return httpClient(url, {
      ...options,
      headers: {
        'x-company-id': currentCompany.id,
        ...options.headers,
      },
    });
  };
  
  return {
    fetchWithCompany,
    getWithCompany: (url: string) => fetchWithCompany(url),
    postWithCompany: (url: string, data: unknown) => fetchWithCompany(url, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    hasCompanyContext: !!currentCompany,
    currentCompany,
  };
}
```

## Memory-Only Architecture Benefits

### Security Advantages
1. **No XSS access** to stored user data
2. **No persistence** of sensitive information
3. **Clean logout** - memory cleared instantly
4. **Reduced attack surface** - no browser storage

### Performance Benefits
1. **Faster access** - memory is quicker than storage APIs
2. **No serialization** overhead
3. **Simpler state management** - no sync issues

### Developer Experience
1. **Simpler code** - no storage management
2. **Predictable behavior** - memory clears on refresh
3. **Easier testing** - no storage mocks needed

## Session Persistence

Even though we use memory-only storage, sessions persist across page refreshes because:

1. **Refresh token in HTTP-only cookie** survives page refresh
2. **On app initialization**, we check for the cookie
3. **If valid**, we get a new access token and fetch user data
4. **User stays logged in** seamlessly

This provides the best of both worlds:
- Security of memory-only storage
- Convenience of persistent sessions

## Migration from Browser Storage

### Remove All Storage Code
```typescript
// Before: Using sessionStorage/localStorage
const secureStorage = createJSONStorage(() => ({
  getItem: (name) => sessionStorage.getItem(name),
  setItem: (name, value) => sessionStorage.setItem(name, value),
  removeItem: (name) => sessionStorage.removeItem(name),
}));

// After: No storage at all
export const useAuthStore = create<AuthState>((set, get) => ({
  // State in memory only
}));
```

### Update Components
```typescript
// Before: Checking persisted state
const isAuthenticated = !!sessionStorage.getItem('auth-storage');

// After: Check Zustand memory state
const { isAuthenticated } = useAuthStore();
```

## Best Practices

### Security
1. **Never store tokens** in localStorage/sessionStorage
2. **Use HTTPS in production** for secure cookies
3. **Keep access tokens short-lived** (15 minutes)
4. **Rotate refresh tokens** on each use
5. **Clear memory on logout** completely

### Performance
1. **Initialize auth once** on app start
2. **Use selective subscriptions** in components
3. **Cache API responses** in Zustand when appropriate
4. **Avoid unnecessary re-renders** with proper selectors

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

#### "User logged out on refresh"
- **Cause**: Refresh token cookie missing or expired
- **Solution**: Check cookie in DevTools
- **Debug**: Verify cookie settings and domain

#### "Token expired" errors
- **Cause**: Access token lifetime exceeded
- **Solution**: Automatic refresh should handle this
- **Debug**: Check refresh endpoint response

#### "Cookies not being sent"
- **Cause**: Missing credentials in fetch
- **Solution**: Ensure `credentials: 'include'`
- **Debug**: Check Network tab for Cookie headers

#### "No company context" errors
- **Cause**: User hasn't selected a company or no companies available
- **Solution**: Check company selection UI
- **Debug**: Verify user-companies endpoint response

### Debug Tools

#### Browser DevTools
1. **Application > Cookies**: View refresh token cookie
2. **Network tab**: Check Authorization headers and x-company-id
3. **Console**: Monitor auth-related errors
4. **Memory Profiler**: Verify no storage leaks

## Production Checklist

- [ ] **HTTPS enabled** (required for Secure cookies)
- [ ] **Strong JWT secrets** (minimum 32 characters)
- [ ] **No browser storage** of sensitive data
- [ ] **CORS origins configured** properly
- [ ] **Rate limiting** on auth endpoints
- [ ] **Security headers** via middleware
- [ ] **Error logging** for auth failures
- [ ] **Session monitoring** for suspicious activity
- [ ] **Email verification** required for new accounts
- [ ] **Company context** validation on protected routes

## Summary

This authentication system provides:
- **Maximum security** with memory-only state and HTTP-only cookies
- **Zero persistence** of sensitive data in browser storage
- **Seamless UX** with automatic session restoration
- **Simple architecture** without storage complexity
- **Production-ready** security features
- **Multi-company support** with proper context isolation

The combination of JWT tokens, memory-only Zustand state, and HTTP-only cookies for refresh tokens creates the most secure authentication system possible for web applications while maintaining excellent user experience and developer ergonomics. 