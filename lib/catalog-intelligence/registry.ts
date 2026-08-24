import { normalizeProductSearchText } from '../catalog/search'
import type { CatalogProductType, SpecAlias, SpecAliasMatchKind, SpecDefinition } from './types'

type MatchResult =
  | { outcome: 'MATCH'; definition: SpecDefinition; alias: SpecAlias }
  | { outcome: 'AMBIGUOUS'; definitions: SpecDefinition[] }
  | { outcome: 'NO_MATCH' }

function normalizedPath(value: string) {
  return value
    .trim()
    .replace(/^specs\.[^.]+\.specs\./i, 'specs.*.specs.')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function aliasValue(alias: SpecAlias) {
  return alias.matchKind === 'PATH'
    ? normalizedPath(alias.alias)
    : normalizeProductSearchText(alias.alias)
}

function scopeKey(productType: CatalogProductType | '*', sourceSchema: string, matchKind: SpecAliasMatchKind, value: string) {
  return `${productType}\u001f${sourceSchema}\u001f${matchKind}\u001f${value}`
}

export class SpecRegistry {
  private readonly definitionsByKey = new Map<string, SpecDefinition>()
  private readonly aliasesByScope = new Map<string, Array<{ definition: SpecDefinition; alias: SpecAlias }>>()

  constructor(definitions: readonly SpecDefinition[], aliases: readonly SpecAlias[]) {
    for (const definition of definitions) {
      if (this.definitionsByKey.has(definition.canonicalKey)) {
        throw new Error(`Duplicate canonical specification key: ${definition.canonicalKey}`)
      }
      this.definitionsByKey.set(definition.canonicalKey, definition)
    }

    for (const alias of aliases) {
      const definition = this.definitionsByKey.get(alias.definitionKey)
      if (!definition) throw new Error(`Unknown specification definition for alias: ${alias.definitionKey}`)
      const key = scopeKey(alias.productType, alias.sourceSchema, alias.matchKind, aliasValue(alias))
      const existing = this.aliasesByScope.get(key) ?? []
      if (!existing.some((candidate) => candidate.definition.canonicalKey === definition.canonicalKey)) existing.push({ definition, alias })
      this.aliasesByScope.set(key, existing)
    }
  }

  definitions() {
    return [...this.definitionsByKey.values()].sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey))
  }

  definition(canonicalKey: string) {
    return this.definitionsByKey.get(canonicalKey) ?? null
  }

  match(input: {
    productType: CatalogProductType
    sourceSchema: string
    matchKind: SpecAliasMatchKind
    value: string
  }): MatchResult {
    const value = input.matchKind === 'PATH' ? normalizedPath(input.value) : normalizeProductSearchText(input.value)
    const scopes: Array<[CatalogProductType | '*', string]> = [
      [input.productType, input.sourceSchema],
      [input.productType, '*'],
      ['*', input.sourceSchema],
      ['*', '*'],
    ]

    for (const [productType, sourceSchema] of scopes) {
      const matches = this.aliasesByScope.get(scopeKey(productType, sourceSchema, input.matchKind, value)) ?? []
      if (matches.length === 1) return { outcome: 'MATCH', definition: matches[0].definition, alias: matches[0].alias }
      if (matches.length > 1) {
        return {
          outcome: 'AMBIGUOUS',
          definitions: matches.map((match) => match.definition).sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey)),
        }
      }
    }
    return { outcome: 'NO_MATCH' }
  }
}

export function normalizeSpecSourcePath(value: string) {
  return normalizedPath(value)
}
