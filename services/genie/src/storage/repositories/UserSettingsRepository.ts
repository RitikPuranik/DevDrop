import { getSupabaseClient } from '../SupabaseClient'

export interface UserSettings {
  userId: string
  apiKey?: string
  theme?: 'blue' | 'green'
  crtEffects?: boolean
  phosphorGlow?: boolean
  autoScrollChat?: boolean
  soundEffects?: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * Repository for managing user settings in Supabase
 */
export class UserSettingsRepository {
  private supabase = getSupabaseClient()

  /**
   * Get user settings by user ID
   */
  async getByUserId(userId: string): Promise<UserSettings | null> {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      throw new Error(`Failed to fetch user settings: ${error.message}`)
    }

    return this.mapToUserSettings(data)
  }

  /**
   * Create or update user settings
   */
  async upsert(settings: UserSettings): Promise<UserSettings> {
    const payload = {
      user_id: settings.userId,
      api_key: settings.apiKey,
      theme: settings.theme,
      crt_effects: settings.crtEffects,
      phosphor_glow: settings.phosphorGlow,
      auto_scroll_chat: settings.autoScrollChat,
      sound_effects: settings.soundEffects,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await this.supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to upsert user settings: ${error.message}`)
    }

    return this.mapToUserSettings(data)
  }

  /**
   * Update API key for a user
   */
  async updateApiKey(userId: string, apiKey: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_settings')
      .upsert(
        {
          user_id: userId,
          api_key: apiKey,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      throw new Error(`Failed to update API key: ${error.message}`)
    }
  }

  /**
   * Update preferences for a user
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<Pick<UserSettings, 'theme' | 'crtEffects' | 'phosphorGlow' | 'autoScrollChat' | 'soundEffects'>>
  ): Promise<void> {
    const payload: Record<string, any> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    }

    if (preferences.theme !== undefined) payload.theme = preferences.theme
    if (preferences.crtEffects !== undefined) payload.crt_effects = preferences.crtEffects
    if (preferences.phosphorGlow !== undefined) payload.phosphor_glow = preferences.phosphorGlow
    if (preferences.autoScrollChat !== undefined) payload.auto_scroll_chat = preferences.autoScrollChat
    if (preferences.soundEffects !== undefined) payload.sound_effects = preferences.soundEffects

    const { error } = await this.supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) {
      throw new Error(`Failed to update preferences: ${error.message}`)
    }
  }

  /**
   * Delete user settings
   */
  async delete(userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_settings')
      .delete()
      .eq('user_id', userId)

    if (error) {
      throw new Error(`Failed to delete user settings: ${error.message}`)
    }
  }

  /**
   * Get API key for a user
   */
  async getApiKey(userId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('user_settings')
      .select('api_key')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      throw new Error(`Failed to fetch API key: ${error.message}`)
    }

    return data?.api_key || null
  }

  /**
   * Map database row to UserSettings interface
   */
  private mapToUserSettings(data: any): UserSettings {
    return {
      userId: data.user_id,
      apiKey: data.api_key,
      theme: data.theme,
      crtEffects: data.crt_effects,
      phosphorGlow: data.phosphor_glow,
      autoScrollChat: data.auto_scroll_chat,
      soundEffects: data.sound_effects,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }
}
