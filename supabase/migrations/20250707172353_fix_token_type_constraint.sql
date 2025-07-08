-- Fix check_token_type constraint to allow accountant invitation tokens

-- First, let's see what the current constraint looks like and drop it
ALTER TABLE email_verification_tokens DROP CONSTRAINT IF EXISTS check_token_type;

-- Add updated constraint that includes accountant invitation tokens
ALTER TABLE email_verification_tokens ADD CONSTRAINT check_token_type 
    CHECK (
        (token_type = 'verification' AND user_id IS NOT NULL) OR
        (token_type = 'invitation' AND invited_email IS NOT NULL AND company_id IS NOT NULL AND invited_by_user_id IS NOT NULL) OR
        (token_type = 'acct_invite' AND invited_email IS NOT NULL AND accountant_id IS NOT NULL AND invited_by_user_id IS NOT NULL AND accountant_member_id IS NOT NULL)
    );

-- Also need to add the accountant_member_id column if it doesn't exist
ALTER TABLE email_verification_tokens 
    ADD COLUMN IF NOT EXISTS accountant_member_id UUID REFERENCES accountant_members_list(id) ON DELETE CASCADE;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_accountant_member_id 
    ON email_verification_tokens(accountant_member_id); 