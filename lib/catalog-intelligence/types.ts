export const CATALOG_EXTRACTOR_VERSION = 'catalog-extractor-v1'
export const CATALOG_SELECTION_POLICY_VERSION = 'catalog-selection-v1'
export const CORE_VEHICLE_SPEC_KEYS = [
  'top_speed_kmh',
  'range_km',
  'max_power_kw',
  'max_torque_nm',
  'battery_capacity_kwh',
  'charging_time',
  'dimensions_mm',
  'seats',
  'drive_type',
] as const

export type CatalogProductType = 'CAR' | 'MOTORBIKE' | 'ACCESSORY'
export type CoreVehicleSpecKey = typeof CORE_VEHICLE_SPEC_KEYS[number]
export type SpecValueType = 'NUMBER' | 'TEXT' | 'BOOLEAN' | 'DURATION'
export type UnitDimension = 'DISTANCE' | 'SPEED' | 'POWER' | 'ENERGY' | 'TORQUE' | 'TIME' | 'COUNT'
export type SpecAliasMatchKind = 'LABEL' | 'PATH'
export type SourceAuthority = 'AUTO_EXTRACTED' | 'OFFICIAL_SECONDARY' | 'OFFICIAL_PRIMARY' | 'MANUAL_VERIFIED'
export type SnapshotCompleteness = 'FULL' | 'PARTIAL'

export type SpecDefinition = {
  canonicalKey: string
  labelVi: string
  labelEn?: string
  valueType: SpecValueType
  unitDimension?: UnitDimension
  canonicalUnit?: string
  sortable: boolean
  searchable: boolean
  rankingAggregation?: 'MIN' | 'MAX'
  changeTolerance?: number
}

export type SpecAlias = {
  definitionKey: string
  alias: string
  productType: CatalogProductType | '*'
  sourceSchema: string | '*'
  matchKind: SpecAliasMatchKind
}

export type CatalogProductInput = {
  id: string
  name: string
  productType: CatalogProductType
  specifications: unknown
  updatedAt?: string | null
}

export type RawSpecObservation = {
  productId: string
  productName: string
  productVariantId: string | null
  sourceVariantKey: string | null
  productType: CatalogProductType
  sourceSchema: string
  sourcePath: string
  rawKey: string
  rawValue: unknown
  sourceUri: string | null
}

export type ExtractionWarning = {
  code: 'UNSUPPORTED_SPEC_SCHEMA' | 'UNSUPPORTED_PRODUCT_TYPE'
  productId: string
  message: string
}

export type ExtractionResult = {
  observations: RawSpecObservation[]
  warnings: ExtractionWarning[]
}

export type CanonicalValue = {
  valueType: SpecValueType
  displayValue: string
  numericValue: number | null
  textValue: string | null
  booleanValue: boolean | null
  durationSeconds: number | null
  canonicalUnit: string | null
}

export type SpecResolution =
  | {
      status: 'RESOLVED'
      definition: SpecDefinition
      value: CanonicalValue
      confidence: number
      method: SpecAliasMatchKind
    }
  | {
      status: 'UNKNOWN_SPEC'
    }
  | {
      status: 'AMBIGUOUS'
      candidateKeys: string[]
    }
  | {
      status: 'INVALID_VALUE'
      definition: SpecDefinition
      reason: string
      method: SpecAliasMatchKind
    }

export type ResolvedSpecObservation = RawSpecObservation & {
  observationId: string
  snapshotId: string
  snapshotCompleteness: SnapshotCompleteness
  observedAt: string
  sourceAuthority: SourceAuthority
  definition: SpecDefinition
  value: CanonicalValue
}

export type CurrentCanonicalFact = {
  observationId: string
  definitionKey: string
  value: CanonicalValue
  verificationStatus: 'AUTO' | 'VERIFIED'
  sourceAuthority: SourceAuthority
  selectedAt: string
}

export type CanonicalSelection = {
  action: 'CREATE' | 'UPDATE' | 'KEEP' | 'CONFLICT' | 'NO_CANDIDATE'
  selected: ResolvedSpecObservation | null
  reason: string
  conflictingObservationIds: string[]
  policyVersion: typeof CATALOG_SELECTION_POLICY_VERSION
}
