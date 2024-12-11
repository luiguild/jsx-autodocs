import { statSync } from 'node:fs'
import { normalize, resolve } from 'node:path'
import type { Plugin } from 'vite'
import { generateDocs } from './generate.js'
import type { JSXAutoDocsVite, JSXAutoDocsViteFileCache } from './types.js'

/**
 * Generates documentation for components in a Vite project.
 *
 * This function processes components based on the specified include and exclude
 * patterns, generating JSX documentation for each matching component. It allows
 * configuration of the package name for imports, the indentation level for
 * the generated documentation, the size of the cache to store processed files,
 * and the activation of debug logs.
 *
 * The generated JSX documentation is stored in a `Set` as a side effect,
 * accessible globally via `window.__jsxAutoDocs`.
 *
 * @param {JSXAutoDocsVite} options - Configuration options for generating the documentation.
 * @param {string} options.importPackageName - The name of the package used for imports in the documentation.
 * @param {number} [options.indentLevel=2] - The indentation level for the generated documentation. Default is 2.
 * @param {number} [options.cacheSize=1000] - The maximum size of the cache to store processed file information.
 * @param {boolean} [options.debug=false] - Enables debug logs if set to true.
 *
 * @returns {Plugin} A Vite plugin instance configured to generate JSX documentation.
 */
export function jsxAutoDocsVite({
  importPackageName,
  indentLevel = 2,
  cacheSize = 1000,
  debug = false,
}: JSXAutoDocsVite): Plugin {
  const cache: Map<string, JSXAutoDocsViteFileCache> = new Map()

  function setCache(path: string, cacheEntry: JSXAutoDocsViteFileCache) {
    if (cache.size >= cacheSize) {
      const firstKey = cache.keys().next().value as string

      cache.delete(firstKey)
    }
    cache.set(path, cacheEntry)
  }

  return {
    name: 'jsx-autodocs',
    async transform(source: string, id: string) {
      const cleanPath = id
        ?.split('?')?.[0]
        ?.split('#')?.[0]
        ?.replace(/\\/g, '/')
        .toLowerCase()

      if (cleanPath?.endsWith('.stories.tsx')) {
        return null
      }

      if (!cleanPath?.endsWith('.tsx')) {
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

      const cached = cache.get(absolutePath)

      if (cached && cached.mtimeMs === mtimeMs) {
        if (debug) {
          console.info(`[JSXAutoDocs] Cache hit for the file: ${absolutePath}`)
        }

        return null
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
