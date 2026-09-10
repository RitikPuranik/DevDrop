import { pipeline, Pipeline } from '@xenova/transformers'

import logger from '../utils/logger'

export class EmbeddingService {
  private extractor: Pipeline | null = null

  constructor() {
    void this.initialize()
  }

  private async initialize() {
    logger.info('Initializing embedding model')
    this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    logger.info('Embedding model initialized')
  }

  async getEmbedding(text: string): Promise<number[]> {
    logger.info('Generating embedding')
    try {
      if (!this.extractor) {
        await this.initialize()
      }
      const result = (await this.extractor!(text, { pooling: 'mean', normalize: true })) as {
        data: Float32Array
      }
      logger.info('Embedding generated successfully')
      if (result && result.data instanceof Float32Array) {
        return Array.from(result.data)
      }
      return []
    } catch (error) {
      logger.error('Error getting embedding:', error)
      throw new Error('Failed to generate embedding')
    }
  }
}
