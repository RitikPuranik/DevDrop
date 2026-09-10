/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { VectorMemoryService } from '@iqai/adk'
import { SupabaseClient } from '@supabase/supabase-js'
import logger from '../utils/logger'

export class VectorMemoryManager {
  private vectorMemoryService: VectorMemoryService

  constructor(supabaseClient: SupabaseClient) {
    this.vectorMemoryService = new VectorMemoryService(supabaseClient, 'embeddings', 'content', {
      dimensions: 384, // all-MiniLM-L6-v2 embedding dimension
    })
  }

  async storeEmbedding(content: string, embedding: number[]): Promise<void> {
    logger.info('Storing embedding')
    try {
      await this.vectorMemoryService.addMemory({ content, embedding })
      logger.info('Embedding stored successfully')
    } catch (error) {
      logger.error('Error storing embedding:', error)
      throw new Error('Failed to store embedding')
    }
  }

  async queryEmbeddings(embedding: number[], topK: number): Promise<any[]> {
    logger.info(`Querying embeddings with topK: ${topK}`)
    try {
      const results = await this.vectorMemoryService.search(embedding, topK)
      logger.info(`Found ${results.length} similar embeddings`)
      return results
    } catch (error) {
      logger.error('Error querying embeddings:', error)
      throw new Error('Failed to query embeddings')
    }
  }
}
