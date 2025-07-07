-- Create accountant_members_list table for storing team member info
CREATE TABLE IF NOT EXISTS accountant_members_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accountant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_access_enabled BOOLEAN DEFAULT false, -- true when they accept invitation
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- set when they create account
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure unique email per accountant
    UNIQUE(accountant_id, email)
);

-- Create indexes for better query performance
CREATE INDEX idx_accountant_members_list_accountant_id ON accountant_members_list(accountant_id);
CREATE INDEX idx_accountant_members_list_email ON accountant_members_list(email);
CREATE INDEX idx_accountant_members_list_active ON accountant_members_list(is_active);
CREATE INDEX idx_accountant_members_list_access_enabled ON accountant_members_list(is_access_enabled);

-- Create updated_at trigger
CREATE TRIGGER update_accountant_members_list_updated_at
    BEFORE UPDATE ON accountant_members_list
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE accountant_members_list ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Accountants can manage their own team members
CREATE POLICY "Accountants can manage their team members list" 
    ON accountant_members_list 
    FOR ALL 
    USING (accountant_id = auth.uid());

-- Team members can view their own record (when they have user_id set)
CREATE POLICY "Team members can view their own record" 
    ON accountant_members_list 
    FOR SELECT 
    USING (user_id = auth.uid());

-- Update email_verification_tokens to reference accountant_members_list
ALTER TABLE email_verification_tokens 
    ADD COLUMN IF NOT EXISTS accountant_member_id UUID REFERENCES accountant_members_list(id) ON DELETE CASCADE;

-- Add index for accountant member invitations
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_accountant_member_id 
    ON email_verification_tokens(accountant_member_id); 