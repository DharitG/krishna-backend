-- Drop memory_entries table
DROP TABLE IF EXISTS memory_entries;

-- Drop vector index if it exists
DROP INDEX IF EXISTS idx_memory_entries_embedding;

-- Note: We're not dropping the pgvector extension as it might be used by other parts of the system
-- If you're sure it's not used elsewhere, you can uncomment the line below
-- DROP EXTENSION IF EXISTS vector;
