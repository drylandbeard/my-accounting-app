-- Add team invitation support to email verification tokens
-- Extend the existing table to support different token types

-- Add token_type column to distinguish between verification and invitation tokens
ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS token_type VARCHAR(20) DEFAULT 'verification';

-- Add invitation-specific columns
ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS invited_by_user_id UUID REFERENCES users(id);
ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS invited_role VARCHAR(20);
ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS invited_email VARCHAR(255);

-- Update existing rows to have 'verification' type
UPDATE email_verification_tokens SET token_type = 'verification' WHERE token_type IS NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_type ON email_verification_tokens(token_type);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_company ON email_verification_tokens(company_id);

-- Add constraint to ensure token_type is valid
ALTER TABLE email_verification_tokens ADD CONSTRAINT check_token_type 
    CHECK (token_type IN ('verification', 'invitation')); 