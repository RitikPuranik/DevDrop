/**
 * Code Scaffold Tool
 * Generates boilerplate code from templates
 */

export interface ScaffoldOptions {
  type:
    | 'function'
    | 'class'
    | 'interface'
    | 'component'
    | 'service'
    | 'repository'
    | 'controller'
    | 'test'
  name: string
  description?: string
  parameters?: Array<{ name: string; type: string }>
  returnType?: string
  properties?: Array<{ name: string; type: string; optional?: boolean }>
  methods?: Array<{
    name: string
    parameters?: Array<{ name: string; type: string }>
    returnType?: string
  }>
  isAsync?: boolean
  isExported?: boolean
  framework?: 'react' | 'express' | 'generic'
}

/**
 * Generate a function scaffold
 */
function scaffoldFunction(options: ScaffoldOptions): string {
  const {
    name,
    description,
    parameters = [],
    returnType = 'void',
    isAsync = false,
    isExported = true,
  } = options

  const exportKeyword = isExported ? 'export ' : ''
  const asyncKeyword = isAsync ? 'async ' : ''
  const params = parameters
    .map(p => `${p.name}: ${p.type}`)
    .join(', ')
  const promiseReturn = isAsync ? `Promise<${returnType}>` : returnType

  const docComment = description
    ? `/**\n * ${description}\n */\n`
    : ''

  return `${docComment}${exportKeyword}${asyncKeyword}function ${name}(${params}): ${promiseReturn} {
  // TODO: Implement ${name}
  throw new Error('Not implemented')
}
`
}

/**
 * Generate a class scaffold
 */
function scaffoldClass(options: ScaffoldOptions): string {
  const {
    name,
    description,
    properties = [],
    methods = [],
    isExported = true,
  } = options

  const exportKeyword = isExported ? 'export ' : ''

  const docComment = description
    ? `/**\n * ${description}\n */\n`
    : ''

  const propertyCode = properties
    .map(p => {
      const optional = p.optional ? '?' : ''
      return `  private ${p.name}${optional}: ${p.type}`
    })
    .join('\n')

  const constructorParams = properties
    .map(p => {
      const optional = p.optional ? '?' : ''
      return `${p.name}${optional}: ${p.type}`
    })
    .join(', ')

  const constructorAssignments = properties
    .map(p => `    this.${p.name} = ${p.name}`)
    .join('\n')

  const methodCode = methods
    .map(m => {
      const params = (m.parameters || [])
        .map(p => `${p.name}: ${p.type}`)
        .join(', ')
      const returnType = m.returnType || 'void'
      return `
  public ${m.name}(${params}): ${returnType} {
    // TODO: Implement ${m.name}
    throw new Error('Not implemented')
  }`
    })
    .join('\n')

  return `${docComment}${exportKeyword}class ${name} {
${propertyCode}

  constructor(${constructorParams}) {
${constructorAssignments}
  }
${methodCode}
}
`
}

/**
 * Generate an interface scaffold
 */
function scaffoldInterface(options: ScaffoldOptions): string {
  const { name, description, properties = [], isExported = true } = options

  const exportKeyword = isExported ? 'export ' : ''

  const docComment = description
    ? `/**\n * ${description}\n */\n`
    : ''

  const propertyCode = properties
    .map(p => {
      const optional = p.optional ? '?' : ''
      return `  ${p.name}${optional}: ${p.type}`
    })
    .join('\n')

  return `${docComment}${exportKeyword}interface ${name} {
${propertyCode}
}
`
}

/**
 * Generate a React component scaffold
 */
function scaffoldReactComponent(options: ScaffoldOptions): string {
  const { name, description, properties = [] } = options

  const propsInterface =
    properties.length > 0
      ? `interface ${name}Props {
${properties.map(p => `  ${p.name}${p.optional ? '?' : ''}: ${p.type}`).join('\n')}
}

`
      : ''

  const propsParam = properties.length > 0 ? `{ ${properties.map(p => p.name).join(', ')} }: ${name}Props` : ''

  const docComment = description
    ? `/**\n * ${description}\n */\n`
    : ''

  return `import React from 'react'

${propsInterface}${docComment}export function ${name}(${propsParam}) {
  return (
    <div>
      <h1>${name}</h1>
      {/* TODO: Implement component */}
    </div>
  )
}
`
}

/**
 * Generate an Express service scaffold
 */
function scaffoldService(options: ScaffoldOptions): string {
  const { name, description, methods = [] } = options

  const docComment = description
    ? `/**\n * ${description}\n */\n`
    : ''

  const methodCode = methods
    .map(m => {
      const params = (m.parameters || [])
        .map(p => `${p.name}: ${p.type}`)
        .join(', ')
      const returnType = m.returnType || 'Promise<void>'
      return `
  async ${m.name}(${params}): ${returnType} {
    try {
      // TODO: Implement ${m.name}
      throw new Error('Not implemented')
    } catch (error) {
      console.error('${name}.${m.name} error:', error)
      throw error
    }
  }`
    })
    .join('\n')

  return `${docComment}export class ${name} {
  constructor() {
    // Initialize service
  }
${methodCode}
}

export const ${name.charAt(0).toLowerCase() + name.slice(1)} = new ${name}()
`
}

