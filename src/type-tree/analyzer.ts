import { promises as fs } from 'node:fs'
import ts from 'typescript'
import { getTypeInfoAtPosition } from './index.js'
import { typeTreeTransformer } from './transformer.js'
import type { ComponentDescriptor } from './types.js'

/**
 * Analyzes a TSX component and returns its descriptor object.
 *
 * This function takes the path to a TSX component file, analyzes its structure,
 * and returns a descriptor object representing the component's properties and types.
 *
 * @param {string} filePath - The path to the TSX component file to analyze.
 *
 * @returns {Promise<ComponentDescriptor>} A Promise that resolves with the component's descriptor object.
 *
 * @async
 */
export async function analyzeComponent(
  filePath: string,
): Promise<ComponentDescriptor> {
  const output: ComponentDescriptor = {
    name: '',
    props: {},
    required: {},
  }

  try {
    await fs.access(filePath)
  } catch {
    return output
  }

  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.React,
    strict: true,
  })

  const checker = program.getTypeChecker()
  const sourceFile = program.getSourceFile(filePath)

  if (!sourceFile) {
    return output
  }

  const sourceSymbol = checker.getSymbolAtLocation(sourceFile)
  if (!sourceSymbol) {
    return output
  }

  const exportsSymbols = checker.getExportsOfModule(sourceSymbol)

  let exportedFunctionNode: ts.Node | null = null

  function isFunctionNode(node: ts.Node): boolean {
    if (ts.isFunctionDeclaration(node)) {
      return true
    }

    if (ts.isVariableDeclaration(node)) {
      if (
        node.initializer &&
        (ts.isArrowFunction(node.initializer) ||
          ts.isFunctionExpression(node.initializer))
      ) {
        return true
      }
    }

    return false
  }

  for (const expSym of exportsSymbols) {
    let originalSymbol = expSym

    if (expSym.flags & ts.SymbolFlags.Alias) {
      originalSymbol = checker.getAliasedSymbol(expSym)
    }

    const declarations = originalSymbol.getDeclarations()
    if (!declarations) continue

    for (const decl of declarations) {
      if (isFunctionNode(decl)) {
        exportedFunctionNode = decl
        break
      }
    }

    if (exportedFunctionNode) break
  }

  if (!exportedFunctionNode) {
    return output
  }

  let position: number

  if (
    ts.isFunctionDeclaration(exportedFunctionNode) &&
    exportedFunctionNode.name
  ) {
    position = exportedFunctionNode.name.getStart()
  } else if (
    ts.isVariableDeclaration(exportedFunctionNode) &&
    ts.isIdentifier(exportedFunctionNode.name)
  ) {
    position = exportedFunctionNode.name.getStart()
  } else {
    return output
  }

  const typeInfo = getTypeInfoAtPosition(ts, checker, sourceFile, position)
  const transformedTypeInfo = typeTreeTransformer(typeInfo)

  return transformedTypeInfo
}
