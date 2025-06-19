-- Fix constraints for invitation tokens
-- Make user_id nullable and add proper validation

-- Remove NOT NULL constraint from user_id since invitation tokens don't have user_id initially
ALTER TABLE email_verification_tokens ALTER COLUMN user_id DROP NOT NULL;

-- Add constraint to ensure data integrity based on token type
ALTER TABLE email_verification_tokens ADD CONSTRAINT check_token_data 
    CHECK (
        (token_type = 'verification' AND user_id IS NOT NULL) OR
        (token_type = 'invitation' AND invited_email IS NOT NULL AND company_id IS NOT NULL AND invited_by_user_id IS NOT NULL)
    ); 