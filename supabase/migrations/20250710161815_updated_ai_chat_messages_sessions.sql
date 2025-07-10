-- Update ai_chat_history for improved functionality
-- This migration updates the existing ai_chat_sessions and ai_chat_messages tables

-- Drop existing tables if they exist to recreate with proper structure
DROP TABLE IF EXISTS ai_chat_messages CASCADE;
DROP TABLE IF EXISTS ai_chat_sessions CASCADE;

-- Create ai_chat_sessions table
CREATE TABLE ai_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Add constraints
  CONSTRAINT ai_chat_sessions_company_user_unique UNIQUE (company_id, user_id, is_active)
);

-- Create ai_chat_messages table
CREATE TABLE ai_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  has_confirmation BOOLEAN DEFAULT false,
  pending_action JSONB,
  is_error BOOLEAN DEFAULT false,
  error_details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message_order INTEGER NOT NULL DEFAULT 0
);

-- Create indexes for performance
CREATE INDEX idx_ai_chat_sessions_company_id ON ai_chat_sessions(company_id);
CREATE INDEX idx_ai_chat_sessions_user_id ON ai_chat_sessions(user_id);
CREATE INDEX idx_ai_chat_sessions_created_at ON ai_chat_sessions(created_at DESC);
CREATE INDEX idx_ai_chat_sessions_active ON ai_chat_sessions(is_active, company_id, user_id);
CREATE INDEX idx_ai_chat_messages_session_id ON ai_chat_messages(session_id);
CREATE INDEX idx_ai_chat_messages_created_at ON ai_chat_messages(created_at DESC);
CREATE INDEX idx_ai_chat_messages_order ON ai_chat_messages(session_id, message_order);

-- Add composite index for company and user lookup
CREATE INDEX idx_ai_chat_sessions_company_user ON ai_chat_sessions(company_id, user_id);

-- Add RLS policies for security
ALTER TABLE ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy for ai_chat_sessions: Users can only access their own sessions within their companies
CREATE POLICY "Users can view their own chat sessions" ON ai_chat_sessions
  FOR SELECT USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM company_users
      WHERE company_users.company_id = ai_chat_sessions.company_id
      AND company_users.user_id = auth.uid()
      AND company_users.is_active = true
    )
  );

CREATE POLICY "Users can create chat sessions in their companies" ON ai_chat_sessions
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM company_users
      WHERE company_users.company_id = ai_chat_sessions.company_id
      AND company_users.user_id = auth.uid()
      AND company_users.is_active = true
    )
  );

CREATE POLICY "Users can update their own chat sessions" ON ai_chat_sessions
  FOR UPDATE USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM company_users
      WHERE company_users.company_id = ai_chat_sessions.company_id
      AND company_users.user_id = auth.uid()
      AND company_users.is_active = true
    )
  );

CREATE POLICY "Users can delete their own chat sessions" ON ai_chat_sessions
  FOR DELETE USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM company_users
      WHERE company_users.company_id = ai_chat_sessions.company_id
      AND company_users.user_id = auth.uid()
      AND company_users.is_active = true
    )
  );

-- Policy for ai_chat_messages: Users can only access messages from their sessions
CREATE POLICY "Users can view messages from their sessions" ON ai_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ai_chat_sessions
      WHERE ai_chat_sessions.id = ai_chat_messages.session_id
      AND ai_chat_sessions.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM company_users
        WHERE company_users.company_id = ai_chat_sessions.company_id
        AND company_users.user_id = auth.uid()
        AND company_users.is_active = true
      )
    )
  );

CREATE POLICY "Users can create messages in their sessions" ON ai_chat_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_chat_sessions
      WHERE ai_chat_sessions.id = ai_chat_messages.session_id
      AND ai_chat_sessions.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM company_users
        WHERE company_users.company_id = ai_chat_sessions.company_id
        AND company_users.user_id = auth.uid()
        AND company_users.is_active = true
      )
    )
  );

CREATE POLICY "Users can update messages in their sessions" ON ai_chat_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM ai_chat_sessions
      WHERE ai_chat_sessions.id = ai_chat_messages.session_id
      AND ai_chat_sessions.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM company_users
        WHERE company_users.company_id = ai_chat_sessions.company_id
        AND company_users.user_id = auth.uid()
        AND company_users.is_active = true
      )
    )
  );

CREATE POLICY "Users can delete messages from their sessions" ON ai_chat_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM ai_chat_sessions
      WHERE ai_chat_sessions.id = ai_chat_messages.session_id
      AND ai_chat_sessions.user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM company_users
        WHERE company_users.company_id = ai_chat_sessions.company_id
        AND company_users.user_id = auth.uid()
        AND company_users.is_active = true
      )
    )
  );

-- Function to automatically set message order
CREATE OR REPLACE FUNCTION set_message_order()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.message_order = 0 THEN
    SELECT COALESCE(MAX(message_order), 0) + 1 
    INTO NEW.message_order
    FROM ai_chat_messages 
    WHERE session_id = NEW.session_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for message ordering
CREATE TRIGGER set_message_order_trigger
BEFORE INSERT ON ai_chat_messages
FOR EACH ROW
EXECUTE FUNCTION set_message_order();

-- Function to clean up old inactive sessions (optional, can be called via cron)
CREATE OR REPLACE FUNCTION cleanup_old_chat_sessions()
RETURNS void AS $$
BEGIN
  -- Delete sessions older than 30 days that are inactive
  DELETE FROM ai_chat_sessions
  WHERE is_active = false
  AND created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger for ai_chat_sessions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_chat_sessions_updated_at
BEFORE UPDATE ON ai_chat_sessions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Function to ensure only one active session per user per company
CREATE OR REPLACE FUNCTION ensure_single_active_session()
RETURNS TRIGGER AS $$
BEGIN
  -- If this is being set to active, deactivate all others for this user/company
  IF NEW.is_active = true THEN
    UPDATE ai_chat_sessions 
    SET is_active = false, updated_at = NOW()
    WHERE company_id = NEW.company_id 
    AND user_id = NEW.user_id 
    AND id != NEW.id 
    AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to ensure single active session
CREATE TRIGGER ensure_single_active_session_trigger
BEFORE INSERT OR UPDATE ON ai_chat_sessions
FOR EACH ROW
EXECUTE FUNCTION ensure_single_active_session();
