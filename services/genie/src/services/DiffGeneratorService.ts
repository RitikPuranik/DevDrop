import { createPatch } from 'diff'

import logger from '../utils/logger'

export class DiffGeneratorService {
  generateDiff(
    oldFileName: string,
    newFileName: string,
    oldString: string,
    newString: string
  ): string {
    logger.info(`Generating diff for ${oldFileName}`)
    try {
      const diff = createPatch(oldFileName, oldString, newString, '', '')
      logger.info('Diff generated successfully')
      return diff
    } catch (error) {
      logger.error('Error generating diff:', error)
      throw new Error('Failed to generate diff')
    }
  }
}
