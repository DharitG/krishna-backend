-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create memory_entries table for storing vectorized content
CREATE TABLE IF NOT EXISTS memory_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  embedding VECTOR(1536), -- For OpenAI's text-embedding-large model
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  source VARCHAR(50) NOT NULL,
  context JSONB DEFAULT '{}'::jsonb
);

-- Create vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_memory_entries_embedding ON memory_entries 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index on user_id for filtering
CREATE INDEX IF NOT EXISTS idx_memory_entries_user_id ON memory_entries(user_id);

-- Create index on source for filtering
CREATE INDEX IF NOT EXISTS idx_memory_entries_source ON memory_entries(source);

-- Create index on created_at for time-based filtering
CREATE INDEX IF NOT EXISTS idx_memory_entries_created_at ON memory_entries(created_at);

-- Enable Row Level Security
ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to view only their own memory entries
CREATE POLICY "Users can view only their own memory entries" 
  ON memory_entries FOR SELECT 
  USING (auth.uid() = user_id);

-- Create policy to allow users to insert only their own memory entries
CREATE POLICY "Users can insert only their own memory entries" 
  ON memory_entries FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to update only their own memory entries
CREATE POLICY "Users can update only their own memory entries" 
  ON memory_entries FOR UPDATE 
  USING (auth.uid() = user_id);

-- Create policy to allow users to delete only their own memory entries
CREATE POLICY "Users can delete only their own memory entries" 
  ON memory_entries FOR DELETE 
  USING (auth.uid() = user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_memory_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update the updated_at timestamp
CREATE TRIGGER update_memory_entries_updated_at
BEFORE UPDATE ON memory_entries
FOR EACH ROW
EXECUTE FUNCTION update_memory_entries_updated_at();
