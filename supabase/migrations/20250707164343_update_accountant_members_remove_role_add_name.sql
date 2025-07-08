-- Remove role column from accountant_members table
ALTER TABLE accountant_members DROP COLUMN IF EXISTS role;

-- Add name column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT; 