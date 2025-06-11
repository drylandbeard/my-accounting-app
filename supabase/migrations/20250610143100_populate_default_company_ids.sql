-- Populate existing records with default company IDs
-- This ensures existing data is not orphaned after adding company_id constraints

-- First, ensure there's at least one company (create a default one if needed)
INSERT INTO companies (id, name, description, created_at, updated_at)
SELECT 
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Default Company',
  'Default company for existing data',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM companies LIMIT 1);

-- Get the first available company ID to use as default
DO $$
DECLARE
    default_company_id UUID;
BEGIN
    -- Get the first company ID
    SELECT id INTO default_company_id FROM companies ORDER BY created_at LIMIT 1;
    
    -- Update plaid_items that don't have company_id
    UPDATE plaid_items 
    SET company_id = default_company_id 
    WHERE company_id IS NULL;
    
    -- Update accounts that don't have company_id
    UPDATE accounts 
    SET company_id = default_company_id 
    WHERE company_id IS NULL;
    
    -- Update chart_of_accounts that don't have company_id
    UPDATE chart_of_accounts 
    SET company_id = default_company_id 
    WHERE company_id IS NULL;
    
    -- Update categorization_rules that don't have company_id
    UPDATE categorization_rules 
    SET company_id = default_company_id 
    WHERE company_id IS NULL;
    
    -- Update imported_transactions that don't have company_id
    UPDATE imported_transactions 
    SET company_id = default_company_id 
    WHERE company_id IS NULL;
    
    -- Update journal that don't have company_id
    UPDATE journal 
    SET company_id = default_company_id 
    WHERE company_id IS NULL;
    
    -- Update transactions that don't have company_id
    UPDATE transactions 
    SET company_id = default_company_id 
    WHERE company_id IS NULL;
END $$;

-- Now make company_id NOT NULL for all tables
ALTER TABLE plaid_items ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE accounts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE chart_of_accounts ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE categorization_rules ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE imported_transactions ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE journal ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN company_id SET NOT NULL; 