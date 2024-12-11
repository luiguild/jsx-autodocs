import ts, { type Type } from 'typescript'
import type {
  JSXAutoDocsOptions,
  TypeFunctionSignature,
  TypeInfo,
  TypeProperty,
  TypeTree,
} from '../types.js'
import { getDescendantAtRange } from './get-ast-node.js'

const defaultOptions: JSXAutoDocsOptions = {
  maxDepth: 100,
  maxProperties: 100,
  maxSubProperties: 100,
  maxUnionMembers: 100,
}

const primitiveTypesOrder = ['string', 'number', 'bigint', 'boolean', 'symbol']
const falsyTypesOrder = ['null', 'undefined']
const primitiveTypeOrderMap = new Map<string, number>(
  primitiveTypesOrder.map((type, index) => [type, index]),
)
const falsyTypeOrderMap = new Map<string, number>(
  falsyTypesOrder.map((type, index) => [type, index]),
)

const PRIMITIVE_TYPE_FLAGS =
  ts.TypeFlags.String |
  ts.TypeFlags.StringLiteral |
  ts.TypeFlags.Number |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BooleanLiteral |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Void |
  ts.TypeFlags.BigInt |
  ts.TypeFlags.BigIntLiteral |
  ts.TypeFlags.ESSymbol |
  ts.TypeFlags.UniqueESSymbol |
  ts.TypeFlags.Never |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Any

/**
 * Retrieves detailed type information for the symbol at a specific position in a TypeScript source file.
 *
 * This function analyzes the position within the source file, retrieves the symbol at that position,
 * and generates a type tree representation of the symbol's type. It will use the declared type if applicable.
 *
 * @param {typeof ts} typescriptContext - The TypeScript context, typically `ts` from the TypeScript module.
 * @param {ts.TypeChecker} typeChecker - The TypeScript type checker used to resolve type information for symbols.
 * @param {ts.SourceFile} sourceFile - The source file being analyzed.
 * @param {number} position - The position (character offset) within the source file to analyze.
 * @param {JSXAutoDocsOptions} [options] - Additional options for customizing the documentation generation.
 * @param {number} options.maxDepth - The maximum depth for nested components or structures in the documentation.
 * @param {number} options.maxProperties - The maximum number of properties to include in the generated documentation.
 * @param {number} options.maxSubProperties - The maximum number of sub-properties to include for nested objects.
 * @param {number} options.maxUnionMembers - The maximum number of members to include for union types in the documentation.
 *
 * @returns {TypeInfo | undefined} A structured representation of the type at the specified position, or `undefined` if no valid type is found.
 *
 * @throws {Error} If an error occurs during the process of analyzing the type information.
 *
 * @async
 */
export function getTypeInfoAtPosition(
  typescriptContext: typeof ts,
  typeChecker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  position: number,
  options?: JSXAutoDocsOptions,
): TypeInfo | undefined {
  try {
    options = {
      ...defaultOptions,
      ...options,
    }

    const context = {
      propertiesCount: 0 as number,
    }

    const node = getDescendantAtRange(typescriptContext, sourceFile, [
      position,
      position,
    ])
    if (!node || node === sourceFile || !node.parent) {
      return undefined
    }

    const symbol = typeChecker.getSymbolAtLocation(node)
    if (!symbol) {
      return undefined
    }

    let type = typeChecker.getTypeOfSymbolAtLocation(symbol, node)

    const shouldUseDeclaredType = symbol.declarations?.every(
      (d) => d.kind !== typescriptContext.SyntaxKind.VariableDeclaration,
    )

    const declaredType = typeChecker.getDeclaredTypeOfSymbol(symbol)
    if (
      declaredType.flags !== typescriptContext.TypeFlags.Any &&
      shouldUseDeclaredType
    ) {
      type = declaredType
    }

    const name = symbol.getName() || typeChecker.typeToString(type)

    const typeTree = getTypeTree(
      type,
      0,
      new Map<string, TypeTree>(),
      typeChecker,
      typescriptContext,
      options,
      context,
    )

    return {
      typeTree,
      name,
    }
  } catch (error) {
    console.error(error)

    return undefined
  }
}

