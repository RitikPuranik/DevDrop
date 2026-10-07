const { createClient } = require('@supabase/supabase-js');

/**
 * IMPORTANT: This is a SEPARATE Supabase project from the marketplace/
 * application Supabase project configured in `./supabase.js`.
 *
 * AI Studio temporary projects (generated websites, zips, assets) live in
 * their own Supabase project + private bucket so that deleting an abandoned
 * AI Studio project can NEVER touch marketplace assets. Never reuse
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY here.
 */

if (!process.env.AI_STUDIO_SUPABASE_URL || !process.env.AI_STUDIO_SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  AI_STUDIO_SUPABASE_URL or AI_STUDIO_SUPABASE_SERVICE_ROLE_KEY is not set. AI Studio persistence will not work.');
}

const AI_STUDIO_SUPABASE_BUCKET = process.env.AI_STUDIO_SUPABASE_BUCKET || 'ai-studio-projects';

const aiStudioSupabase = createClient(
  process.env.AI_STUDIO_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.AI_STUDIO_SUPABASE_SERVICE_ROLE_KEY || 'placeholder',
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

module.exports = { aiStudioSupabase, AI_STUDIO_SUPABASE_BUCKET };
