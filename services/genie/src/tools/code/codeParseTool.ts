import { Project, SourceFile, Node, VariableDeclarationKind } from 'ts-morph'
import { createTool } from '@iqai/adk'
import { z } from 'zod'

/**
 * Code Parse Tool
 * Uses ts-morph to parse TypeScript/JavaScript code and extract AST information
 */

export interface ParsedFunction {
  name: string
  parameters: Array<{ name: string; type: string }>
  returnType: string
  isAsync: boolean
  isExported: boolean
  documentation?: string
  startLine: number
  endLine: number
}

export interface ParsedClass {
  name: string
  isExported: boolean
  isAbstract: boolean
  methods: ParsedFunction[]
  properties: Array<{
    name: string
    type: string
    isReadonly: boolean
    isStatic: boolean
  }>
  documentation?: string
  startLine: number
  endLine: number
}

export interface ParsedInterface {
  name: string
  isExported: boolean
  properties: Array<{ name: string; type: string }>
  documentation?: string
  startLine: number
  endLine: number
}

export interface ParsedImport {
  moduleSpecifier: string
  namedImports: string[]
  defaultImport?: string
  namespaceImport?: string
}

export interface ParsedExport {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'variable'
  isDefault: boolean
}

export interface ParseResult {
  filePath: string
  functions: ParsedFunction[]
  classes: ParsedClass[]
  interfaces: ParsedInterface[]
  imports: ParsedImport[]
  exports: ParsedExport[]
  errors: string[]
}

/**
 * Parse TypeScript/JavaScript code and extract structural information
 */
export function parseCode(
  code: string,
  filePath: string = 'temp.ts'
): ParseResult {
  const errors: string[] = []

  try {
    // Create in-memory project
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: 99, // ESNext
        module: 99, // ESNext
      },
    })

    // Add source file
    const sourceFile = project.createSourceFile(filePath, code)

    // Extract functions
    const functions = extractFunctions(sourceFile)

    // Extract classes
    const classes = extractClasses(sourceFile)

    // Extract interfaces
    const interfaces = extractInterfaces(sourceFile)

    // Extract imports
    const imports = extractImports(sourceFile)

    // Extract exports
    const exports = extractExports(sourceFile)

    return {
      filePath,
      functions,
      classes,
      interfaces,
      imports,
      exports,
      errors,
    }
  } catch (error) {
    errors.push(
      error instanceof Error ? error.message : 'Unknown parsing error'
    )
    return {
      filePath,
      functions: [],
      classes: [],
      interfaces: [],
      imports: [],
      exports: [],
      errors,
    }
  }
}

/**
 * Extract function declarations from source file
 */
function extractFunctions(sourceFile: SourceFile): ParsedFunction[] {
  const functions: ParsedFunction[] = []

  // Get function declarations
  sourceFile.getFunctions().forEach(func => {
    const params = func.getParameters().map(param => ({
      name: param.getName(),
      type: param.getType().getText(),
    }))

    const returnType = func.getReturnType().getText()
    const docs = func.getJsDocs()
    const documentation = docs.length > 0 ? docs[0].getDescription() : undefined

    functions.push({
      name: func.getName() || '<anonymous>',
      parameters: params,
      returnType,
      isAsync: func.isAsync(),
      isExported: func.isExported(),
      documentation,
      startLine: func.getStartLineNumber(),
      endLine: func.getEndLineNumber(),
    })
  })

  // Get arrow functions assigned to variables
  sourceFile.getVariableDeclarations().forEach(varDecl => {
    const initializer = varDecl.getInitializer()
    if (initializer && Node.isArrowFunction(initializer)) {
      const params = initializer.getParameters().map(param => ({
        name: param.getName(),
        type: param.getType().getText(),
      }))

      const returnType = initializer.getReturnType().getText()

      functions.push({
        name: varDecl.getName(),
        parameters: params,
        returnType,
        isAsync: initializer.isAsync(),
        isExported: varDecl.isExported(),
        documentation: undefined,
        startLine: varDecl.getStartLineNumber(),
        endLine: varDecl.getEndLineNumber(),
      })
    }
  })

  return functions
}

/**
 * Extract class declarations from source file
 */
function extractClasses(sourceFile: SourceFile): ParsedClass[] {
  return sourceFile.getClasses().map(cls => {
    const methods = cls.getMethods().map(method => ({
      name: method.getName(),
      parameters: method.getParameters().map(param => ({
        name: param.getName(),
        type: param.getType().getText(),
      })),
      returnType: method.getReturnType().getText(),
      isAsync: method.isAsync(),
      isExported: false,
      documentation: method.getJsDocs()[0]?.getDescription(),
      startLine: method.getStartLineNumber(),
      endLine: method.getEndLineNumber(),
    }))

    const properties = cls.getProperties().map(prop => ({
      name: prop.getName(),
      type: prop.getType().getText(),
      isReadonly: prop.isReadonly(),
      isStatic: prop.isStatic(),
    }))

    const docs = cls.getJsDocs()

    return {
      name: cls.getName() || '<anonymous>',
      isExported: cls.isExported(),
      isAbstract: cls.isAbstract(),
      methods,
      properties,
      documentation: docs.length > 0 ? docs[0].getDescription() : undefined,
      startLine: cls.getStartLineNumber(),
      endLine: cls.getEndLineNumber(),
    }
  })
}

