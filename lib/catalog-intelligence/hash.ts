import { createHash } from 'node:crypto'
import { CATALOG_EXTRACTOR_VERSION } from './types'

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

export function catalogInputHash(specifications: unknown, extractorVersion = CATALOG_EXTRACTOR_VERSION) {
  return createHash('sha256')
    .update(`${extractorVersion}\n${canonicalJson(specifications)}`)
    .digest('hex')
}

export function catalogSourceHash(specifications: unknown) {
  return createHash('sha256')
    .update(canonicalJson(specifications))
    .digest('hex')
}
