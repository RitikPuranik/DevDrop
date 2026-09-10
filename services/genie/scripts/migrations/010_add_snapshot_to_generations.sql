-- Add snapshot_id column to generations table (UUID to match codebase_snapshots.id)
ALTER TABLE generations
ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES codebase_snapshots(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_generations_snapshot_id ON generations(snapshot_id);

-- Comment explaining the migration
COMMENT ON COLUMN generations.snapshot_id IS 'Reference to codebase snapshot in storage (preferred over storing files directly in DB)';
