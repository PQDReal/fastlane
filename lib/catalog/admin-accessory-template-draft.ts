import type { AdminAccessoryTemplate } from '@/lib/catalog/admin-accessory-template-types'
import {
  applyAccessoryCategoryDefaultsFromSlugs,
  buildVariantMatrix,
  type AdminAccessoryDraft,
  type DraftCollection,
  type DraftOptionGroup,
} from '@/lib/catalog/admin-accessory-draft'
import { isTemplateSectionKey } from '@/lib/catalog/admin-accessory-templates'

function safeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
}

function templateSectionId(template: AdminAccessoryTemplate, key: string) {
  return `tpl_${safeKey(template.code)}_${safeKey(key)}`
}

function templateGroupId(template: AdminAccessoryTemplate, key: string) {
  return `tplgrp_${safeKey(template.code)}_${safeKey(key)}`
}

function templateValueId(template: AdminAccessoryTemplate, groupKey: string, valueCode: string) {
  return `tplval_${safeKey(template.code)}_${safeKey(groupKey)}_${safeKey(valueCode)}`
}

export function applyDatabaseAccessoryTemplateToDraft(
  draft: AdminAccessoryDraft,
  template: AdminAccessoryTemplate,
  collections: DraftCollection[] = [],
): AdminAccessoryDraft {
  const definition = template.definition
  if (!definition || !template.currentVersionId) return draft
  const sections = definition.sections.map((section) => {
    const id = templateSectionId(template, section.key)
    return {
      id,
      type: section.type,
      title: section.title,
      body: '',
      itemsText: '',
      attributes: (section.attributes ?? []).map((attribute, index) => ({
        id: `${id}_attribute_${index + 1}`,
        label: attribute.label,
        value: attribute.defaultValue ?? '',
      })),
    }
  })
  const optionGroups: DraftOptionGroup[] = (definition.optionGroups ?? []).map((group) => ({
    id: templateGroupId(template, group.key),
    presetCode: '',
    code: group.code,
    name: group.name,
    displayType: group.displayType,
    minimumSelections: group.minimumSelections ?? 0,
    maximumSelections: group.maximumSelections ?? Math.max(1, group.values?.length ?? 1),
    values: (group.values ?? []).map((value) => ({
      id: templateValueId(template, group.key, value.code),
      code: value.code,
      name: value.name,
      colorHex: value.colorHex ?? '',
      swatchUrl: '',
      imageUrls: [''],
    })),
  }))
  return applyAccessoryCategoryDefaultsFromSlugs({
    ...draft,
    // The legacy aggregate writer still validates its compatibility code enum.
    // The real provenance is the DB revision FK below, so dynamic templates
    // deliberately use the legacy Custom marker during the rollout.
    templateCode: 'custom',
    templateVersion: template.currentVersion,
    templateVersionId: template.currentVersionId,
    sections: [
      ...sections,
      ...draft.sections.filter((section) => !isTemplateSectionKey(section.id)),
    ],
    optionGroups: [
      ...optionGroups,
      ...draft.optionGroups.filter((group) => !group.id.startsWith('tplgrp_')),
    ],
    variants: buildVariantMatrix([
      ...optionGroups,
      ...draft.optionGroups.filter((group) => !group.id.startsWith('tplgrp_')),
    ], draft.variants),
  }, collections, definition.suggestedCategorySlugs)
}

export function templateDisplayLabel(template: AdminAccessoryTemplate | null | undefined) {
  return template?.name ?? 'Tùy chỉnh'
}
