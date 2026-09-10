import { Project, SyntaxKind, Node } from 'ts-morph'

/**
 * AST Query Tool
 * Query and search TypeScript AST for specific symbols, patterns, and structures
 */

export interface SymbolInfo {
  name: string
  kind: string
  filePath: string
  line: number
  column: number
  text: string
}

export interface QueryOptions {
  includePrivate?: boolean
  includeImported?: boolean
  includeExported?: boolean
  recursive?: boolean
}

/**
 * Query all function calls in code
 */
export function findFunctionCalls(
  code: string,
  functionName?: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const calls: SymbolInfo[] = []

  sourceFile.forEachDescendant(node => {
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression()
      let callName = ''

      if (Node.isIdentifier(expression)) {
        callName = expression.getText()
      } else if (Node.isPropertyAccessExpression(expression)) {
        callName = expression.getName()
      }

      if (!functionName || callName === functionName) {
        calls.push({
          name: callName,
          kind: 'call',
          filePath,
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          text: node.getText(),
        })
      }
    }
  })

  return calls
}

/**
 * Find all imports of a specific module
 */
export function findImportsFrom(
  code: string,
  moduleName: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const imports: SymbolInfo[] = []

  sourceFile.getImportDeclarations().forEach(imp => {
    const moduleSpecifier = imp.getModuleSpecifierValue()

    if (moduleSpecifier === moduleName || moduleSpecifier.includes(moduleName)) {
      const namedImports = imp.getNamedImports().map(n => n.getName())
      const defaultImport = imp.getDefaultImport()?.getText()
      const namespaceImport = imp.getNamespaceImport()?.getText()

      const importedNames = [
        ...(defaultImport ? [defaultImport] : []),
        ...(namespaceImport ? [namespaceImport] : []),
        ...namedImports,
      ]

      imports.push({
        name: importedNames.join(', '),
        kind: 'import',
        filePath,
        line: imp.getStartLineNumber(),
        column: imp.getStartLinePos(),
        text: imp.getText(),
      })
    }
  })

  return imports
}

/**
 * Find all exports from code
 */
export function findAllExports(
  code: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const exports: SymbolInfo[] = []

  // Exported functions
  sourceFile.getFunctions().forEach(func => {
    if (func.isExported()) {
      exports.push({
        name: func.getName() || '<anonymous>',
        kind: 'function',
        filePath,
        line: func.getStartLineNumber(),
        column: func.getStartLinePos(),
        text: func.getText(),
      })
    }
  })

  // Exported classes
  sourceFile.getClasses().forEach(cls => {
    if (cls.isExported()) {
      exports.push({
        name: cls.getName() || '<anonymous>',
        kind: 'class',
        filePath,
        line: cls.getStartLineNumber(),
        column: cls.getStartLinePos(),
        text: cls.getText(),
      })
    }
  })

  // Exported variables
  sourceFile.getVariableStatements().forEach(varStmt => {
    if (varStmt.isExported()) {
      varStmt.getDeclarations().forEach(decl => {
        exports.push({
          name: decl.getName(),
          kind: 'variable',
          filePath,
          line: decl.getStartLineNumber(),
          column: decl.getStartLinePos(),
          text: decl.getText(),
        })
      })
    }
  })

  // Exported interfaces
  sourceFile.getInterfaces().forEach(iface => {
    if (iface.isExported()) {
      exports.push({
        name: iface.getName(),
        kind: 'interface',
        filePath,
        line: iface.getStartLineNumber(),
        column: iface.getStartLinePos(),
        text: iface.getText(),
      })
    }
  })

  return exports
}

/**
 * Find all variable declarations
 */
export function findVariableDeclarations(
  code: string,
  variableName?: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const variables: SymbolInfo[] = []

  sourceFile.getVariableDeclarations().forEach(varDecl => {
    const name = varDecl.getName()

    if (!variableName || name === variableName) {
      variables.push({
        name,
        kind: 'variable',
        filePath,
        line: varDecl.getStartLineNumber(),
        column: varDecl.getStartLinePos(),
        text: varDecl.getText(),
      })
    }
  })

  return variables
}

/**
 * Find all class methods matching a name
 */
export function findClassMethods(
  code: string,
  className?: string,
  methodName?: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const methods: SymbolInfo[] = []

  sourceFile.getClasses().forEach(cls => {
    const clsName = cls.getName()

    if (!className || clsName === className) {
      cls.getMethods().forEach(method => {
        const methName = method.getName()

        if (!methodName || methName === methodName) {
          methods.push({
            name: `${clsName}.${methName}`,
            kind: 'method',
            filePath,
            line: method.getStartLineNumber(),
            column: method.getStartLinePos(),
            text: method.getText(),
          })
        }
      })
    }
  })

  return methods
}

