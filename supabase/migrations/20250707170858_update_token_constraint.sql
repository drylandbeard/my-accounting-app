-- Update check_token_data constraint to allow accountant invitation tokens
-- Drop the existing constraint
ALTER TABLE email_verification_tokens DROP CONSTRAINT check_token_data;

-- Add updated constraint that includes accountant invitation tokens
ALTER TABLE email_verification_tokens ADD CONSTRAINT check_token_data 
    CHECK (
        (token_type = 'verification' AND user_id IS NOT NULL) OR
        (token_type = 'invitation' AND invited_email IS NOT NULL AND company_id IS NOT NULL AND invited_by_user_id IS NOT NULL) OR
        (token_type = 'acct_invite' AND invited_email IS NOT NULL AND accountant_id IS NOT NULL AND invited_by_user_id IS NOT NULL AND accountant_member_id IS NOT NULL)
    ); 