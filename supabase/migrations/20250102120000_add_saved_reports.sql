-- Add saved_reports table for storing custom reports
CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('balance-sheet', 'pnl', 'cash-flow')),
  description TEXT,
  parameters JSONB NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

-- Policy for users to view saved reports for their company
CREATE POLICY "Users can view saved reports for their company" ON saved_reports
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM company_users 
      WHERE user_id = auth.uid()
    )
  );

-- Policy for users to create saved reports for their company
CREATE POLICY "Users can create saved reports for their company" ON saved_reports
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_users 
      WHERE user_id = auth.uid()
    )
  );

-- Policy for users to update saved reports for their company
CREATE POLICY "Users can update saved reports for their company" ON saved_reports
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM company_users 
      WHERE user_id = auth.uid()
    )
  );

-- Policy for users to delete saved reports for their company
CREATE POLICY "Users can delete saved reports for their company" ON saved_reports
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM company_users 
      WHERE user_id = auth.uid()
    )
  );

-- Add indexes for performance
CREATE INDEX idx_saved_reports_company_id ON saved_reports(company_id);
CREATE INDEX idx_saved_reports_type ON saved_reports(type);
CREATE INDEX idx_saved_reports_created_at ON saved_reports(created_at DESC);