/**
 * Find all async functions
 */
export function findAsyncFunctions(
  code: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const asyncFuncs: SymbolInfo[] = []

  // Function declarations
  sourceFile.getFunctions().forEach(func => {
    if (func.isAsync()) {
      asyncFuncs.push({
        name: func.getName() || '<anonymous>',
        kind: 'function',
        filePath,
        line: func.getStartLineNumber(),
        column: func.getStartLinePos(),
        text: func.getText(),
      })
    }
  })

  // Arrow functions
  sourceFile.getVariableDeclarations().forEach(varDecl => {
    const initializer = varDecl.getInitializer()
    if (initializer && Node.isArrowFunction(initializer) && initializer.isAsync()) {
      asyncFuncs.push({
        name: varDecl.getName(),
        kind: 'arrow_function',
        filePath,
        line: varDecl.getStartLineNumber(),
        column: varDecl.getStartLinePos(),
        text: varDecl.getText(),
      })
    }
  })

  // Class methods
  sourceFile.getClasses().forEach(cls => {
    cls.getMethods().forEach(method => {
      if (method.isAsync()) {
        asyncFuncs.push({
          name: `${cls.getName()}.${method.getName()}`,
          kind: 'method',
          filePath,
          line: method.getStartLineNumber(),
          column: method.getStartLinePos(),
          text: method.getText(),
        })
      }
    })
  })

  return asyncFuncs
}

/**
 * Find all TODO/FIXME comments
 */
export function findTodoComments(
  code: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const todos: SymbolInfo[] = []
  const lines = code.split('\n')

  lines.forEach((line, index) => {
    const todoMatch = line.match(/(TODO|FIXME|HACK|XXX|NOTE):?\s*(.+)/i)
    if (todoMatch) {
      todos.push({
        name: todoMatch[1].toUpperCase(),
        kind: 'comment',
        filePath,
        line: index + 1,
        column: line.indexOf(todoMatch[0]),
        text: todoMatch[2].trim(),
      })
    }
  })

  return todos
}

/**
 * Find all type references to a specific type
 */
export function findTypeReferences(
  code: string,
  typeName: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const references: SymbolInfo[] = []

  sourceFile.forEachDescendant(node => {
    if (Node.isTypeReference(node)) {
      const typeText = node.getTypeName().getText()
      if (typeText === typeName) {
        references.push({
          name: typeName,
          kind: 'type_reference',
          filePath,
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          text: node.getText(),
        })
      }
    }
  })

  return references
}

/**
 * Find all property access expressions (e.g., obj.prop)
 */
export function findPropertyAccess(
  code: string,
  objectName?: string,
  propertyName?: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const accesses: SymbolInfo[] = []

  sourceFile.forEachDescendant(node => {
    if (Node.isPropertyAccessExpression(node)) {
      const expression = node.getExpression()
      const property = node.getName()
      const objName = expression.getText()

      if (
        (!objectName || objName === objectName) &&
        (!propertyName || property === propertyName)
      ) {
        accesses.push({
          name: `${objName}.${property}`,
          kind: 'property_access',
          filePath,
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          text: node.getText(),
        })
      }
    }
  })

  return accesses
}

/**
 * Get symbol at specific line and column
 */
export function getSymbolAtPosition(
  code: string,
  line: number,
  column: number,
  filePath: string = 'temp.ts'
): SymbolInfo | null {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  // Calculate position from line and column
  const lines = sourceFile.getFullText().split('\n')
  let pos = 0
  for (let i = 0; i < Math.min(line - 1, lines.length - 1); i++) {
    pos += lines[i].length + 1 // +1 for newline
  }
  pos += Math.min(column, lines[line - 1]?.length || 0)
  
  const node = sourceFile.getDescendantAtPos(pos)

  if (!node) return null

  return {
    name: node.getText(),
    kind: node.getKindName(),
    filePath,
    line: node.getStartLineNumber(),
    column: node.getStartLinePos(),
    text: node.getText(),
  }
}

/**
 * Find all unused imports
 */
export function findUnusedImports(
  code: string,
  filePath: string = 'temp.ts'
): SymbolInfo[] {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile(filePath, code)

  const unused: SymbolInfo[] = []

  sourceFile.getImportDeclarations().forEach(imp => {
    const namedImports = imp.getNamedImports()

    namedImports.forEach(namedImport => {
      const name = namedImport.getName()
      const references = sourceFile
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .filter(id => id.getText() === name && id !== namedImport.getNameNode())

      if (references.length === 0) {
        unused.push({
          name,
          kind: 'unused_import',
          filePath,
          line: namedImport.getStartLineNumber(),
          column: namedImport.getStartLinePos(),
          text: namedImport.getText(),
        })
      }
    })
  })

  return unused
}
