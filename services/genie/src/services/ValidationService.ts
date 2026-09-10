import { ZodType } from 'zod'
import { Script } from 'vm'

import logger from '../utils/logger'

export class ValidationService {
  validate<T>(schema: ZodType<T>, data: unknown): T {
    logger.info('Validating data')
    try {
      const validatedData = schema.parse(data)
      logger.info('Data validated successfully')
      return validatedData
    } catch (error) {
      logger.error('Validation error:', error)
      throw new Error('Invalid data')
    }
  }

  checkSyntax(code: string): boolean {
    logger.info('Checking syntax')
    try {
      new Script(code)
      logger.info('Syntax check passed')
      return true
    } catch (error) {
      logger.error('Syntax error:', error)
      return false
    }
  }
}
