import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { analyzeComponentFromCode } from './type-tree/analyzerFromCode.js'
import { analyzeComponentFromPath } from './type-tree/analyzerFromPath.js'
import type {
  ComponentDescriptor,
  JSXAutoDocsResult,
  JSXGenerateDocs,
} from './types.js'

const isDynamicKey = (key: string): boolean => /^\[.*\]$/.test(key)

const isFunctionString = (value: string): boolean => {
  const trimmed = value.trim()
  return (
    trimmed.startsWith('() =>') ||
    trimmed.startsWith('function') ||
    /^[a-zA-Z_]\w*\s*\(/.test(trimmed)
  )
}

const serializeJSXValue = (
  value: any,
  indentLevel: number,
  depth: number = 0,
  isInsideObject: boolean = false,
): string => {
  const currentIndent = ' '.repeat(indentLevel * depth)
  const nextDepth = depth + 1
  const nextIndent = ' '.repeat(indentLevel * nextDepth)

  if (typeof value === 'string') {
    if (isFunctionString(value)) {
      return isInsideObject ? value : `{${value}}`
    }
    return `"${value}"`
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `{${value}}`
  }

  if (typeof value === 'function') {
    return isInsideObject ? value.toString() : `{${value.toString()}}`
  }

  if (Array.isArray(value)) {
    if (
      value.length === 1 &&
      typeof value[0] === 'object' &&
      Object.keys(value[0]).length === 0
    ) {
      return isInsideObject ? '[]' : '{[]}'
    }

    const entries = value
      .map((item) => serializeJSXValue(item, indentLevel, nextDepth, true))
      .join(`,\n${nextIndent}`)

    const arrayContent = `[\n${nextIndent}${entries}\n${currentIndent}]`

    return isInsideObject ? arrayContent : `{${arrayContent}}`
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([key]) => !isDynamicKey(key))
      .map(
        ([key, val]) =>
          `${nextIndent}${key}: ${serializeJSXValue(
            val,
            indentLevel,
            nextDepth,
            true,
          )}`,
      )
      .join(',\n')

    if (!entries) {
      return isInsideObject ? '{}' : '{{}}'
    }

    const objectContent = `{\n${entries}\n${currentIndent}}`

    return isInsideObject ? objectContent : `{${objectContent}}`
  }

  return `{${JSON.stringify(value)}}`
}

/**
 * Generates the JSX version of the documentation for a given component.
 *
 * This function generates the JSX markup for a component's documentation,
 * including its properties and required types, based on the provided
 * component descriptor. The generated JSX documentation can be used
 * to represent the component in a structured, readable format.
 *
 * @param {ComponentDescriptor} component - The component descriptor object
 * containing information about the component's properties, types, and other details.
 * @param {string} importPackageName - The name of the package used to import the component.
 * @param {number} [indentLevel=2] - The indentation level for the generated JSX documentation. Default is 2.
 *
 * @returns {JSXAutoDocsResult} The generated JSX documentation for the component.
 */
export function generateJSX(
  component: ComponentDescriptor,
  importPackageName: string,
  indentLevel: number = 2,
): JSXAutoDocsResult {
  const { name, props, required } = component

  const serializeProps = (propsObject: Record<string, any>): string[] => {
    const propIndent = ' '.repeat(indentLevel)

    return Object.entries(propsObject)
      .filter(([key]) => !isDynamicKey(key))
      .map(([key, value]) => {
        const serializedValue = serializeJSXValue(value, indentLevel, 1, false)
        return `${propIndent}${key}=${serializedValue}`
      })
  }

  const buildJSX = (propsFormatted: string[]): string => {
    if (propsFormatted.length === 0) {
      return `<${name} />`
    }
    return `<${name}\n${propsFormatted.join('\n')}\n/>`
  }

  const minimalPropsFormatted = serializeProps(required)
  const completePropsFormatted = serializeProps(props)
  const minimalJSX = buildJSX(minimalPropsFormatted)
  const completeJSX = buildJSX(completePropsFormatted)
  const exportType = component.exportType === 'named' ? `{ ${name} }` : name
  const importSyntax = `import ${exportType} from '${importPackageName}'`

  return {
    component: name,
    import: importSyntax,
    minimal: minimalJSX,
    complete: completeJSX,
  }
}

/**
 * Checks if the provided path is a valid path to a package.json file,
 * and extracts the `name` property from the JSON if it exists.
 *
 * @param {string} filePath - The path to the package.json file.
 * @returns {Promise<string | undefined>} The `name` property of the package.json, or `undefined` if not found.
 */
async function getPackageName(filePath: string): Promise<string> {
  try {
    const resolvedPath = resolve(filePath)
    const jsonPath = resolvedPath.endsWith('package.json')
      ? resolvedPath
      : join(resolvedPath, 'package.json')

    try {
      await fs.access(jsonPath)
    } catch {
      return filePath
    }

    const fileContent = await fs.readFile(jsonPath, 'utf-8')
    const jsonData = JSON.parse(fileContent)

    return jsonData.name
  } catch {
    return filePath
  }
}

