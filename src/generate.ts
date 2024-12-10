import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { analyzeComponent } from './type-tree/analyzer.js'
import type { ComponentDescriptor, JSXAutoDocsResult } from './types.js'

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
  currentIndent: string = '',
  isInsideObject: boolean = false,
): string => {
  const nextIndent = currentIndent + ' '.repeat(indentLevel)

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

    const items = value
      .map((item) => serializeJSXValue(item, indentLevel, nextIndent, true))
      .join(', ')

    return isInsideObject ? `[${items}]` : `{[${items}]}`
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([key]) => !isDynamicKey(key))
      .map(
        ([key, val]) =>
          `${nextIndent}${key}: ${serializeJSXValue(
            val,
            indentLevel,
            nextIndent,
            true,
          )}`,
      )
      .join(',\n')

    return `{\n${entries}\n${currentIndent}}`
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

  const serializeProps = (
    propsObject: Record<string, any>,
    currentIndent: string,
  ): string[] => {
    return Object.entries(propsObject)
      .filter(([key]) => !isDynamicKey(key))
      .map(([key, value]) => {
        const serializedValue = serializeJSXValue(
          value,
          indentLevel,
          currentIndent,
        )
        return `${currentIndent}${key}=${serializedValue}`
      })
  }

  const buildJSX = (propsFormatted: string[]): string => {
    if (propsFormatted.length === 0) {
      return `<${name} />`
    }
    return `<${name}\n${propsFormatted.join('\n')}\n/>`
  }

  const minimalPropsFormatted = serializeProps(
    required,
    ' '.repeat(indentLevel),
  )

  const completePropsFormatted = serializeProps(props, ' '.repeat(indentLevel))

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
 * This function reads the TSX component file at the provided path, generates
 * the associated documentation, and includes the specified package name for
 * imports in the documentation. The indentation level for the generated
 * documentation is configured according to the specified value.
 *
 * @param {string} path - The path to the TSX component file.
 * @param {string} importPackageName - The path to your `package.json` or the name of the package used for imports in the component.
 * @param {number} [indentLevel=2] - The indentation level for the generated documentation. The default value is 2.
 *
 * @returns {Promise<JSXAutoDocsResult>} A Promise that resolves with the generated documentation for the component.
 *
 * @async
 */
export async function generateDocs(
  path: string,
  importPackageName: string,
  indentLevel: number = 2,
): Promise<JSXAutoDocsResult> {
  if (!path) {
    return {
      component: '',
      import: '',
      minimal: '',
      complete: '',
    }
  }

  const packageName = await getPackageName(importPackageName)
  const component = await analyzeComponent(path)
  const jsxObject = generateJSX(component, packageName, indentLevel)

  return jsxObject
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