/**
 * Generate a repository scaffold
 */
function scaffoldRepository(options: ScaffoldOptions): string {
  const { name, description } = options

  const entityName = name.replace('Repository', '')

  const docComment = description
    ? `/**\n * ${description}\n */\n`
    : ''

  return `${docComment}import { getSupabaseClient } from '../SupabaseClient'

export interface Database${entityName} {
  id: string
  created_at: string
  updated_at: string
  // TODO: Add entity fields
}

export class ${name} {
  private supabase = getSupabaseClient()
  private tableName = '${entityName.toLowerCase()}s'

  async create(data: Omit<Database${entityName}, 'id' | 'created_at' | 'updated_at'>): Promise<Database${entityName}> {
    const { data: result, error } = await this.supabase
      .from(this.tableName)
      .insert(data)
      .select()
      .single()

    if (error) throw error
    return result
  }

  async findById(id: string): Promise<Database${entityName} | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single()

    if (error) return null
    return data
  }

  async findAll(): Promise<Database${entityName}[]> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }

  async update(id: string, updates: Partial<Database${entityName}>): Promise<Database${entityName}> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}
`
}

/**
 * Generate a controller scaffold
 */
function scaffoldController(options: ScaffoldOptions): string {
  const { name, description } = options

  const docComment = description
    ? `/**\n * ${description}\n */\n`
    : ''

  return `${docComment}import { Request, Response, NextFunction } from 'express'

export class ${name} {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // TODO: Implement create
      res.status(201).json({ message: 'Created' })
    } catch (error) {
      next(error)
    }
  }

  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // TODO: Implement findAll
      res.json([])
    } catch (error) {
      next(error)
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params
      // TODO: Implement findById
      res.json({ id })
    } catch (error) {
      next(error)
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params
      // TODO: Implement update
      res.json({ id, message: 'Updated' })
    } catch (error) {
      next(error)
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params
      // TODO: Implement delete
      res.status(204).send()
    } catch (error) {
      next(error)
    }
  }
}

export const ${name.charAt(0).toLowerCase() + name.slice(1)} = new ${name}()
`
}

/**
 * Generate a test scaffold
 */
function scaffoldTest(options: ScaffoldOptions): string {
  const { name, description } = options

  const entityName = name.replace(/\.test$/, '').replace(/Test$/, '')

  return `/**
 * ${description || `Tests for ${entityName}`}
 */

describe('${entityName}', () => {
  beforeEach(() => {
    // Setup before each test
  })

  afterEach(() => {
    // Cleanup after each test
  })

  it('should be defined', () => {
    expect(${entityName}).toBeDefined()
  })

  it('should TODO', () => {
    // TODO: Implement test
    expect(true).toBe(true)
  })
})
`
}

/**
 * Main scaffold function
 */
export function scaffoldCode(
  options: ScaffoldOptions
): string {
  switch (options.type) {
    case 'function':
      return scaffoldFunction(options)

    case 'class':
      return scaffoldClass(options)

    case 'interface':
      return scaffoldInterface(options)

    case 'component':
      return scaffoldReactComponent(options)

    case 'service':
      return scaffoldService(options)

    case 'repository':
      return scaffoldRepository(options)

    case 'controller':
      return scaffoldController(options)

    case 'test':
      return scaffoldTest(options)

    default:
      throw new Error(`Unknown scaffold type: ${options.type as string}`)
  }
}

/**
 * Generate multiple related files (e.g., service + repository + test)
 */
export function scaffoldModule(
  moduleName: string,
  options: {
    includeService?: boolean
    includeRepository?: boolean
    includeController?: boolean
    includeTests?: boolean
  } = {}
): Record<string, string> {
  const {
    includeService = true,
    includeRepository = true,
    includeController = true,
    includeTests = true,
  } = options

  const files: Record<string, string> = {}

  if (includeRepository) {
    files[`${moduleName}Repository.ts`] = scaffoldCode({
      type: 'repository',
      name: `${moduleName}Repository`,
      description: `Repository for ${moduleName} entity`,
    })
  }

  if (includeService) {
    files[`${moduleName}Service.ts`] = scaffoldCode({
      type: 'service',
      name: `${moduleName}Service`,
      description: `Service for ${moduleName} business logic`,
      methods: [
        { name: 'create', returnType: 'Promise<void>' },
        { name: 'findAll', returnType: 'Promise<any[]>' },
        { name: 'findById', returnType: 'Promise<any>' },
        { name: 'update', returnType: 'Promise<void>' },
        { name: 'delete', returnType: 'Promise<void>' },
      ],
    })
  }

  if (includeController) {
    files[`${moduleName}Controller.ts`] = scaffoldCode({
      type: 'controller',
      name: `${moduleName}Controller`,
      description: `Controller for ${moduleName} endpoints`,
    })
  }

  if (includeTests) {
    files[`${moduleName}.test.ts`] = scaffoldCode({
      type: 'test',
      name: `${moduleName}Test`,
      description: `Tests for ${moduleName}`,
    })
  }

  return files
}
