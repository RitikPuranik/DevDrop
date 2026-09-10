import { Project, FunctionDeclaration, ClassDeclaration, MethodDeclaration } from 'ts-morph'

/**
 * Comment Inserter Tool
 * Add TSDoc comments to functions, classes, and methods
 */

export interface CommentOptions {
  includeParams?: boolean
  includeReturns?: boolean
  includeExamples?: boolean
  includeThrows?: boolean
  author?: string
}

/**
 * Generate TSDoc comment for a function
 */
function generateFunctionComment(
  func: FunctionDeclaration | MethodDeclaration,
  options: CommentOptions = {}
): string {
  const {
    includeParams = true,
    includeReturns = true,
    includeExamples = false,
    includeThrows = true,
  } = options

  const funcName = func.getName() || '<anonymous>'
  const params = func.getParameters()
  const returnType = func.getReturnType().getText()
  const isAsync = func.isAsync()

  let comment = `/**\n * ${funcName}\n *\n`

  // Description placeholder
  comment += ` * TODO: Add description\n`

  // Parameters
  if (includeParams && params.length > 0) {
    comment += ` *\n`
    params.forEach(param => {
      const paramName = param.getName()
      const paramType = param.getType().getText()
      comment += ` * @param ${paramName} - TODO: Describe ${paramName} (${paramType})\n`
    })
  }

  // Return type
  if (includeReturns && returnType !== 'void') {
    comment += ` *\n`
    comment += ` * @returns TODO: Describe return value (${returnType})\n`
  }

  // Throws
  if (includeThrows && (isAsync || returnType.includes('Promise'))) {
    comment += ` *\n`
    comment += ` * @throws Error - TODO: Describe error conditions\n`
  }

  // Examples
  if (includeExamples) {
    comment += ` *\n`
    comment += ` * @example\n`
    comment += ` * \`\`\`ts\n`
    comment += ` * // TODO: Add usage example\n`
    comment += ` * ${funcName}()\n`
    comment += ` * \`\`\`\n`
  }

  comment += ` */`

  return comment
}

/**
 * Generate TSDoc comment for a class
 */
function generateClassComment(
  cls: ClassDeclaration,
  options: CommentOptions = {}
): string {
  const { includeExamples = false, author } = options

  const className = cls.getName() || '<anonymous>'

  let comment = `/**\n * ${className}\n *\n`
  comment += ` * TODO: Add class description\n`

  if (author) {
    comment += ` *\n`
    comment += ` * @author ${author}\n`
  }

  if (includeExamples) {
    comment += ` *\n`
    comment += ` * @example\n`
    comment += ` * \`\`\`ts\n`
    comment += ` * const instance = new ${className}()\n`
    comment += ` * \`\`\`\n`
  }

  comment += ` */`

  return comment
}

/**
 * Insert TSDoc comment above a function
 */
export function addFunctionComment(
  code: string,
  functionName: string,
  options: CommentOptions = {},
  filePath: string = 'temp.ts'
): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const func = sourceFile.getFunction(functionName)

  if (!func) {
    throw new Error(`Function '${functionName}' not found`)
  }

  // Check if already has JSDoc
  const existingDocs = func.getJsDocs()
  if (existingDocs.length > 0) {
    return code // Already has documentation
  }

  const comment = generateFunctionComment(func, options)
  func.insertText(0, comment + '\n')

  return sourceFile.getFullText()
}

/**
 * Insert TSDoc comment above a class
 */
export function addClassComment(
  code: string,
  className: string,
  options: CommentOptions = {},
  filePath: string = 'temp.ts'
): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const cls = sourceFile.getClass(className)

  if (!cls) {
    throw new Error(`Class '${className}' not found`)
  }

  // Check if already has JSDoc
  const existingDocs = cls.getJsDocs()
  if (existingDocs.length > 0) {
    return code // Already has documentation
  }

  const comment = generateClassComment(cls, options)
  cls.insertText(0, comment + '\n')

  return sourceFile.getFullText()
}

/**
 * Insert TSDoc comment above all methods in a class
 */
export function addMethodComments(
  code: string,
  className: string,
  options: CommentOptions = {},
  filePath: string = 'temp.ts'
): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const cls = sourceFile.getClass(className)

  if (!cls) {
    throw new Error(`Class '${className}' not found`)
  }

  cls.getMethods().forEach(method => {
    const existingDocs = method.getJsDocs()
    if (existingDocs.length === 0) {
      const comment = generateFunctionComment(method, options)
      method.insertText(0, comment + '\n')
    }
  })

  return sourceFile.getFullText()
}

/**
 * Insert TSDoc comments for all functions in code
 */
export function addAllFunctionComments(
  code: string,
  options: CommentOptions = {},
  filePath: string = 'temp.ts'
): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  // Add comments to standalone functions
  sourceFile.getFunctions().forEach(func => {
    const existingDocs = func.getJsDocs()
    if (existingDocs.length === 0) {
      const comment = generateFunctionComment(func, options)
      func.insertText(0, comment + '\n')
    }
  })

  return sourceFile.getFullText()
}

