-- Performance optimization indexes for transaction queries
-- Run this migration to improve query performance

-- Index for imported_transactions company queries
CREATE INDEX IF NOT EXISTS idx_imported_transactions_company_id 
ON imported_transactions(company_id);

-- Index for imported_transactions account queries 
CREATE INDEX IF NOT EXISTS idx_imported_transactions_plaid_account_id 
ON imported_transactions(plaid_account_id);

-- Composite index for the main filtering query
CREATE INDEX IF NOT EXISTS idx_imported_transactions_company_account 
ON imported_transactions(company_id, plaid_account_id);

-- Index for transactions company queries
CREATE INDEX IF NOT EXISTS idx_transactions_company_id 
ON transactions(company_id);

-- Index for transactions account queries
CREATE INDEX IF NOT EXISTS idx_transactions_plaid_account_id 
ON transactions(plaid_account_id);

-- Composite index for the main filtering query
CREATE INDEX IF NOT EXISTS idx_transactions_company_account 
ON transactions(company_id, plaid_account_id);

-- Index for chart_of_accounts company queries
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company_id 
ON chart_of_accounts(company_id);

-- Index for chart_of_accounts plaid_account_id lookups
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_plaid_account_id 
ON chart_of_accounts(plaid_account_id);

-- Index for payees company queries
CREATE INDEX IF NOT EXISTS idx_payees_company_id 
ON payees(company_id);

-- Index for payees name ordering
CREATE INDEX IF NOT EXISTS idx_payees_company_name 
ON payees(company_id, name);

-- Index for accounts company queries
CREATE INDEX IF NOT EXISTS idx_accounts_company_id 
ON accounts(company_id);

-- Index for accounts ordering
CREATE INDEX IF NOT EXISTS idx_accounts_company_display_order 
ON accounts(company_id, display_order, created_at);

-- Index for automations company and enabled queries
CREATE INDEX IF NOT EXISTS idx_automations_company_enabled 
ON automations(company_id, enabled);

-- Index for journal entries
CREATE INDEX IF NOT EXISTS idx_journal_company_id 
ON journal(company_id);

-- Index for journal transaction lookups
CREATE INDEX IF NOT EXISTS idx_journal_transaction_id 
ON journal(transaction_id);

-- Add date indexes for better date range queries
CREATE INDEX IF NOT EXISTS idx_imported_transactions_date 
ON imported_transactions(date DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_date 
ON transactions(date DESC);

-- Add text search indexes for descriptions if using full text search
-- CREATE INDEX IF NOT EXISTS idx_imported_transactions_description_search 
-- ON imported_transactions USING gin(to_tsvector('english', description));

-- CREATE INDEX IF NOT EXISTS idx_transactions_description_search 
-- ON transactions USING gin(to_tsvector('english', description)); 