/**
 * Extract interface declarations from source file
 */
function extractInterfaces(sourceFile: SourceFile): ParsedInterface[] {
  return sourceFile.getInterfaces().map(iface => {
    const properties = iface.getProperties().map(prop => ({
      name: prop.getName(),
      type: prop.getType().getText(),
    }))

    const docs = iface.getJsDocs()

    return {
      name: iface.getName(),
      isExported: iface.isExported(),
      properties,
      documentation: docs.length > 0 ? docs[0].getDescription() : undefined,
      startLine: iface.getStartLineNumber(),
      endLine: iface.getEndLineNumber(),
    }
  })
}

/**
 * Extract import declarations from source file
 */
function extractImports(sourceFile: SourceFile): ParsedImport[] {
  return sourceFile.getImportDeclarations().map(imp => {
    const namedImports =
      imp
        .getNamedImports()
        .map(named => named.getName())
        .filter(Boolean) || []

    const defaultImport = imp.getDefaultImport()?.getText()
    const namespaceImport = imp.getNamespaceImport()?.getText()

    return {
      moduleSpecifier: imp.getModuleSpecifierValue(),
      namedImports,
      defaultImport,
      namespaceImport,
    }
  })
}

/**
 * Extract export declarations from source file
 */
function extractExports(sourceFile: SourceFile): ParsedExport[] {
  const exports: ParsedExport[] = []

  // Exported functions
  sourceFile.getFunctions().forEach(func => {
    if (func.isExported()) {
      exports.push({
        name: func.getName() || '<anonymous>',
        kind: 'function',
        isDefault: func.isDefaultExport(),
      })
    }
  })

  // Exported classes
  sourceFile.getClasses().forEach(cls => {
    if (cls.isExported()) {
      exports.push({
        name: cls.getName() || '<anonymous>',
        kind: 'class',
        isDefault: cls.isDefaultExport(),
      })
    }
  })

  // Exported interfaces
  sourceFile.getInterfaces().forEach(iface => {
    if (iface.isExported()) {
      exports.push({
        name: iface.getName(),
        kind: 'interface',
        isDefault: false,
      })
    }
  })

  // Exported type aliases
  sourceFile.getTypeAliases().forEach(typeAlias => {
    if (typeAlias.isExported()) {
      exports.push({
        name: typeAlias.getName(),
        kind: 'type',
        isDefault: false,
      })
    }
  })

  // Exported variables/constants
  sourceFile.getVariableStatements().forEach(varStmt => {
    if (varStmt.isExported()) {
      varStmt.getDeclarations().forEach(decl => {
        const kind = varStmt.getDeclarationKind()
        exports.push({
          name: decl.getName(),
          kind: kind === VariableDeclarationKind.Const ? 'const' : 'variable',
          isDefault: false,
        })
      })
    }
  })

  return exports
}

/**
 * Find a specific symbol (function, class, etc.) in the code
 */
export function findSymbol(
  code: string,
  symbolName: string,
  filePath: string = 'temp.ts'
): {
  found: boolean
  kind?: string
  line?: number
  details?: ParsedFunction | ParsedClass | ParsedInterface
} {
  const parseResult = parseCode(code, filePath)

  // Search in functions
  const func = parseResult.functions.find(f => f.name === symbolName)
  if (func) {
    return {
      found: true,
      kind: 'function',
      line: func.startLine,
      details: func,
    }
  }

  // Search in classes
  const cls = parseResult.classes.find(c => c.name === symbolName)
  if (cls) {
    return {
      found: true,
      kind: 'class',
      line: cls.startLine,
      details: cls,
    }
  }

  // Search in interfaces
  const iface = parseResult.interfaces.find(i => i.name === symbolName)
  if (iface) {
    return {
      found: true,
      kind: 'interface',
      line: iface.startLine,
      details: iface,
    }
  }

  return { found: false }
}

/**
 * Parse code from a file path
 */
export async function parseFile(filePath: string): Promise<ParseResult> {
  const project = new Project()
  const sourceFile = project.addSourceFileAtPath(filePath)
  const code = sourceFile.getFullText()
  return parseCode(code, filePath)
}

// Export the tool for ADK integration
export const codeParseTool = createTool({
  name: 'codeParseTool',
  description: 'Parse TypeScript/JavaScript code and extract AST information',
  schema: z.object({
    code: z.string(),
    filePath: z.string().optional()
  }),
  fn: async (args) => {
    return parseCode(args.code, args.filePath || 'temp.ts')
  }
})
