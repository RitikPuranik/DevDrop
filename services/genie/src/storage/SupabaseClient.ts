import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../utils/config';

/**
 * Supabase Client Wrapper
 * Provides a singleton instance of Supabase client with service role access
 */

let supabaseInstance: SupabaseClient | null = null;

/**
 * Initialize and return Supabase client with service role
 * Service role bypasses RLS for backend operations
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const config = getConfig();
    
    supabaseInstance = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  return supabaseInstance;
}

/**
 * Create a Supabase client with anon key (for client-side operations)
 * Used when backend needs to act on behalf of a user
 */
export function getSupabaseAnonClient(): SupabaseClient {
  const config = getConfig();
  
  return createClient(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    }
  );
}

/**
 * Create a Supabase client with user JWT token
 * Used for operations that respect RLS policies
 */
export function getSupabaseUserClient(accessToken: string): SupabaseClient {
  const config = getConfig();
  
  return createClient(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );
}

/**
 * Health check for Supabase connection
 */
export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('agents').select('count').limit(1);
    return !error;
  } catch (error) {
    console.error('Supabase connection check failed:', error);
    return false;
  }
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetSupabaseClient(): void {
  supabaseInstance = null;
}

export const supabase = getSupabaseClient();
