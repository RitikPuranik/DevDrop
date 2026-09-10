import { getSupabaseClient } from '../SupabaseClient';
import {
  HistoryEntry,
  GenerationStatus,
} from '../../models/GenerationHistory';
import { GenerationType } from '../../models/GenerationRequest';

/**
 * Generation History Repository
 * Handles CRUD operations for generation history in Supabase
 */

export interface DatabaseHistoryEntry {
  id: string;
  user_id: string;
  project_id: string | null;
  request_id: string;
  output_id: string | null;
  type: string;
  status: string;
  prompt: string;
  target_file: string | null;
  agent_id: string | null;
  metrics: Record<string, any> | null;
  feedback: Record<string, any> | null;
  error: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export class GenerationHistoryRepository {
  private tableName = 'generation_history';

  /**
   * Create a new history entry
   */
  async createEntry(
    userId: string,
    entry: Omit<HistoryEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<HistoryEntry> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .insert({
        user_id: userId,
        project_id: entry.projectId,
        request_id: entry.requestId,
        output_id: entry.outputId,
        type: entry.type,
        status: entry.status,
        prompt: entry.prompt,
        target_file: entry.targetFile,
        agent_id: entry.agentId,
        metrics: entry.metrics,
        feedback: entry.feedback,
        error: entry.error,
        metadata: entry.metadata || {},
        completed_at: entry.completedAt,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create history entry: ${error.message}`);
    }

    return this.mapToHistoryEntry(data);
  }

  /**
   * Get history entry by ID
   */
  async findById(entryId: string): Promise<HistoryEntry | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('id', entryId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch history entry: ${error.message}`);
    }

    return this.mapToHistoryEntry(data);
  }

  /**
   * Get all history entries for a user
   */
  async findByUserId(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<HistoryEntry[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch user history: ${error.message}`);
    }

    return data.map((row) => this.mapToHistoryEntry(row));
  }

  /**
   * Get history entries for a project
   */
  async findByProjectId(
    projectId: string,
    limit = 50,
    offset = 0
  ): Promise<HistoryEntry[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch project history: ${error.message}`);
    }

    return data.map((row) => this.mapToHistoryEntry(row));
  }

  /**
   * Get history entries by status
   */
  async findByStatus(
    userId: string,
    status: GenerationStatus
  ): Promise<HistoryEntry[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch history by status: ${error.message}`);
    }

    return data.map((row) => this.mapToHistoryEntry(row));
  }

  /**
   * Update history entry
   */
  async update(
    entryId: string,
    updates: Partial<Omit<HistoryEntry, 'id' | 'createdAt'>>
  ): Promise<HistoryEntry> {
    const supabase = getSupabaseClient();

    const updateData: Partial<DatabaseHistoryEntry> = {};

    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.outputId !== undefined) updateData.output_id = updates.outputId;
    if (updates.metrics !== undefined) updateData.metrics = updates.metrics;
    if (updates.feedback !== undefined) updateData.feedback = updates.feedback;
    if (updates.error !== undefined) updateData.error = updates.error;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
    if (updates.completedAt !== undefined) {
      updateData.completed_at = updates.completedAt?.toISOString() || null;
    }

    const { data, error } = await supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', entryId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update history entry: ${error.message}`);
    }

    return this.mapToHistoryEntry(data);
  }

  /**
   * Delete history entry
   */
  async delete(entryId: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .eq('id', entryId);

    if (error) {
      throw new Error(`Failed to delete history entry: ${error.message}`);
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    totalGenerations: number;
    successfulGenerations: number;
    failedGenerations: number;
    totalTokensUsed: number;
    averageRating?: number;
  }> {
    const supabase = getSupabaseClient();

    // Get all entries for user
    const { data, error } = await supabase
      .from(this.tableName)
      .select('status, metrics, feedback')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to fetch user stats: ${error.message}`);
    }

    const totalGenerations = data.length;
    const successfulGenerations = data.filter(
      (e) => e.status === GenerationStatus.COMPLETED
    ).length;
    const failedGenerations = data.filter(
      (e) => e.status === GenerationStatus.FAILED
    ).length;
    const totalTokensUsed = data.reduce(
      (sum, e) => sum + (e.metrics?.tokensUsed || 0),
      0
    );

    const ratingsWithFeedback = data
      .filter((e) => e.feedback?.rating)
      .map((e) => e.feedback.rating);
    const averageRating =
      ratingsWithFeedback.length > 0
        ? ratingsWithFeedback.reduce((sum, r) => sum + r, 0) /
          ratingsWithFeedback.length
        : undefined;

    return {
      totalGenerations,
      successfulGenerations,
      failedGenerations,
      totalTokensUsed,
      averageRating,
    };
  }

  /**
   * Map database row to HistoryEntry
   */
  private mapToHistoryEntry(row: DatabaseHistoryEntry): HistoryEntry {
    return {
      id: row.id,
      requestId: row.request_id,
      outputId: row.output_id || undefined,
      type: row.type as GenerationType,
      status: row.status as GenerationStatus,
      prompt: row.prompt,
      projectId: row.project_id!,
      targetFile: row.target_file || undefined,
      agentId: row.agent_id || undefined,
      metrics: (row.metrics as any) || undefined,
      feedback: row.feedback
        ? ({
            rating: (row.feedback as any).rating,
            timestamp: new Date((row.feedback as any).timestamp),
            comment: (row.feedback as any).comment,
            helpful: (row.feedback as any).helpful,
            usedCode: (row.feedback as any).usedCode,
          } as any)
        : undefined,
      error: row.error || undefined,
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }
}
