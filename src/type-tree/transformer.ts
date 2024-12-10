import type { ComponentDescriptor, TypeInfo, TypeTree } from '../types.js'

export function typeTreeTransformer(input?: TypeInfo): ComponentDescriptor {
  const output: ComponentDescriptor = {
    name: '',
    exportType: undefined,
    props: {},
    required: {},
  }

  if (!input) {
    return output
  }

  output.name = input.name

  if (
    input.typeTree.kind !== 'function' ||
    input.typeTree.signatures.length === 0
  ) {
    return output
  }

  const signature = input.typeTree.signatures[0]!
  if (signature.parameters.length === 0) {
    return output
  }

  const parameter = signature.parameters[0]!
  const typeTree = parameter.type

  output.props = processType(typeTree, false)
  output.required = processType(typeTree, true)

  return output
}

function processType(
  type: TypeTree,
  requiredOnly: boolean,
): Record<string, unknown> {
  let result: Record<string, unknown> = {}

  if (type.kind === 'intersection') {
    for (const subType of type.types) {
      const parsed = processType(subType, requiredOnly)
      result = { ...result, ...parsed }
    }
  } else if (type.kind === 'object') {
    for (const prop of type.properties) {
      const isOptional = isTypeOptional(prop.type)
      const shouldInclude = requiredOnly ? !isOptional : true

      if (shouldInclude) {
        result[prop.name] = getDefaultValue(prop.type, requiredOnly)
      }
    }
  }

  return result
}

function isTypeOptional(type: TypeTree): boolean {
  if (type.kind === 'union') {
    for (const subType of type.types) {
      if (
        subType.kind === 'basic' &&
        (subType.typeName === 'undefined' || subType.typeName === 'null')
      ) {
        return true
      }
    }
  }

  if (type.kind === 'basic') {
    const typeNameLower = type.typeName.toLowerCase()

    if (typeNameLower.includes('undefined') || typeNameLower.includes('null')) {
      return true
    }
  }

  return false
}

function getDefaultValue(type: TypeTree, requiredOnly: boolean): unknown {
  switch (type.kind) {
    case 'basic':
      return getBasicDefaultValue(type.typeName)

    case 'union':
      for (const subType of type.types) {
        if (
          !(
            subType.kind === 'basic' &&
            (subType.typeName === 'undefined' || subType.typeName === 'null')
          )
        ) {
          return getDefaultValue(subType, requiredOnly)
        }
      }

      return ''

    case 'object':
      return processType(type, requiredOnly)

    case 'array':
      return [getDefaultValue(type.elementType, requiredOnly)]

    case 'function':
      return '() => {}'

    case 'promise':
      return '() => {}'

    case 'enum':
      return type.typeName

    case 'intersection': {
      let intersectionResult: Record<string, unknown> = {}
      for (const subType of type.types) {
        const parsed = getDefaultValue(subType, requiredOnly)
        if (typeof parsed === 'object' && parsed !== null) {
          intersectionResult = { ...intersectionResult, ...parsed }
        }
      }
      return intersectionResult
    }

    default:
      return ''
  }
}

function getBasicDefaultValue(typeName: string): unknown {
  switch (typeName) {
    case 'string':
    case 'String':
    case 'null':
      return ''

    case 'number':
    case 'Number':
      return 0

    case 'boolean':
    case 'Boolean':
      return false

    case 'any':
    case 'unknown':
      return ''

    case 'void':
      return '() => {}'

    default:
      return ''
  }
}
