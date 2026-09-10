import { getSupabaseClient } from '../SupabaseClient';

/**
 * Embedding Repository
 * Handles CRUD operations and vector similarity search for embeddings in Supabase
 */

export interface EmbeddingInput {
  chunkIndex: number;
  filePath: string;
  content: string;
  embedding: number[];
  startLine?: number;
  endLine?: number;
  tokensCount?: number;
}

export interface DatabaseEmbedding {
  id: string;
  project_id: string;
  chunk_index: number;
  file_path: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  created_at: string;
}

export interface EmbeddingWithSimilarity extends DatabaseEmbedding {
  similarity?: number;
}

export class EmbeddingRepository {
  private tableName = 'embeddings';

  /**
   * Create a new embedding
   */
  async create(projectId: string, embedding: EmbeddingInput): Promise<string> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .insert({
        project_id: projectId,
        chunk_index: embedding.chunkIndex,
        file_path: embedding.filePath,
        content: embedding.content,
        embedding: embedding.embedding,
        metadata: {
          startLine: embedding.startLine,
          endLine: embedding.endLine,
          tokensCount: embedding.tokensCount,
        },
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create embedding: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Batch create embeddings
   */
  async createBatch(
    projectId: string,
    embeddings: EmbeddingInput[]
  ): Promise<string[]> {
    const supabase = getSupabaseClient();

    const insertData = embeddings.map((emb) => ({
      project_id: projectId,
      chunk_index: emb.chunkIndex,
      file_path: emb.filePath,
      content: emb.content,
      embedding: emb.embedding,
      metadata: {
        startLine: emb.startLine,
        endLine: emb.endLine,
        tokensCount: emb.tokensCount,
      },
    }));

    const { data, error } = await supabase
      .from(this.tableName)
      .insert(insertData)
      .select('id');

    if (error) {
      throw new Error(`Failed to create embeddings: ${error.message}`);
    }

    return data.map((row) => row.id);
  }

  /**
   * Find embeddings by project ID
   */
  async findByProjectId(projectId: string): Promise<DatabaseEmbedding[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('project_id', projectId)
      .order('file_path', { ascending: true })
      .order('chunk_index', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch embeddings: ${error.message}`);
    }

    return data;
  }

  /**
   * Find embeddings by file path
   */
  async findByFilePath(
    projectId: string,
    filePath: string
  ): Promise<DatabaseEmbedding[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('*')
      .eq('project_id', projectId)
      .eq('file_path', filePath)
      .order('chunk_index', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch embeddings for file: ${error.message}`);
    }

    return data;
  }

  /**
   * Find similar embeddings using vector similarity search
   * Uses cosine distance (1 - cosine similarity) for ranking
   */
  async findSimilar(
    projectId: string,
    queryEmbedding: number[],
    limit = 10,
    threshold = 0.7
  ): Promise<EmbeddingWithSimilarity[]> {
    const supabase = getSupabaseClient();

    // Use RPC function for vector similarity search
    // Note: This requires a PostgreSQL function to be created in migration
    const { data, error } = await supabase.rpc('match_embeddings', {
      query_embedding: queryEmbedding,
      query_project_id: projectId,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      throw new Error(`Failed to search similar embeddings: ${error.message}`);
    }

    return data;
  }

  /**
   * Count embeddings for a project
   */
  async count(projectId: string): Promise<number> {
    const supabase = getSupabaseClient();

    const { count, error } = await supabase
      .from(this.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    if (error) {
      throw new Error(`Failed to count embeddings: ${error.message}`);
    }

    return count || 0;
  }

  /**
   * Delete all embeddings for a project
   */
  async deleteByProjectId(projectId: string): Promise<number> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .delete()
      .eq('project_id', projectId)
      .select('id');

    if (error) {
      throw new Error(`Failed to delete embeddings: ${error.message}`);
    }

    return data.length;
  }

  /**
   * Delete embeddings for a specific file
   */
  async deleteByFilePath(
    projectId: string,
    filePath: string
  ): Promise<number> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .delete()
      .eq('project_id', projectId)
      .eq('file_path', filePath)
      .select('id');

    if (error) {
      throw new Error(
        `Failed to delete embeddings for file: ${error.message}`
      );
    }

    return data.length;
  }

  /**
   * Update embedding metadata
   */
  async updateMetadata(
    embeddingId: string,
    metadata: Record<string, any>
  ): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from(this.tableName)
      .update({ metadata })
      .eq('id', embeddingId);

    if (error) {
      throw new Error(`Failed to update embedding metadata: ${error.message}`);
    }
  }

  /**
   * Get file paths with embedding counts
   */
  async getFileStats(
    projectId: string
  ): Promise<Array<{ filePath: string; count: number }>> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from(this.tableName)
      .select('file_path')
      .eq('project_id', projectId);

    if (error) {
      throw new Error(`Failed to fetch file stats: ${error.message}`);
    }

    // Group by file path and count
    const fileMap = new Map<string, number>();
    data.forEach((row) => {
      const count = fileMap.get(row.file_path) || 0;
      fileMap.set(row.file_path, count + 1);
    });

    return Array.from(fileMap.entries()).map(([filePath, count]) => ({
      filePath,
      count,
    }));
  }
}
