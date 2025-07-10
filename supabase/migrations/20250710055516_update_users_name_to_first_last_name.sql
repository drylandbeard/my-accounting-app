-- Update users table to use first_name and last_name instead of name
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Migrate existing name data to first_name (if any)
-- Split existing name on first space, put first part in first_name, rest in last_name
UPDATE users 
SET 
  first_name = CASE 
    WHEN name IS NOT NULL AND position(' ' in name) > 0 
    THEN split_part(name, ' ', 1)
    ELSE COALESCE(name, '')
  END,
  last_name = CASE 
    WHEN name IS NOT NULL AND position(' ' in name) > 0 
    THEN substring(name from position(' ' in name) + 1)
    ELSE ''
  END
WHERE name IS NOT NULL;

-- Remove the old name column
ALTER TABLE users DROP COLUMN IF EXISTS name;

-- Update accountant_members_list table as well if it has a name column
ALTER TABLE accountant_members_list 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Migrate existing name data in accountant_members_list
UPDATE accountant_members_list 
SET 
  first_name = CASE 
    WHEN name IS NOT NULL AND position(' ' in name) > 0 
    THEN split_part(name, ' ', 1)
    ELSE COALESCE(name, '')
  END,
  last_name = CASE 
    WHEN name IS NOT NULL AND position(' ' in name) > 0 
    THEN substring(name from position(' ' in name) + 1)
    ELSE ''
  END
WHERE name IS NOT NULL;

-- Remove the old name column from accountant_members_list
ALTER TABLE accountant_members_list DROP COLUMN IF EXISTS name;