/**
 * Generates documentation for a single TSX component.
 *
 * This function generates the associated documentation based on the provided options.
 * It supports two modes:
 * 1. By providing the `path` to the component file.
 * 2. By directly passing the `source` code and a `program` for analysis.
 *
 * The function also allows specifying a package name for imports in the documentation.
 * The indentation level for the generated documentation can be customized.
 * Additional options can be passed to control the depth and scope of the analysis.
 *
 * @param {JSXGenerateDocs} options - The options for generating documentation.
 *   - When `path` is provided:
 *     @property {string} path - The path to the TSX component file.
 *     @property {string} tsconfigPath - Path to the TypeScript configuration file.
 *     @property {string} packageName - The name of the package used for imports in the component.
 *     @property {number} [indentLevel=2] - The indentation level for the generated documentation. Default is 2.
 *     @property {number} maxDepth - The maximum depth for nested components or structures in the documentation.
 *     @property {number} maxProperties - The maximum number of properties to include in the generated documentation.
 *     @property {number} maxSubProperties - The maximum number of sub-properties to include for nested objects.
 *     @property {number} maxUnionMembers - The maximum number of members to include for union types in the documentation.
 *   - When `source` and `program` are provided:
 *     @property {string} source - The source code of the TSX component to analyze.
 *     @property {ts.Program} program - A TypeScript program instance used for analysis.
 *     @property {string} packageName - The name of the package used for imports in the component.
 *     @property {number} [indentLevel=2] - The indentation level for the generated documentation. Default is 2.
 *     @property {number} maxDepth - The maximum depth for nested components or structures in the documentation.
 *     @property {number} maxProperties - The maximum number of properties to include in the generated documentation.
 *     @property {number} maxSubProperties - The maximum number of sub-properties to include for nested objects.
 *     @property {number} maxUnionMembers - The maximum number of members to include for union types in the documentation.
 *
 * @returns {Promise<JSXAutoDocsResult>} A Promise that resolves with the generated documentation for the component.
 *
 * @async
 */
export async function generateDocs(
  options: JSXGenerateDocs,
): Promise<JSXAutoDocsResult> {
  const {
    packageName,
    indentLevel = 2,
    maxDepth = 100,
    maxProperties = 100,
    maxSubProperties = 100,
    maxUnionMembers = 100,
  } = options

  const hasPath = 'path' in options
  const hasSourceAndProgram = 'source' in options && 'program' in options

  if (!(hasPath || hasSourceAndProgram)) {
    return {
      component: '',
      import: '',
      minimal: '',
      complete: '',
    }
  }

  const resultPackageName = await getPackageName(packageName)
  let component: ComponentDescriptor = {
    name: '',
    exportType: undefined,
    props: {},
    required: {},
  }

  if ('path' in options) {
    const { path, tsconfigPath } = options

    component = await analyzeComponentFromPath(
      path,
      {
        maxDepth,
        maxProperties,
        maxSubProperties,
        maxUnionMembers,
      },
      tsconfigPath,
    )
  } else if ('source' in options && 'program' in options) {
    const { source, program } = options

    component = await analyzeComponentFromCode(source, program, {
      maxDepth,
      maxProperties,
      maxSubProperties,
      maxUnionMembers,
    })
  } else {
    return {
      component: '',
      import: '',
      minimal: '',
      complete: '',
    }
  }

  return generateJSX(component, resultPackageName, indentLevel)
}

const getJSXAutoDocsFromWindow = (): Set<JSXAutoDocsResult> | undefined =>
  typeof window !== 'undefined' ? (window as any).__jsxAutoDocs : undefined

/**
 * Retrieves JSX documentation generated by the Vite plugin.
 *
 * This function searches the global `Set` created by the Vite plugin
 * (accessible via `window.__jsxAutoDocs`) for a specific keyword
 * and returns the matching documentation object, if found.
 *
 * @param {string} keyword - The keyword to search for in the generated JSX documentation.
 *
 * @returns {JSXAutoDocsResult | null} The matching JSX documentation object, or the same object but empty.
 */
export function findJSXAutoDocs(keyword: string): JSXAutoDocsResult {
  const componentDocs = getJSXAutoDocsFromWindow()
  const output: JSXAutoDocsResult = {
    component: '',
    import: '',
    minimal: '',
    complete: '',
  }

  if (componentDocs) {
    const found = Array.from(componentDocs).find(
      (doc) =>
        typeof doc === 'object' &&
        doc.component &&
        doc.component.toLowerCase() === keyword.toLowerCase(),
    )

    return found || output
  }

  return output
}
