import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const BOUNDARIES = ['lib/sales-agent', 'components/sales-agent', 'app/api/v1/sales-agent']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : []
  })
}

function forbiddenImports(source: string) {
  return [...source.matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1])
    .filter((specifier) => /(^|\/)assistant(\/|$)/.test(specifier) || specifier.includes('search-modal'))
}

describe('sales agent architecture boundary', () => {
  it('does not import the legacy assistant or search modal', () => {
    const violations = BOUNDARIES
      .flatMap((directory) => sourceFiles(join(ROOT, directory)))
      .flatMap((path) => forbiddenImports(readFileSync(path, 'utf8'))
        .map((specifier) => `${relative(ROOT, path).replaceAll('\\', '/')}: ${specifier}`))

    expect(violations).toEqual([])
  })
})
