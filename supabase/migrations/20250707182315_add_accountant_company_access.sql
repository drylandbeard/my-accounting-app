-- Create accountant_company_access table for tracking company-specific access grants
CREATE TABLE IF NOT EXISTS accountant_company_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    accountant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- ATM's user_id
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure unique access grant per accountant-member-company combination
    UNIQUE(accountant_id, member_user_id, company_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_accountant_company_access_accountant_id ON accountant_company_access(accountant_id);
CREATE INDEX idx_accountant_company_access_member_user_id ON accountant_company_access(member_user_id);
CREATE INDEX idx_accountant_company_access_company_id ON accountant_company_access(company_id);
CREATE INDEX idx_accountant_company_access_active ON accountant_company_access(is_active);

-- Create updated_at trigger
CREATE TRIGGER update_accountant_company_access_updated_at
    BEFORE UPDATE ON accountant_company_access
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE accountant_company_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Accountants can manage access grants for their team members
CREATE POLICY "Accountants can manage company access for their team members" 
    ON accountant_company_access 
    FOR ALL 
    USING (
        -- Accountant can see/manage grants they created
        accountant_id = auth.uid() 
        OR 
        -- Team members can view their own access grants
        member_user_id = auth.uid()
    );

-- Add constraint to ensure accountant_id references a user with role 'Accountant'
-- This will be enforced at the application level since cross-table constraints are complex

-- Add constraint to ensure member_user_id is linked to accountant_members_list
-- This will also be enforced at the application level for flexibility

-- Add comments to document the table purpose
COMMENT ON TABLE accountant_company_access IS 'Tracks company-specific access grants from accountants to their team members (ATMs)';
COMMENT ON COLUMN accountant_company_access.accountant_id IS 'ID of the accountant granting access';
COMMENT ON COLUMN accountant_company_access.member_user_id IS 'User ID of the team member (ATM) receiving access';
COMMENT ON COLUMN accountant_company_access.company_id IS 'Company being granted access to';
COMMENT ON COLUMN accountant_company_access.is_active IS 'Whether this access grant is currently active'; 