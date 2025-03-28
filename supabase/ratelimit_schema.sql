-- Rate limiting schema for subscription tiers
-- This schema creates tables to track user request counts for rate limiting

-- Table to track user request counts per day
CREATE TABLE IF NOT EXISTS user_request_counts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint to ensure one record per user per day
  UNIQUE(user_id, date)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS user_request_counts_user_id_date_idx ON user_request_counts(user_id, date);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update the updated_at column
DROP TRIGGER IF EXISTS update_user_request_counts_updated_at ON user_request_counts;
CREATE TRIGGER update_user_request_counts_updated_at
BEFORE UPDATE ON user_request_counts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies for user_request_counts
ALTER TABLE user_request_counts ENABLE ROW LEVEL SECURITY;

-- Only allow users to see their own request counts
CREATE POLICY "Users can view their own request counts"
  ON user_request_counts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Only allow the service role to insert/update request counts
CREATE POLICY "Service role can manage request counts"
  ON user_request_counts
  USING (auth.role() = 'service_role');
