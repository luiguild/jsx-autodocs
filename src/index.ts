import { analyzeFunctionType } from './type-tree/analyzer.js'
import type {
  ComponentDescriptor,
  JSXAutoDocsResult,
} from './type-tree/types.js'

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

const generateJSX = (
  component: ComponentDescriptor,
  indentLevel: number = 2,
): {
  component: string
  minimal: string
  complete: string
} => {
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

  return {
    component: name,
    minimal: minimalJSX,
    complete: completeJSX,
  }
}

export async function generateDocs(path: string): Promise<JSXAutoDocsResult> {
  if (!path) {
    return {
      component: '',
      minimal: '',
      complete: '',
    }
  }

  const component = await analyzeFunctionType(path)
  const jsx = generateJSX(component)

  return jsx
}
