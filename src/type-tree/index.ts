import ts from 'typescript'
import { getDescendantAtRange } from './get-ast-node.js'
import type {
  JSXAutoDocsOptions,
  TypeFunctionSignature,
  TypeInfo,
  TypeProperty,
  TypeTree,
} from './types.js'

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

const typeNameCache = new WeakMap<ts.Type, string>()

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
      new Set<string>(),
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

function getTypeTree(
  type: ts.Type,
  depth: number,
  visited: Set<string>,
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
    const cacheKey = `${checker.typeToString(type)}:${propertyName || 'default'}:${contextKind || 'default'}`

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
    const cacheKey = `${checker.typeToString(type)}:${propertyName}:${contextKind}`

    if (visited.has(cacheKey)) {
      console.log(`Cache hit: ${cacheKey}`)
      return { kind: 'basic', typeName: checker.typeToString(type) }
    }

    visited.add(cacheKey)

    let typeName = typeNameCache.get(type)

    if (!typeName) {
      typeName = checker.typeToString(
        type,
        undefined,
        ts.TypeFormatFlags.NoTruncation,
      )
      typeNameCache.set(type, typeName)
    }

    const apparentType = checker.getApparentType(type)

    if (depth >= options.maxDepth || isPrimitiveType(type)) {
      return {
        kind: 'basic',
        typeName,
      }
    }

    if (type.isUnion()) {
      const sortedTypes = type.types
        .slice(0, options.maxUnionMembers)
        .sort(sortUnionTypes)
        .map((t) => goingDeep(t, propertyName, 'union'))

      return {
        kind: 'union',
        typeName,
        types: sortedTypes,
      }
    }

    if (type.isIntersection()) {
      const intersectionTypes = type.types.map((t) =>
        goingDeep(t, propertyName, 'intersection'),
      )

      return {
        kind: 'intersection',
        typeName,
        types: intersectionTypes,
      }
    }

    if (checker.isArrayType(type)) {
      const arrayType = checker.getTypeArguments(type as ts.TypeReference)[0]

      if (!arrayType) {
        return {
          kind: 'array',
          typeName,
          elementType: { kind: 'basic', typeName: 'any' },
        }
      }

      const expandedElementType = goingDeep(
        arrayType,
        `${propertyName}-element`,
        'array',
      )

      return {
        kind: 'array',
        typeName,
        elementType: expandedElementType,
      }
    }

    if (typeName.startsWith('Promise<')) {
      const typeArguments = checker.getTypeArguments(type as ts.TypeReference)
      const typeArgument = typeArguments[0]

      return {
        kind: 'promise',
        typeName,
        type: typeArgument
          ? goingDeep(typeArgument, `${propertyName}-promise`, 'promise')
          : { kind: 'basic', typeName: 'void' },
      }
    }

    const callSignatures = apparentType.getCallSignatures()

    if (callSignatures.length > 0) {
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

      return {
        kind: 'function',
        typeName,
        signatures,
      }
    }

    if (
      apparentType.isClassOrInterface() ||
      (apparentType.flags & ts.TypeFlags.Object) !== 0
    ) {
      if (context.propertiesCount >= options.maxProperties) {
        return { kind: 'basic', typeName }
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
        const symbolType = checker.getTypeOfSymbol(symbol)
        const propName = symbol.getName()

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

      return {
        kind: 'object',
        typeName,
        properties,
      }
    }

    return { kind: 'basic', typeName }
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