const excludedProps = new Set(['children'])

function getTypeTree(
  type: ts.Type,
  depth: number,
  visited: Map<string, TypeTree>,
  checker: ts.TypeChecker,
  typescript: typeof ts,
  options: JSXAutoDocsOptions,
  context: { propertiesCount: number; propertyName?: string; kind?: string },
): TypeTree {
  const goingDeep = (
    type: ts.Type,
    propertyName?: string,
    contextKind?: string,
  ): TypeTree => {
    const depthKey = String(depth + 1)
    const cacheKey = `${checker.typeToString(type)}:${propertyName || 'default'}:${contextKind || 'default'}:${depthKey}`

    if (visited.has(cacheKey)) {
      return { kind: 'basic', typeName: checker.typeToString(type) }
    }

    return getTypeTree(type, depth + 1, visited, checker, typescript, options, {
      ...context,
      propertyName,
      kind: contextKind,
    })
  }

  try {
    const propertyName = context.propertyName || 'default'
    const contextKind = context.kind || 'default'
    const typeName = checker.typeToString(
      type,
      undefined,
      ts.TypeFormatFlags.NoTruncation,
    )

    const uniqueId = `${typeName}:${propertyName}:${contextKind}:${depth}`

    if (isPrimitiveType(type)) {
      return {
        kind: 'basic',
        typeName,
      }
    }

    if (visited.has(uniqueId)) {
      return visited.get(uniqueId)!
    }

    let result: TypeTree

    const apparentType = checker.getApparentType(type)

    if (type.isUnion()) {
      const sortedTypes = type.types
        .slice(0, options.maxUnionMembers)
        .sort(sortUnionTypes)
        .map((t) => goingDeep(t, propertyName, 'union'))

      result = {
        kind: 'union',
        typeName,
        types: sortedTypes,
      }
    } else if (type.isIntersection()) {
      const intersectionTypes = type.types.map((t) =>
        goingDeep(t, propertyName, 'intersection'),
      )

      result = {
        kind: 'intersection',
        typeName,
        types: intersectionTypes,
      }
    } else if (checker.isArrayType(type)) {
      const arrayType = checker.getTypeArguments(type as ts.TypeReference)[0]

      if (!arrayType) {
        result = {
          kind: 'array',
          typeName,
          elementType: { kind: 'basic', typeName: 'any' },
        }
      }

      const expandedElementType = goingDeep(
        arrayType as Type,
        `${propertyName}-element`,
        'array',
      )

      result = {
        kind: 'array',
        typeName,
        elementType: expandedElementType,
      }
    } else if (typeName.startsWith('Promise<')) {
      const typeArguments = checker.getTypeArguments(type as ts.TypeReference)
      const typeArgument = typeArguments[0]

      result = {
        kind: 'promise',
        typeName,
        type: typeArgument
          ? goingDeep(typeArgument, `${propertyName}-promise`, 'promise')
          : { kind: 'basic', typeName: 'void' },
      }
    } else if (apparentType.getCallSignatures().length > 0) {
      const callSignatures = apparentType.getCallSignatures()
      const signatures: TypeFunctionSignature[] = []

      for (let i = 0; i < callSignatures.length; i++) {
        const signature = callSignatures[i]
        if (!signature) {
          continue
        }

        const returnType = goingDeep(
          checker.getReturnTypeOfSignature(signature),
          'returnType',
          'function',
        )

        const parameters: { name: string; type: TypeTree }[] = []
        const params = signature.parameters || []

        for (let j = 0; j < params.length; j++) {
          const param = params[j]
          if (!param) {
            continue
          }

          const paramType = checker.getTypeOfSymbol(param)
          const paramName = param.getName()

          parameters.push({
            name: paramName,
            type: goingDeep(paramType, paramName, 'parameter'),
          })
        }

        signatures.push({ returnType, parameters })
      }

      result = {
        kind: 'function',
        typeName,
        signatures,
      }
    } else if (
      apparentType.isClassOrInterface() ||
      (apparentType.flags & ts.TypeFlags.Object) !== 0
    ) {
      if (context.propertiesCount >= options.maxProperties) {
        result = { kind: 'basic', typeName }
      }

      const remainingProperties =
        options.maxProperties - context.propertiesCount
      const depthMaxProps =
        depth >= 1 ? options.maxSubProperties : options.maxProperties
      const allowedPropertiesCount = Math.min(
        depthMaxProps,
        remainingProperties,
      )

      const typeProperties = apparentType.getProperties()
      const publicProperties = typeProperties.slice(0, allowedPropertiesCount)

      context.propertiesCount += publicProperties.length

      const properties: TypeProperty[] = []

      for (let i = 0; i < publicProperties.length; i++) {
        const symbol = publicProperties[i]!
        const propName = symbol.getName()

        if (excludedProps.has(propName)) {
          context.propertiesCount--
          continue
        }

        const symbolType = checker.getTypeOfSymbol(symbol)

        properties.push({
          name: propName,
          type: goingDeep(symbolType, propName, 'object'),
        })
      }

      const stringIndexType = type.getStringIndexType()
      if (stringIndexType) {
        properties.push({
          name: '[key: string]',
          type: goingDeep(
            stringIndexType,
            `${propertyName}-stringIndex`,
            'object',
          ),
        })

        context.propertiesCount++
      }

      const numberIndexType = type.getNumberIndexType()
      if (numberIndexType) {
        properties.push({
          name: '[key: number]',
          type: goingDeep(
            numberIndexType,
            `${propertyName}-numberIndex`,
            'object',
          ),
        })

        context.propertiesCount++
      }

      result = {
        kind: 'object',
        typeName,
        properties,
      }
    } else {
      result = { kind: 'basic', typeName }
    }

    visited.set(uniqueId, result)
    return result
  } catch {
    return { kind: 'basic', typeName: 'unknown' }
  }
}

