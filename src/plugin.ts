import { statSync } from 'node:fs'
import { normalize, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { generateDocs } from './generate.js'
import type { JSXAutoDocsVite, JSXAutoDocsViteFileCache } from './types.js'

/**
 * Generates documentation for components in a Vite project.
 *
 * This function processes components based on the specified configuration options,
 * generating JSX documentation for each matching component. It allows customization
 * of the package name used for imports, the indentation level of the generated
 * documentation, the cache size for storing processed file information, and debug logs.
 * Additional options can be specified to control the depth and scope of the documentation.
 *
 * The generated JSX documentation is stored in a `Set` as a side effect,
 * accessible globally via `window.__jsxAutoDocs`.
 *
 * @param {JSXAutoDocsVite} options - Configuration options for generating the documentation.
 * @param {string} options.importPackageName - The name of the package used for imports in the documentation.
 * @param {number} [options.indentLevel=2] - The indentation level for the generated documentation. Default is 2.
 * @param {number} [options.cacheSize=1000] - The maximum size of the cache to store processed file information. Default is 1000.
 * @param {boolean} [options.debug=false] - Enables debug logs if set to true. Default is false.
 * @param {number} [options.maxDepth=100] - The maximum depth for nested components or structures in the documentation. Default is 100.
 * @param {number} [options.maxProperties=100] - The maximum number of properties to include in the generated documentation. Default is 100.
 * @param {number} [options.maxSubProperties=100] - The maximum number of sub-properties to include for nested objects. Default is 100.
 * @param {number} [options.maxUnionMembers=100] - The maximum number of members to include for union types in the documentation. Default is 100.
 *
 * @returns {Plugin} A Vite plugin instance configured to generate JSX documentation.
 */
export function jsxAutoDocsVite({
  importPackageName,
  indentLevel = 2,
  cacheSize = 1000,
  debug = false,
  maxDepth = 100,
  maxProperties = 100,
  maxSubProperties = 100,
  maxUnionMembers = 100,
}: JSXAutoDocsVite): Plugin {
  const cache: Map<string, JSXAutoDocsViteFileCache> = new Map()

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

        const docs = await generateDocs(
          absolutePath,
          importPackageName,
          indentLevel,
          {
            maxDepth,
            maxProperties,
            maxSubProperties,
            maxUnionMembers,
          },
        )

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
