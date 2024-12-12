import type ts from 'typescript'
import type { ComponentDescriptor, JSXAutoDocsOptions } from '../types.js'
import { analyzer } from './analyzer.js'

/**
 * Analyzes a component from its source code to generate a component descriptor.
 *
 * This function processes the provided TypeScript source code and extracts metadata
 * about the component using a TypeScript `Program`. It uses the specified options
 * to guide the analysis and outputs a `ComponentDescriptor` object.
 *
 * @param {string} code - The TypeScript source code of the component to analyze.
 * @param {ts.Program} program - The TypeScript program instance used for type checking and analysis.
 * @param {JSXAutoDocsOptions} [options] - Additional options for customizing the documentation generation.
 * @param {number} options.maxDepth - The maximum depth for nested components or structures in the documentation.
 * @param {number} options.maxProperties - The maximum number of properties to include in the generated documentation.
 * @param {number} options.maxSubProperties - The maximum number of sub-properties to include for nested objects.
 * @param {number} options.maxUnionMembers - The maximum number of members to include for union types in the documentation.
 * @returns {Promise<ComponentDescriptor>} A promise that resolves to the component descriptor containing metadata about the analyzed component.
 */
export async function analyzeComponentFromCode(
  code: string,
  program: ts.Program,
  options: JSXAutoDocsOptions,
): Promise<ComponentDescriptor> {
  const output: ComponentDescriptor = {
    name: '',
    exportType: undefined,
    props: {},
    required: {},
  }

  const sourceFile = program
    .getSourceFiles()
    .find((file) => file.text.includes(code.trim()))

  if (!sourceFile) {
    return output
  }

  const checker = program.getTypeChecker()
  const sourceSymbol = checker.getSymbolAtLocation(sourceFile)

  if (!sourceSymbol) {
    return output
  }

  const exportsSymbols = checker.getExportsOfModule(sourceSymbol)
  const analyzed = await analyzer(
    output,
    sourceSymbol,
    exportsSymbols,
    checker,
    sourceFile,
    options,
  )

  return analyzed
}
