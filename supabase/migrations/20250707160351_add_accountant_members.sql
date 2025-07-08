-- Create accountant_members table
CREATE TABLE IF NOT EXISTS accountant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accountant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'Member' CHECK (role IN ('Member', 'Senior Member')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure unique relationship between accountant and member
    UNIQUE(accountant_id, member_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_accountant_members_accountant_id ON accountant_members(accountant_id);
CREATE INDEX idx_accountant_members_member_id ON accountant_members(member_id);
CREATE INDEX idx_accountant_members_active ON accountant_members(is_active);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_accountant_members_updated_at
    BEFORE UPDATE ON accountant_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE accountant_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Accountants can manage their own team members
CREATE POLICY "Accountants can manage their team members" 
    ON accountant_members 
    FOR ALL 
    USING (accountant_id = auth.uid() OR member_id = auth.uid());

-- Add constraint to ensure accountant_id references a user with role 'Accountant'
-- Note: This is a soft constraint - we'll enforce it in the application layer
-- since we can't easily reference the role column in a CHECK constraint across tables

-- Add token_type for accountant invitations to email_verification_tokens
-- We'll use 'accountant_invitation' as the token type
ALTER TABLE email_verification_tokens 
    ADD COLUMN IF NOT EXISTS accountant_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Add index for accountant invitations
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_accountant_id 
    ON email_verification_tokens(accountant_id); 