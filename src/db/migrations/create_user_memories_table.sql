-- Create user_memories table for storing memory entries
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  importance_score INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);

-- Create index on importance_score for sorting
CREATE INDEX IF NOT EXISTS idx_user_memories_importance ON user_memories(importance_score DESC);

-- Create index on created_at for sorting by recency
CREATE INDEX IF NOT EXISTS idx_user_memories_created_at ON user_memories(created_at DESC);

-- Add RLS policies to ensure users can only access their own memories
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- Policy for users to select their own memories
CREATE POLICY user_memories_select_policy ON user_memories
  FOR SELECT USING (auth.uid() = user_id);

-- Policy for users to insert their own memories
CREATE POLICY user_memories_insert_policy ON user_memories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for users to update their own memories
CREATE POLICY user_memories_update_policy ON user_memories
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy for users to delete their own memories
CREATE POLICY user_memories_delete_policy ON user_memories
  FOR DELETE USING (auth.uid() = user_id);