/**
 * Insert TSDoc comments for all classes and their methods
 */
export function addAllClassComments(
  code: string,
  options: CommentOptions = {},
  filePath: string = 'temp.ts'
): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  sourceFile.getClasses().forEach(cls => {
    // Add class comment
    const classExists = cls.getJsDocs()
    if (classExists.length === 0) {
      const classComment = generateClassComment(cls, options)
      cls.insertText(0, classComment + '\n')
    }

    // Add method comments
    cls.getMethods().forEach(method => {
      const methodExists = method.getJsDocs()
      if (methodExists.length === 0) {
        const methodComment = generateFunctionComment(method, options)
        method.insertText(0, methodComment + '\n')
      }
    })
  })

  return sourceFile.getFullText()
}

/**
 * Insert TSDoc comments for all exports
 */
export function addExportComments(
  code: string,
  options: CommentOptions = {},
  filePath: string = 'temp.ts'
): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  // Functions
  sourceFile.getFunctions().forEach(func => {
    if (func.isExported() && func.getJsDocs().length === 0) {
      const comment = generateFunctionComment(func, options)
      func.insertText(0, comment + '\n')
    }
  })

  // Classes
  sourceFile.getClasses().forEach(cls => {
    if (cls.isExported() && cls.getJsDocs().length === 0) {
      const comment = generateClassComment(cls, options)
      cls.insertText(0, comment + '\n')
    }
  })

  // Interfaces
  sourceFile.getInterfaces().forEach(iface => {
    if (iface.isExported() && iface.getJsDocs().length === 0) {
      const interfaceName = iface.getName()
      const comment = `/**\n * ${interfaceName}\n *\n * TODO: Add interface description\n */`
      iface.insertText(0, comment + '\n')
    }
  })

  // Type aliases
  sourceFile.getTypeAliases().forEach(typeAlias => {
    if (typeAlias.isExported() && typeAlias.getJsDocs().length === 0) {
      const typeName = typeAlias.getName()
      typeAlias.addJsDoc({
        description: `${typeName}\n\nTODO: Add type description`
      })
    }
  })

  return sourceFile.getFullText()
}

/**
 * Generate inline comment for a specific line
 */
export function addInlineComment(
  code: string,
  lineNumber: number,
  comment: string
): string {
  const lines = code.split('\n')

  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`Line number ${lineNumber} is out of range`)
  }

  const lineIndex = lineNumber - 1
  const line = lines[lineIndex]
  const indent = line.match(/^\s*/)?.[0] || ''

  lines.splice(lineIndex, 0, `${indent}// ${comment}`)

  return lines.join('\n')
}

/**
 * Generate file header comment
 */
export function addFileHeader(
  code: string,
  options: {
    fileName?: string
    description?: string
    author?: string
    license?: string
    copyright?: string
  } = {}
): string {
  const { fileName, description, author, license, copyright } = options

  let header = `/**\n`

  if (fileName) {
    header += ` * @file ${fileName}\n`
  }

  if (description) {
    header += ` * @description ${description}\n`
  }

  if (author) {
    header += ` * @author ${author}\n`
  }

  if (copyright) {
    header += ` * @copyright ${copyright}\n`
  }

  if (license) {
    header += ` * @license ${license}\n`
  }

  header += ` */\n\n`

  return header + code
}

/**
 * Update existing JSDoc comment
 */
export function updateFunctionComment(
  code: string,
  functionName: string,
  updates: {
    description?: string
    paramDescriptions?: Record<string, string>
    returnDescription?: string
  },
  filePath: string = 'temp.ts'
): string {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const func = sourceFile.getFunction(functionName)

  if (!func) {
    throw new Error(`Function '${functionName}' not found`)
  }

  const docs = func.getJsDocs()
  if (docs.length === 0) {
    throw new Error(`Function '${functionName}' has no JSDoc to update`)
  }

  const doc = docs[0]

  if (updates.description) {
    doc.setDescription(updates.description)
  }

  // Update parameter descriptions
  if (updates.paramDescriptions) {
    Object.entries(updates.paramDescriptions).forEach(([paramName, description]) => {
      const tags = doc.getTags()
      const paramTag = tags.find(
        tag => tag.getTagName() === 'param' && tag.getText().includes(paramName)
      )
      if (paramTag) {
        paramTag.replaceWithText(`@param ${paramName} - ${description}`)
      }
    })
  }

  return sourceFile.getFullText()
}

// Export the tool for ADK integration
import { createTool } from '@iqai/adk'
import { z } from 'zod'

export const commentInserterTool = createTool({
  name: 'commentInserterTool',
  description: 'Add TSDoc comments to TypeScript/JavaScript code',
  schema: z.object({
    code: z.string(),
    functionName: z.string().optional(),
    description: z.string().optional(),
    filePath: z.string().optional()
  }),
  fn: async (args) => {
    const { code, functionName, filePath } = args
    if (functionName) {
      return addFunctionComment(code, functionName, {}, filePath || 'temp.ts')
    } else if (code) {
      return addFileHeader(code, args)
    }
    return code
  }
})