function isPrimitiveType(type: ts.Type): boolean {
  const typeFlags = type.flags

  return (
    !(typeFlags & ts.TypeFlags.EnumLike) &&
    (typeFlags & PRIMITIVE_TYPE_FLAGS) !== 0
  )
}

function isIntrinsicType(type: ts.Type): type is ts.IntrinsicType {
  return (type.flags & ts.TypeFlags.Intrinsic) !== 0
}

function sortUnionTypes(a: ts.Type, b: ts.Type): number {
  const aIntrinsicName = isIntrinsicType(a) ? (a as any).intrinsicName : ''
  const bIntrinsicName = isIntrinsicType(b) ? (b as any).intrinsicName : ''

  const aPrimitiveIndex = primitiveTypeOrderMap.get(aIntrinsicName) ?? -1
  const bPrimitiveIndex = primitiveTypeOrderMap.get(bIntrinsicName) ?? -1
  const aFalsyIndex = falsyTypeOrderMap.get(aIntrinsicName) ?? -1
  const bFalsyIndex = falsyTypeOrderMap.get(bIntrinsicName) ?? -1

  if (aPrimitiveIndex !== -1 && bPrimitiveIndex !== -1) {
    return aPrimitiveIndex - bPrimitiveIndex
  }

  if (aPrimitiveIndex !== -1) {
    return -1
  }

  if (bPrimitiveIndex !== -1) {
    return 1
  }

  if (aFalsyIndex !== -1 && bFalsyIndex !== -1) {
    return aFalsyIndex - bFalsyIndex
  }

  if (aFalsyIndex !== -1) {
    return 1
  }
  if (bFalsyIndex !== -1) {
    return -1
  }

  return 0
}
