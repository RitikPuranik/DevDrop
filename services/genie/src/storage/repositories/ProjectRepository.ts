import { getSupabaseClient } from '../SupabaseClient';
import { ProjectContext } from '../../models/ProjectContext';

/**
 * Project Repository
 * Handles CRUD operations for projects in Supabase
 */

export interface DatabaseProject {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  root_path: string;
  file_count: number;
  total_lines: number;
  total_bytes: number;
  embedding_count: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class ProjectRepository {
  private tableName = 'projects';

  /**
   * Create a new project
   */
  async create(
    userId: string,
    project: Omit<ProjectContext, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ProjectContext> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .insert({
        user_id: userId,
        name: project.name,
        description: project.description,
        root_path: project.rootPath,
        file_count: project.statistics.totalFiles,
        total_lines: project.statistics.totalLines,
        total_bytes: project.statistics.totalBytes,
        embedding_count: project.embeddings?.totalChunks || 0,
        metadata: {
          files: project.files,
          embeddings: project.embeddings,
          statistics: project.statistics,
          ...project.metadata,
        },
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }

    return this.mapToProjectContext(data);
  }

  /**
   * Get project by ID
   */
  async findById(projectId: string): Promise<ProjectContext | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to fetch project: ${error.message}`);
    }

    return this.mapToProjectContext(data);
  }

  /**
   * Get all projects for a user
   */
  async findByUserId(userId: string): Promise<ProjectContext[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch user projects: ${error.message}`);
    }

    return data.map((row) => this.mapToProjectContext(row));
  }

  /**
   * Update project
   */
  async update(
    projectId: string,
    updates: Partial<Omit<ProjectContext, 'id' | 'createdAt'>>
  ): Promise<ProjectContext> {
    const supabase = getSupabaseClient();

    const updateData: Partial<DatabaseProject> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.rootPath !== undefined) updateData.root_path = updates.rootPath;
    if (updates.statistics) {
      updateData.file_count = updates.statistics.totalFiles;
      updateData.total_lines = updates.statistics.totalLines;
      updateData.total_bytes = updates.statistics.totalBytes;
    }
    if (updates.embeddings) {
      updateData.embedding_count = updates.embeddings.totalChunks;
    }
    if (updates.files || updates.embeddings || updates.statistics || updates.metadata) {
      // Merge metadata
      const existing = await this.findById(projectId);
      if (existing) {
        updateData.metadata = {
          ...existing.metadata,
          ...(updates.files && { files: updates.files }),
          ...(updates.embeddings && { embeddings: updates.embeddings }),
          ...(updates.statistics && { statistics: updates.statistics }),
          ...updates.metadata,
        };
      }
    }

    const { data, error } = await supabase
      .from(this.tableName)
      .update(updateData)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update project: ${error.message}`);
    }

    return this.mapToProjectContext(data);
  }

  /**
   * Delete project
   */
  async delete(projectId: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from(this.tableName)
      .delete()
      .eq('id', projectId);

    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  }

  /**
   * Search projects by name
   */
  async search(userId: string, query: string): Promise<ProjectContext[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .ilike('name', `%${query}%`)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to search projects: ${error.message}`);
    }

    return data.map((row) => this.mapToProjectContext(row));
  }

  /**
   * Update embedding count
   */
  async updateEmbeddingCount(
    projectId: string,
    count: number
  ): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from(this.tableName)
      .update({ embedding_count: count })
      .eq('id', projectId);

    if (error) {
      throw new Error(`Failed to update embedding count: ${error.message}`);
    }
  }

  /**
   * Map database row to ProjectContext model
   */
  private mapToProjectContext(row: DatabaseProject): ProjectContext {
    return {
      id: row.id,
      name: row.name,
      rootPath: row.root_path,
      description: row.description,
      files: row.metadata.files || [],
      embeddings: row.metadata.embeddings,
      statistics: row.metadata.statistics || {
        totalFiles: row.file_count,
        totalLines: row.total_lines,
        totalBytes: row.total_bytes,
        filesByLanguage: {},
        lastScanned: new Date(row.updated_at),
      },
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
