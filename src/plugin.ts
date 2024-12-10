import { normalize, resolve } from 'node:path'
import { generateDocs } from './generate.js'
import type { JSXAutoDocsVite } from './type-tree/types.js'

function filter(
  id: string,
  include: RegExp | string | undefined,
  exclude: RegExp | string | undefined,
): boolean {
  if (exclude && new RegExp(exclude).test(id)) {
    return false
  }

  if (include && new RegExp(include).test(id)) {
    return true
  }

  return true
}

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
 * @param {string} options.include - A glob pattern or string to include files for documentation generation.
 * @param {string} options.exclude - A glob pattern or string to exclude files from documentation generation.
 * @param {string} options.importPackageName - The name of the package used for imports in the documentation.
 * @param {number} [options.indentLevel=2] - The indentation level for the generated documentation. Default is 2.
 *
 * @returns {void} This function does not return a value; it modifies the global `window.__jsxAutoDocs` Set as a side effect.
 */
export function jsxAutoDocsVite({
  include,
  exclude,
  importPackageName,
  indentLevel = 2,
}: JSXAutoDocsVite) {
  return {
    name: 'jsx-autodocs',
    async transform(source: string, id: string) {
      if (!filter(id, include || '**/*.tsx', exclude || '**/*.stories.tsx')) {
        return null
      }

      const absolutePath = normalize(resolve(id))

      try {
        const docs = await generateDocs(
          absolutePath,
          importPackageName,
          indentLevel,
        )

        const injectedCode = `
if (typeof window !== 'undefined') {
    window.__jsxAutoDocs = window.__jsxAutoDocs || new Set();
    window.__jsxAutoDocs.add(${docs});
}`

        return {
          code: `${source}\n${injectedCode}`,
          map: null,
        }
      } catch (error) {
        console.warn(
          'Failed to inject documentation into window.__jsxAutoDocs:',
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
