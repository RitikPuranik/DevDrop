import { Router } from 'express'
import { UserSettingsRepository } from '../../storage/repositories/UserSettingsRepository'
import { requireAuth } from '../middleware/supabaseAuth'

const router = Router()
const userSettingsRepo = new UserSettingsRepository()

/**
 * GET /api/settings
 * Get current user's settings
 */
router.get('/settings', requireAuth, async (req: any, res, next): Promise<void> => {
  try {
    const userId = (req as any).user?.id

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const settings = await userSettingsRepo.getByUserId(userId)

    if (!settings) {
      // Return default settings if none exist
      res.json({
        userId,
        theme: 'green',
        crtEffects: false,
        phosphorGlow: true,
        autoScrollChat: true,
        soundEffects: false,
      })
      return
    }

    // Don't send the full API key to the frontend, only indicate if it exists
    const response = {
      ...settings,
      hasApiKey: !!settings.apiKey,
      apiKey: undefined,
    }

    res.json(response)
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /api/settings/api-key
 * Update user's API key
 */
router.put('/settings/api-key', requireAuth, async (req: any, res, next): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { apiKey } = req.body

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ error: 'Invalid API key' })
      return
    }

    // Basic validation for Google Gemini API key format
    if (!apiKey.length >= 20) {
      res.status(400).json({ error: 'Invalid Google Gemini API key format' })
      return
    }

    await userSettingsRepo.updateApiKey(userId, apiKey)

    res.json({ success: true, message: 'API key saved successfully' })
  } catch (error) {
    next(error)
  }
})

/**
 * PUT /api/settings/preferences
 * Update user's UI preferences
 */
router.put('/settings/preferences', requireAuth, async (req: any, res, next): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { theme, crtEffects, phosphorGlow, autoScrollChat, soundEffects } = req.body

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const preferences: Record<string, any> = {}

    if (theme === 'blue' || theme === 'green') preferences.theme = theme
    if (typeof crtEffects === 'boolean') preferences.crtEffects = crtEffects
    if (typeof phosphorGlow === 'boolean') preferences.phosphorGlow = phosphorGlow
    if (typeof autoScrollChat === 'boolean') preferences.autoScrollChat = autoScrollChat
    if (typeof soundEffects === 'boolean') preferences.soundEffects = soundEffects

    await userSettingsRepo.updatePreferences(userId, preferences)

    res.json({ success: true, message: 'Preferences updated successfully' })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/settings/api-key
 * Remove user's API key
 */
router.delete('/settings/api-key', requireAuth, async (req: any, res, next): Promise<void> => {
  try {
    const userId = (req as any).user?.id

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    await userSettingsRepo.updateApiKey(userId, '')

    res.json({ success: true, message: 'API key removed successfully' })
  } catch (error) {
    next(error)
  }
})

/**
 * DELETE /api/settings
 * Delete all user data including generations, chat history, and settings
 */
router.delete('/settings', requireAuth, async (req: any, res, next): Promise<void> => {
  try {
    const userId = (req as any).user?.id

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Import repositories and Supabase client
    const { getSupabaseClient } = await import('../../storage/SupabaseClient')
    const supabase = getSupabaseClient()

    console.log(`[DELETE /settings] Clearing all data for user ${userId}`)

    // Delete all user data
    // 1. Get all generation IDs for this user first
    const { data: generations, error: getGenError } = await supabase
      .from('generations')
      .select('id')
      .eq('user_id', userId)
    
    if (getGenError) {
      console.error(`Failed to fetch generations:`, getGenError)
    }

    const generationIds = generations?.map((g: any) => g.id) || []

    // 2. Delete all chat messages for these generations
    if (generationIds.length > 0) {
      const { error: chatError } = await supabase
        .from('chat_messages')
        .delete()
        .in('generation_id', generationIds)
      
      if (chatError) {
        console.error(`Failed to delete chat messages:`, chatError)
      }
    }

    // 3. Delete all chat jobs
    const { error: jobError } = await supabase
      .from('chat_jobs')
      .delete()
      .eq('user_id', userId)
    
    if (jobError) {
      console.error(`Failed to delete chat jobs:`, jobError)
    }

    // 4. Delete all generations
    const { error: genError } = await supabase
      .from('generations')
      .delete()
      .eq('user_id', userId)
    
    if (genError) {
      console.error(`Failed to delete generations:`, genError)
    }

    // 5. Delete generation history
    const { error: historyError } = await supabase
      .from('generation_history')
      .delete()
      .eq('user_id', userId)
    
    if (historyError) {
      console.error(`Failed to delete generation history:`, historyError)
    }

    // 5. Delete user settings (API keys, preferences)
    await userSettingsRepo.delete(userId)

    console.log(`[DELETE /settings] Successfully cleared all data for user ${userId}`)

    res.json({ success: true, message: 'All data cleared successfully' })
  } catch (error) {
    console.error('[DELETE /settings] Error:', error)
    next(error)
  }
})

/**
 * DELETE /api/settings/account
 * Delete user account and all associated data
 * This is a destructive operation that cannot be undone
 */
router.delete('/settings/account', requireAuth, async (req: any, res, next): Promise<void> => {
  try {
    const userId = (req as any).user?.id
    const { confirmation } = req.body

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    // Require explicit confirmation
    if (confirmation !== 'DELETE MY ACCOUNT') {
      res.status(400).json({ 
        error: 'Confirmation required',
        message: 'Please type "DELETE MY ACCOUNT" to confirm account deletion'
      })
      return
    }

    // Import Supabase client
    const { getSupabaseClient } = await import('../../storage/SupabaseClient')
    const supabase = getSupabaseClient()

    console.log(`[DELETE /settings/account] Deleting all data for user ${userId}`)

    // Delete all user data (same as clear data, but with confirmation)
    // 1. Get all generation IDs for this user first
    const { data: generations, error: getGenError } = await supabase
      .from('generations')
      .select('id')
      .eq('user_id', userId)
    
    if (getGenError) {
      console.error(`Failed to fetch generations:`, getGenError)
    }

    const generationIds = generations?.map((g: any) => g.id) || []

    // 2. Delete all chat messages for these generations
    if (generationIds.length > 0) {
      const { error: chatError } = await supabase
        .from('chat_messages')
        .delete()
        .in('generation_id', generationIds)
      
      if (chatError) {
        console.error(`Failed to delete chat messages:`, chatError)
      }
    }

    // 3. Delete all chat jobs
    const { error: jobError } = await supabase
      .from('chat_jobs')
      .delete()
      .eq('user_id', userId)
    
    if (jobError) {
      console.error(`Failed to delete chat jobs:`, jobError)
    }

    // 4. Delete all generations
    const { error: genError } = await supabase
      .from('generations')
      .delete()
      .eq('user_id', userId)
    
    if (genError) {
      console.error(`Failed to delete generations:`, genError)
    }

    // 5. Delete generation history
    const { error: historyError } = await supabase
      .from('generation_history')
      .delete()
      .eq('user_id', userId)
    
    if (historyError) {
      console.error(`Failed to delete generation history:`, historyError)
    }

    // 6. Delete user settings
    await userSettingsRepo.delete(userId)

    res.json({ 
      success: true, 
      message: 'Account data deleted successfully. Please contact support to permanently delete your account.'
    })
  } catch (error) {
    console.error('Failed to delete account data:', error)
    next(error)
  }
})

export default router
