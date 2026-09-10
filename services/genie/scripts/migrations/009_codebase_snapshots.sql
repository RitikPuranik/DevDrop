-- Codebase Snapshots Table
-- Tracks uploaded codebase snapshots stored in Supabase Storage

CREATE TABLE IF NOT EXISTS codebase_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  generation_id TEXT REFERENCES generations(id) ON DELETE SET NULL, -- Changed to TEXT to match generations.id type
  file_count INTEGER NOT NULL,
  total_size BIGINT NOT NULL, -- Size in bytes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Auto-cleanup after expiry
  CONSTRAINT positive_file_count CHECK (file_count > 0),
  CONSTRAINT positive_total_size CHECK (total_size > 0)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_codebase_snapshots_user_id ON codebase_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_codebase_snapshots_generation_id ON codebase_snapshots(generation_id);
CREATE INDEX IF NOT EXISTS idx_codebase_snapshots_expires_at ON codebase_snapshots(expires_at) WHERE expires_at IS NOT NULL;

-- RLS Policies
ALTER TABLE codebase_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can only see their own snapshots
CREATE POLICY "Users can view own snapshots"
  ON codebase_snapshots
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- Users can create snapshots
CREATE POLICY "Users can create snapshots"
  ON codebase_snapshots
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- Users can delete their own snapshots
CREATE POLICY "Users can delete own snapshots"
  ON codebase_snapshots
  FOR DELETE
  USING (auth.uid()::text = user_id);

-- Storage bucket policy (if not exists)
-- Note: This needs to be run in Supabase Storage UI or via dashboard
-- The bucket "project-files" should already exist

COMMENT ON TABLE codebase_snapshots IS 'Tracks codebase snapshots stored in Supabase Storage';
COMMENT ON COLUMN codebase_snapshots.id IS 'Unique snapshot identifier (also used as storage path)';
COMMENT ON COLUMN codebase_snapshots.user_id IS 'Owner of the snapshot';
COMMENT ON COLUMN codebase_snapshots.generation_id IS 'Associated generation (optional)';
COMMENT ON COLUMN codebase_snapshots.file_count IS 'Number of files in snapshot';
COMMENT ON COLUMN codebase_snapshots.total_size IS 'Total size of all files in bytes';
COMMENT ON COLUMN codebase_snapshots.expires_at IS 'When to automatically delete this snapshot';
