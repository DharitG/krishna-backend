-- Create user_accounts table for storing user's connected service accounts
CREATE TABLE IF NOT EXISTS user_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  service_name TEXT NOT NULL,
  username TEXT,
  email TEXT,
  workspace TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Add foreign key constraint to users table if it exists
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Add unique constraint to prevent duplicate accounts
  CONSTRAINT unique_user_service_account UNIQUE (user_id, service_name, COALESCE(email, ''), COALESCE(username, ''))
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_accounts_user_id ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_service_name ON user_accounts(service_name);
CREATE INDEX IF NOT EXISTS idx_user_accounts_is_active ON user_accounts(is_active);

-- Add RLS (Row Level Security) policies
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;

-- Policy for users to view only their own accounts
CREATE POLICY user_accounts_select_policy ON user_accounts
  FOR SELECT USING (auth.uid() = user_id);

-- Policy for users to insert only their own accounts
CREATE POLICY user_accounts_insert_policy ON user_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for users to update only their own accounts
CREATE POLICY user_accounts_update_policy ON user_accounts
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy for users to delete only their own accounts
CREATE POLICY user_accounts_delete_policy ON user_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update the updated_at timestamp
CREATE TRIGGER update_user_accounts_updated_at
BEFORE UPDATE ON user_accounts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
