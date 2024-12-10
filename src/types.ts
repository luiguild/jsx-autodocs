export type JSXAutoDocsOptions = {
  maxDepth: number
  maxProperties: number
  maxSubProperties: number
  maxUnionMembers: number
}

export type TypeProperty = { name: string; type: TypeTree }
export type TypeFunctionParameter = {
  name: string
  type: TypeTree
}
export type TypeFunctionSignature = {
  returnType: TypeTree
  parameters: TypeFunctionParameter[]
}

export type ComponentDescriptor = {
  name: string
  exportType?: 'default' | 'named'
  props: Record<string, unknown>
  required: Record<string, unknown>
}

export type JSXAutoDocsResult = {
  import: string
  component: string
  minimal: string
  complete: string
}

export type JSXAutoDocsVite = {
  importPackageName: string
  indentLevel?: number
}

export type TypeTree = { typeName: string } & (
  | { kind: 'union'; types: TypeTree[] }
  | { kind: 'intersection'; types: TypeTree[] }
  | { kind: 'object'; properties: TypeProperty[] }
  | { kind: 'array'; elementType: TypeTree }
  | { kind: 'function'; signatures: TypeFunctionSignature[] }
  | { kind: 'promise'; type: TypeTree }
  | { kind: 'enum'; member: string }
  | { kind: 'basic' } // Basic types
)

export type TypeInfo = {
  typeTree: TypeTree
  name: string
}
