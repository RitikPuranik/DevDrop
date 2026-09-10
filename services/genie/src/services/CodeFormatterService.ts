import prettier from 'prettier'

import logger from '../utils/logger'

export class CodeFormatterService {
  async format(code: string, parser: string = 'typescript'): Promise<string> {
    logger.info(`Formatting code with parser: ${parser}`)
    try {
      const formattedCode = prettier.format(code, { parser })
      logger.info('Code formatted successfully')
      return formattedCode
    } catch (error) {
      logger.error('Error formatting code:', error)
      throw new Error('Failed to format code')
    }
  }
}
