import { promises as fs } from 'node:fs'
import ts from 'typescript'
import type { ComponentDescriptor, JSXAutoDocsOptions } from '../types.js'
import { analyzer } from './analyzer.js'

/**
 * Analyzes a TSX component and returns its descriptor object.
 *
 * This function takes the path to a TSX component file, analyzes its structure,
 * and returns a descriptor object representing the component's properties and types.
 *
 * @param {string} filePath - The path to the TSX component file to analyze.
 * @param {JSXAutoDocsOptions} [options] - Additional options for customizing the documentation generation.
 * @param {number} options.maxDepth - The maximum depth for nested components or structures in the documentation.
 * @param {number} options.maxProperties - The maximum number of properties to include in the generated documentation.
 * @param {number} options.maxSubProperties - The maximum number of sub-properties to include for nested objects.
 * @param {number} options.maxUnionMembers - The maximum number of members to include for union types in the documentation.
 * @param {string} tsconfigPath - Path to the TypeScript configuration file.
 *
 * @returns {Promise<ComponentDescriptor>} A Promise that resolves with the component's descriptor object.
 *
 * @async
 */
export async function analyzeComponentFromPath(
  filePath: string,
  options: JSXAutoDocsOptions,
  tsconfigPath?: string,
): Promise<ComponentDescriptor> {
  const output: ComponentDescriptor = {
    name: '',
    exportType: undefined,
    props: {},
    required: {},
  }

  try {
    await fs.access(filePath)
  } catch {
    return output
  }

  let compilerOptions: ts.ParsedCommandLine['options'] = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.React,
    strict: true,
  }

  if (tsconfigPath) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      process.cwd(),
    )

    compilerOptions = parsedConfig.options
  }

  const program = ts.createProgram([filePath], compilerOptions)
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

  return analyzer(
    output,
    sourceSymbol,
    exportsSymbols,
    checker,
    sourceFile,
    options,
  )
}
