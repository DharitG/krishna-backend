-- Check if user_accounts table exists, if not create it
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
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_user_accounts_user_id ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_service_name ON user_accounts(service_name);
CREATE INDEX IF NOT EXISTS idx_user_accounts_is_active ON user_accounts(is_active);

-- Add sample data if the table is empty
INSERT INTO user_accounts (id, user_id, service_name, username, email, workspace, is_active)
SELECT 
  gen_random_uuid(), -- Generate a random UUID for id
  '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a', -- This is the user ID from your logs
  'github',
  'user1',
  'user1@github.com',
  NULL,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM user_accounts WHERE service_name = 'github' AND user_id = '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a'
);

-- Add a slack account
INSERT INTO user_accounts (id, user_id, service_name, username, email, workspace, is_active)
SELECT 
  gen_random_uuid(),
  '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a',
  'slack',
  'user1',
  NULL,
  'Workspace 1',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM user_accounts WHERE service_name = 'slack' AND user_id = '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a'
);

-- Add a gmail account
INSERT INTO user_accounts (id, user_id, service_name, username, email, workspace, is_active)
SELECT 
  gen_random_uuid(),
  '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a',
  'gmail',
  NULL,
  'user@gmail.com',
  NULL,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM user_accounts WHERE service_name = 'gmail' AND user_id = '8d72ecc8-a2ce-4850-9e0d-14dd3c745d6a'
);
