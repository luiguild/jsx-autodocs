import ts, { type __String } from 'typescript'
import type {
  Analyzer,
  ComponentDescriptor,
  JSXAutoDocsOptions,
} from '../types.js'
import { getTypeInfoAtPosition } from './getTypes.js'
import { typeTreeTransformer } from './transformer.js'

/**
 * Analyzes a TypeScript component and extracts its type and export information.
 *
 * This function identifies and processes exported functions or variables from a TypeScript
 * source file. It retrieves their type information, transforms the type tree, and determines
 * their export type (named or default). The analysis integrates with the TypeScript
 * compiler API to provide precise type checking and symbol resolution.
 *
 * @param {ComponentDescriptor} output - The initial component descriptor to populate with the analysis result.
 * @param {ts.Symbol} sourceSymbol - The symbol representing the source file being analyzed.
 * @param {ts.Symbol[]} exportsSymbols - The array of symbols representing the exports from the source file.
 * @param {ts.TypeChecker} checker - The TypeScript type checker for performing type and symbol resolution.
 * @param {ts.SourceFile} sourceFile - The source file object representing the TypeScript file to analyze.
 * @param {JSXAutoDocsOptions} options - Configuration options for JSX auto-documentation.
 *
 * @returns {Promise<ComponentDescriptor>} A promise that resolves to the updated component descriptor
 * containing the extracted and transformed type information.
 */
export async function analyzer(
  output: ComponentDescriptor,
  sourceSymbol: ts.Symbol,
  exportsSymbols: ts.Symbol[],
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  options: JSXAutoDocsOptions,
): Promise<Analyzer> {
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
    return { ...output, processedTime: 0 }
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
    return { ...output, processedTime: 0 }
  }

  const typeInfo = getTypeInfoAtPosition(
    ts,
    checker,
    sourceFile,
    position,
    options,
  )
  const transformedTypeInfo = typeTreeTransformer(typeInfo)

  if (exportedFunctionNode) {
    const symbol = checker.getSymbolAtLocation(
      exportedFunctionNode.name || exportedFunctionNode,
    )

    if (!symbol) {
      return { ...output, processedTime: 0 }
    }

    if (sourceSymbol.exports?.has(symbol.escapedName as __String)) {
      transformedTypeInfo.exportType = 'named'
    } else {
      transformedTypeInfo.exportType = 'default'
    }
  }

  return {
    ...transformedTypeInfo,
    processedTime: typeInfo?.processedTime || 0,
  }
}
