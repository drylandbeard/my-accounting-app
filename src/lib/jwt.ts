import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate access and refresh tokens
 */
export function generateTokens(payload: { userId: string; email: string }) {
  const accessToken = jwt.sign(
    { userId: payload.userId, email: payload.email },
    JWT_SECRET,
    { expiresIn: '15m' } // Short-lived access token
  );
  
  const refreshToken = jwt.sign(
    { userId: payload.userId },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' } // Longer-lived refresh token
  );
  
  return { accessToken, refreshToken };
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Extract user ID from request authorization header
 */
export function getUserIdFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const payload = verifyAccessToken(token);
  
  return payload?.userId || null;
}

/**
 * Middleware to validate JWT tokens
 */
export function withAuth<T extends unknown[]>(
  handler: (req: NextRequest, userId: string, ...args: T) => Promise<Response>
) {
  return async (req: NextRequest, ...args: T): Promise<Response> => {
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    return handler(req, userId, ...args);
  };
}

/**
 * Extract token from authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
} 