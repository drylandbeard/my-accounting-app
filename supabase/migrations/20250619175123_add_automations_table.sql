-- Create automations table for both payee and category automations
CREATE TABLE automations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    automation_type TEXT NOT NULL CHECK (automation_type IN ('payee', 'category')),
    condition_type TEXT NOT NULL CHECK (condition_type IN ('contains', 'equals', 'starts_with', 'ends_with')),
    condition_value TEXT NOT NULL,
    action_value TEXT NOT NULL, -- This will be payee_name or category_name depending on type
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX idx_automations_company_id ON automations(company_id);
CREATE INDEX idx_automations_type ON automations(automation_type);
CREATE INDEX idx_automations_enabled ON automations(enabled);

-- Add RLS (Row Level Security)
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view automations for their company" ON automations
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM company_users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert automations for their company" ON automations
    FOR INSERT WITH CHECK (
        company_id IN (
            SELECT company_id FROM company_users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update automations for their company" ON automations
    FOR UPDATE USING (
        company_id IN (
            SELECT company_id FROM company_users 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete automations for their company" ON automations
    FOR DELETE USING (
        company_id IN (
            SELECT company_id FROM company_users 
            WHERE user_id = auth.uid()
        )
    );

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_automations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_automations_updated_at
    BEFORE UPDATE ON automations
    FOR EACH ROW
    EXECUTE FUNCTION update_automations_updated_at();
