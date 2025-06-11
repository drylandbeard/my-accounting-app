-- Create payees table
CREATE TABLE IF NOT EXISTS payees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, company_id)
);

-- Add payee_id to transactions table
ALTER TABLE transactions ADD COLUMN payee_id UUID REFERENCES payees(id) ON DELETE SET NULL;

-- Add payee_id to imported_transactions table  
ALTER TABLE imported_transactions ADD COLUMN payee_id UUID REFERENCES payees(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX idx_payees_company_id ON payees(company_id);
CREATE INDEX idx_transactions_payee_id ON transactions(payee_id);
CREATE INDEX idx_imported_transactions_payee_id ON imported_transactions(payee_id);

-- Add updated_at trigger for payees
CREATE TRIGGER update_payees_updated_at BEFORE UPDATE ON payees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 