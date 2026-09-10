-- DevDrop ai-service baseline schema.
-- Genie is the internal engine; DevDrop owns authentication and user IDs.
-- IMPORTANT: DevDrop user IDs are strings (Mongo/ObjectId), not Supabase UUIDs.
-- Therefore service-owned user_id columns intentionally use TEXT and do not
-- reference auth.users. The ai-service uses the Supabase service role.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  total_lines INTEGER NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  embedding_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  files JSONB,
  project_context TEXT,
  target_language TEXT,
  complexity TEXT,
  agents TEXT[] NOT NULL DEFAULT ARRAY['CodeGenerator']::TEXT[],
  image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  agent_thoughts JSONB,
  preview_url TEXT,
  deployment_status TEXT NOT NULL DEFAULT 'pending',
  deployment_error TEXT,
  deployment_started_at TIMESTAMPTZ,
  deployment_completed_at TIMESTAMPTZ,
  deployment_logs TEXT,
  deployment_progress JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generations_user_created
  ON public.generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_status
  ON public.generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_deployment_status
  ON public.generations(deployment_status);
CREATE INDEX IF NOT EXISTS idx_generations_agents
  ON public.generations USING GIN (agents);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id TEXT NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  token_count INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_generation_id
  ON public.chat_messages(generation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at
  ON public.chat_messages(generation_id, created_at);

CREATE TABLE IF NOT EXISTS public.chat_jobs (
  id TEXT PRIMARY KEY,
  generation_id TEXT NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  current_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  language TEXT,
  image_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  result JSONB,
  error TEXT,
  progress_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_jobs_generation_id ON public.chat_jobs(generation_id);
CREATE INDEX IF NOT EXISTS idx_chat_jobs_user_id ON public.chat_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_jobs_status ON public.chat_jobs(status);
CREATE INDEX IF NOT EXISTS idx_chat_jobs_created_at ON public.chat_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_jobs_progress_messages ON public.chat_jobs USING GIN (progress_messages);

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'agent_task',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  user_message TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error TEXT,
  logs TEXT[],
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_user_id ON public.background_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON public.background_jobs(session_id);
CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON public.background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_background_jobs_created_at ON public.background_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.generation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id TEXT,
  request_id TEXT NOT NULL,
  output_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt TEXT NOT NULL,
  target_file TEXT,
  agent_id UUID,
  metrics JSONB,
  feedback JSONB,
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_generation_history_user_id
  ON public.generation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_history_project_id
  ON public.generation_history(project_id);
CREATE INDEX IF NOT EXISTS idx_generation_history_status
  ON public.generation_history(status);

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id TEXT PRIMARY KEY,
  api_key TEXT,
  theme TEXT CHECK (theme IN ('blue', 'green')) DEFAULT 'green',
  crt_effects BOOLEAN DEFAULT TRUE,
  phosphor_glow BOOLEAN DEFAULT TRUE,
  auto_scroll_chat BOOLEAN DEFAULT TRUE,
  sound_effects BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Snapshot storage metadata is retained because the existing integration
-- migrations 009/010 reference this table.
CREATE TABLE IF NOT EXISTS public.codebase_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  generation_id TEXT REFERENCES public.generations(id) ON DELETE SET NULL,
  file_count INTEGER NOT NULL CHECK (file_count > 0),
  total_size BIGINT NOT NULL CHECK (total_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_codebase_snapshots_user_id
  ON public.codebase_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_codebase_snapshots_generation_id
  ON public.codebase_snapshots(generation_id);

-- Keep timestamps fresh for mutable service records.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generations_updated_at ON public.generations;
CREATE TRIGGER generations_updated_at
  BEFORE UPDATE ON public.generations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS chat_jobs_updated_at ON public.chat_jobs;
CREATE TRIGGER chat_jobs_updated_at
  BEFORE UPDATE ON public.chat_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS chat_messages_updated_at ON public.chat_messages;
CREATE TRIGGER chat_messages_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS background_jobs_updated_at ON public.background_jobs;
CREATE TRIGGER background_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS generation_history_updated_at ON public.generation_history;
CREATE TRIGGER generation_history_updated_at
  BEFORE UPDATE ON public.generation_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_settings_updated_at ON public.user_settings;
CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The worker calls this with no arguments. It atomically claims the oldest
-- pending job, and TEXT user/session IDs match DevDrop's identity model.
CREATE OR REPLACE FUNCTION public.claim_pending_job()
RETURNS TABLE(
  id UUID,
  user_id TEXT,
  session_id TEXT,
  type TEXT,
  status TEXT,
  user_message TEXT,
  context JSONB,
  progress INTEGER,
  result JSONB,
  error TEXT,
  logs TEXT[],
  created_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_job_id UUID;
BEGIN
  SELECT bj.id INTO claimed_job_id
  FROM public.background_jobs AS bj
  WHERE bj.status = 'pending'
  ORDER BY bj.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF claimed_job_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.background_jobs AS bj
  SET status = 'processing', started_at = NOW(), updated_at = NOW()
  WHERE bj.id = claimed_job_id;

  RETURN QUERY
  SELECT bj.id, bj.user_id, bj.session_id, bj.type, bj.status,
         bj.user_message, bj.context, bj.progress, bj.result, bj.error,
         bj.logs, bj.created_at, bj.started_at, bj.completed_at
  FROM public.background_jobs AS bj
  WHERE bj.id = claimed_job_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pending_job() TO service_role;
