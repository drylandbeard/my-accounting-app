/**
 * Generate a secure verification token
 */
export function generateVerificationToken(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a 6-digit verification code
 */
export function generateVerificationCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}

/**
 * Create verification URL
 */
export function createVerificationUrl(token: string): string {
  const baseUrl = process.env.NODE_ENV === "development" 
    ? "http://localhost:3000" 
    : process.env.NEXT_PUBLIC_BASE_URL || "https://www.use-switch.com";
  return `${baseUrl}/verify-email?token=${token}`;
} 