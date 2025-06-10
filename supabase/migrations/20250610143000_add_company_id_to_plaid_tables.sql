-- Add company_id to tables that need it for multi-company support

-- Add company_id to chart_of_accounts
ALTER TABLE chart_of_accounts ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to categorization_rules  
ALTER TABLE categorization_rules ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to imported_transactions
ALTER TABLE imported_transactions ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to journal
ALTER TABLE journal ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Add company_id to transactions
ALTER TABLE transactions ADD COLUMN company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- Create indexes for better performance
CREATE INDEX idx_chart_of_accounts_company_id ON chart_of_accounts(company_id);
CREATE INDEX idx_categorization_rules_company_id ON categorization_rules(company_id);
CREATE INDEX idx_imported_transactions_company_id ON imported_transactions(company_id);
CREATE INDEX idx_journal_company_id ON journal(company_id);
CREATE INDEX idx_transactions_company_id ON transactions(company_id);

-- Update unique constraints to include company_id
ALTER TABLE chart_of_accounts DROP CONSTRAINT chart_of_accounts_unique_name_type_subtype;
ALTER TABLE chart_of_accounts ADD CONSTRAINT chart_of_accounts_unique_name_type_subtype_company UNIQUE (name, type, subtype, company_id);

-- Update accounts unique constraint to include company_id
ALTER TABLE accounts DROP CONSTRAINT accounts_plaid_account_id_key;
ALTER TABLE accounts ADD CONSTRAINT accounts_plaid_account_id_company_id_key UNIQUE (plaid_account_id, company_id); 