import { statSync } from 'node:fs'
import { normalize, resolve } from 'node:path'
import ts from 'typescript'
import type { Plugin } from 'vite'
import { generateDocs } from './generate.js'
import type { JSXAutoDocsVite, JSXAutoDocsViteFileCache } from './types.js'

/**
 * Generates documentation for components in a Vite project.
 *
 * This function processes TypeScript components based on the specified configuration options,
 * generating JSX documentation for each matching component. It integrates with the Vite build
 * process and ensures that it runs before other plugins by using the `enforce: 'pre'` option.
 * This allows it to analyze TypeScript source code directly, before it is transpiled or altered
 * by other plugins, ensuring accurate and complete documentation.
 *
 * It supports customization of the package name used for imports, the indentation level of the generated
 * documentation, cache management for processed files, and enables detailed debug logging if needed.
 * Additional options control the depth, scope, and granularity of the generated documentation.
 *
 * The resulting JSX documentation is stored in a global `Set` accessible via `window.__jsxAutoDocs`
 * for further use or inspection.
 *
 * @param {JSXAutoDocsVite} options - Configuration options for generating the documentation.
 * @param {string} options.packageName - The name of the package used for imports in the documentation.
 * @param {number} [options.indentLevel=2] - The indentation level for the generated documentation. Default is 2.
 * @param {number} [options.cacheSize=1000] - The maximum size of the cache for storing processed file information. Default is 1000.
 * @param {boolean} [options.debug=false] - Enables debug logs when set to true. Default is false.
 * @param {string} [options.tsconfigPath='./tsconfig.json'] - Path to the TypeScript configuration file. Default is './tsconfig.json'.
 * @param {number} [options.maxDepth=100] - The maximum depth for nested components or structures in the documentation. Default is 100.
 * @param {number} [options.maxProperties=100] - The maximum number of properties to include in the documentation. Default is 100.
 * @param {number} [options.maxSubProperties=100] - The maximum number of sub-properties to include for nested objects. Default is 100.
 * @param {number} [options.maxUnionMembers=100] - The maximum number of members to include for union types in the documentation. Default is 100.
 *
 * @returns {Plugin} A Vite plugin instance configured to analyze and generate JSX documentation,
 *                   ensuring it runs before other plugins using `enforce: 'pre'`.
 */
export function jsxAutoDocsVite({
  packageName,
  indentLevel = 2,
  cacheSize = 1000,
  debug = false,
  tsconfigPath = './tsconfig.json',
  maxDepth = 100,
  maxProperties = 100,
  maxSubProperties = 100,
  maxUnionMembers = 100,
}: JSXAutoDocsVite): Plugin {
  const cache: Map<string, JSXAutoDocsViteFileCache> = new Map()
  const fileContents = new Map<string, string>()
  const fileVersions = new Map<string, number>()

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

  const host = ts.createIncrementalCompilerHost(compilerOptions, ts.sys)

  host.readFile = (fileName) =>
    fileContents.get(fileName) || ts.sys.readFile(fileName)
  host.fileExists = (fileName) =>
    fileContents.has(fileName) || ts.sys.fileExists(fileName)

  let program = ts.createIncrementalProgram({
    rootNames: [],
    options: compilerOptions,
    host,
  })

  function setCache(path: string, cacheEntry: JSXAutoDocsViteFileCache) {
    if (cache.size >= cacheSize) {
      const firstKey = cache.keys().next().value as string
      cache.delete(firstKey)
    }
    cache.set(path, cacheEntry)
  }

  function isCached(path: string, mtimeMs: number): boolean {
    const cached = cache.get(path)
    if (!cached) {
      return false
    }

    if (cached.mtimeMs === mtimeMs) {
      if (debug) {
        console.info(`[JSXAutoDocs] Cache hit for file: ${path}`)
      }
      return true
    }

    if (debug) {
      console.info(
        `[JSXAutoDocs] Cache stale for file: ${path}. Updating cache.`,
      )
    }

    return false
  }

  return {
    name: 'jsx-autodocs',
    enforce: 'pre',
    async transform(source: string, id: string) {
      const cleanPath = id
        ?.split('?')?.[0]
        ?.split('#')?.[0]
        ?.replace(/\\/g, '/')
        .toLowerCase()

      if (cleanPath?.endsWith('.stories.tsx') || !cleanPath?.endsWith('.tsx')) {
        return null
      }

      const absolutePath = normalize(resolve(cleanPath))

      let mtimeMs: number
      try {
        const stats = statSync(absolutePath)
        mtimeMs = stats.mtimeMs
      } catch {
        return null
      }

      if (isCached(absolutePath, mtimeMs)) {
        return {
          code: source,
          map: null,
        }
      }

      try {
        if (debug) {
          console.info(
            `[JSXAutoDocs] Generating documentation for the file: ${absolutePath}`,
          )
        }

        const previousVersion = fileVersions.get(absolutePath) || 0

        fileContents.set(absolutePath, source)
        fileVersions.set(absolutePath, previousVersion + 1)

        program = ts.createIncrementalProgram({
          rootNames: Array.from(fileContents.keys()),
          options: program.getCompilerOptions(),
          host,
        })

        const docs = await generateDocs({
          source,
          program: program.getProgram(),
          packageName,
          indentLevel,
          maxDepth,
          maxProperties,
          maxSubProperties,
          maxUnionMembers,
        })

        setCache(absolutePath, { mtimeMs, docs })

        const injectedCode = `
if (typeof window !== 'undefined') {
  window.__jsxAutoDocs = window.__jsxAutoDocs || new Set();
  window.__jsxAutoDocs.add(${JSON.stringify(docs)});
}`

        return {
          code: `${source}\n${injectedCode}`,
          map: null,
        }
      } catch (error) {
        console.warn(
          '[JSXAutoDocs] Failed injecting docs in window.__jsxAutoDocs:',
          error,
        )

        return {
          code: source,
          map: null,
        }
      }
    },
  }
}
