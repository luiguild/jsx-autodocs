import { normalize, resolve } from 'node:path'
import { generateDocs } from './generate.js'
import type { JSXAutoDocsVite } from './types.js'

/**
 * Generates documentation for components in a Vite project.
 *
 * This function processes components based on the specified include and exclude
 * patterns, generating JSX documentation for each matching component. It allows
 * configuration of the package name for imports and the indentation level for
 * the generated documentation.
 *
 * The generated JSX documentation is stored in a `Set` as a side effect,
 * accessible globally via `window.__jsxAutoDocs`.
 *
 * @param {JSXAutoDocsVite} options - Configuration options for generating the documentation.
 * @param {string} options.importPackageName - The name of the package used for imports in the documentation.
 * @param {number} [options.indentLevel=2] - The indentation level for the generated documentation. Default is 2.
 *
 * @returns {void} This function does not return a value; it modifies the global `window.__jsxAutoDocs` Set as a side effect.
 */
export function jsxAutoDocsVite({
  importPackageName,
  indentLevel = 2,
  debug = false,
}: JSXAutoDocsVite) {
  return {
    name: 'jsx-autodocs',
    async transform(source: string, id: string) {
      if (debug) {
        console.info('[JSXAutoDocs] Starting to generate documentation.')
      }

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

        const injectedCode = `
if (typeof window !== 'undefined') {
  window.__jsxAutoDocs = window.__jsxAutoDocs || new Set();
  window.__jsxAutoDocs.add(${JSON.stringify(docs)});
}`

        if (debug) {
          console.info(
            '[JSXAutoDocs] Documentation generated and injected successfully.',
          )
        }

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
