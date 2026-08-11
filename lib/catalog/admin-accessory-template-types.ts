import type { CatalogAccessoryContentSectionType } from '@/lib/catalog/types'

export const ACCESSORY_TEMPLATE_SCHEMA = 'accessory_template_v1' as const

export type AccessoryTemplateAttributeDefinition = {
  key: string
  label: string
  defaultValue?: string
}

export type AccessoryTemplateSectionDefinition = {
  key: string
  type: CatalogAccessoryContentSectionType
  title: string
  attributes?: AccessoryTemplateAttributeDefinition[]
  items?: string[]
  bodyPlaceholder?: string
}

export type AccessoryTemplateOptionValueDefinition = {
  code: string
  name: string
  colorHex?: string | null
}

export type AccessoryTemplateOptionGroupDefinition = {
  key: string
  code: string
  name: string
  displayType: 'BUTTON' | 'SWATCH' | 'SELECT'
  minimumSelections?: number
  maximumSelections?: number
  values?: AccessoryTemplateOptionValueDefinition[]
}

export type AccessoryTemplateDefinition = {
  schema: typeof ACCESSORY_TEMPLATE_SCHEMA
  suggestedCategorySlugs: string[]
  suggestedOptionCodes: string[]
  sections: AccessoryTemplateSectionDefinition[]
  optionGroups?: AccessoryTemplateOptionGroupDefinition[]
}

export type AdminAccessoryTemplateVersion = {
  id: string
  templateId: string
  version: number
  definition: AccessoryTemplateDefinition
  changeNote: string | null
  createdAt: string
}

export type AdminAccessoryTemplate = {
  id: string
  code: string
  name: string
  groupName: string | null
  description: string | null
  displayOrder: number
  isActive: boolean
  currentVersion: number
  usageCount: number
  currentVersionId: string | null
  definition: AccessoryTemplateDefinition | null
  createdAt: string
  updatedAt: string
}

export type AdminAccessoryTemplateCategoryLookup = {
  id: string
  slug: string
  name: string
  displayOrder: number
}

export type AdminAccessoryTemplateLookups = {
  groups: string[]
  categories: AdminAccessoryTemplateCategoryLookup[]
}

export type AdminAccessoryTemplateWriteInput = {
  code: string
  codeGenerated?: boolean
  name: string
  groupName?: string | null
  description?: string | null
  displayOrder?: number
  isActive?: boolean
  definition: AccessoryTemplateDefinition
  changeNote?: string | null
}

export type AdminAccessoryTemplateMetadataPatch = {
  code?: string
  name?: string
  groupName?: string | null
  description?: string | null
  displayOrder?: number
  isActive?: boolean
  expectedUpdatedAt?: string
}

export function emptyAccessoryTemplateDefinition(): AccessoryTemplateDefinition {
  return {
    schema: ACCESSORY_TEMPLATE_SCHEMA,
    suggestedCategorySlugs: [],
    suggestedOptionCodes: [],
    sections: [],
    optionGroups: [],
  }
}
