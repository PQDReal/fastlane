'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  Copy,
  Eye,
  ImageIcon,
  Layers3,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'

import { AccessoryProductPreview } from '@/components/admin/accessory-product-preview'
import { ProductReviewDecisionDialog, type ProductReviewBlocker } from '@/components/admin/product-create/product-review-decision-dialog'
import { Button } from '@/components/ui/button'
import type { ToastKind } from '@/components/ui/toast'
import {
  ACCESSORY_OPTION_PRESETS,
  ACCESSORY_SECTION_TYPES,
  accessoryCategoryCollections,
  accessoryAdminSlug,
  accessoryModelCollectionsForCategory,
  buildVariantMatrix,
  createDraftOptionValue,
  createAdminAccessoryDraft,
  draftOptionGroupIsRequired,
  draftOptionGroupSupportsMedia,
  generateVariantSku,
  isSectionComplete,
  nonEmptyUrls,
  projectedVariantCount,
  resolvedDraftMediaOptionGroupId,
  type AdminAccessoryDraft,
  type DraftContentSection,
  type DraftCollection,
  type DraftOptionGroup,
  type DraftVariant,
  variantGroups,
  variantIsComplete,
  variantSignature,
} from '@/lib/catalog/admin-accessory-draft'
import {
  ADMIN_ACCESSORY_SESSION_KEY,
  restoreAdminAccessoryDraft,
  serializeAdminAccessoryDraft,
} from '@/lib/catalog/admin-accessory-session'
import { validateAdminAccessoryDraft } from '@/lib/catalog/admin-accessory-validation'
import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'

const inputClass = 'mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'
const textareaClass = 'mt-1.5 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
const labelClass = 'block text-sm font-semibold text-slate-700'
const VARIANT_BULK_EDITING_ENABLED = true

function draftId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function isDraftCollection(value: unknown): value is DraftCollection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const collection = value as Record<string, unknown>
  return (
    typeof collection.id === 'string'
    && (collection.parentId === null || typeof collection.parentId === 'string')
    && (collection.kind === 'CATEGORY' || collection.kind === 'MODEL' || collection.kind === 'CAMPAIGN')
    && typeof collection.slug === 'string'
    && typeof collection.name === 'string'
    && typeof collection.displayOrder === 'number'
  )
}

function SectionHeading({ title }: { title: string }) {
  return <h3 className="text-lg font-bold text-slate-950">{title}</h3>
}

function BulkControlTooltip({ id, text, align = 'center' }: { id: string; text: string; align?: 'center' | 'right' }) {
  return (
    <span
      id={id}
      role="tooltip"
      className={`pointer-events-none invisible absolute top-full z-20 mt-1.5 w-max max-w-64 rounded-md bg-slate-950 px-2.5 py-1.5 text-left text-[11px] font-medium normal-case leading-4 tracking-normal text-white opacity-0 shadow-lg transition group-hover/bulk:visible group-hover/bulk:opacity-100 group-focus-within/bulk:visible group-focus-within/bulk:opacity-100 ${align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}
    >
      {text}
    </span>
  )
}

function ClassificationStep({
  draft,
  collections,
  taxonomyLoading,
  taxonomyError,
  onRetryTaxonomy,
  onChange,
}: {
  draft: AdminAccessoryDraft
  collections: DraftCollection[]
  taxonomyLoading: boolean
  taxonomyError: string | null
  onRetryTaxonomy: () => void
  onChange: (next: AdminAccessoryDraft) => void
}) {
  const categories = useMemo(() => accessoryCategoryCollections(collections), [collections])
  const modelCollections = useMemo(
    () => accessoryModelCollectionsForCategory(collections, draft.primaryCollectionSlug),
    [collections, draft.primaryCollectionSlug],
  )

  function selectCategory(categorySlug: string) {
    const allowedModelSlugs = new Set(
      accessoryModelCollectionsForCategory(collections, categorySlug).map((collection) => collection.slug),
    )
    onChange({
      ...draft,
      primaryCollectionSlug: categorySlug,
      modelCollectionSlugs: draft.modelCollectionSlugs.filter((slug) => allowedModelSlugs.has(slug)),
    })
  }

  return (
    <div className="space-y-6">
      <SectionHeading title="Phân loại phụ kiện" />
      {taxonomyLoading && collections.length === 0 ? (
        <div className="flex min-h-28 items-center justify-center gap-2 border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500" role="status">
          <Loader2 className="animate-spin" size={17} /> Đang tải taxonomy…
        </div>
      ) : taxonomyError ? (
        <div className="flex flex-col items-start gap-3 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
          <div><p className="font-bold">Không tải được taxonomy</p><p className="mt-1">{taxonomyError}</p></div>
          <Button type="button" variant="outline" onClick={onRetryTaxonomy}>Thử lại</Button>
        </div>
      ) : (
      <div className="grid gap-6 xl:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Danh mục phụ kiện chính <span className="text-red-500">*</span></legend>
          <div className="mt-2 grid gap-2">
            {categories.map((collection) => {
              const selected = draft.primaryCollectionSlug === collection.slug
              return <button key={collection.id} type="button" aria-pressed={selected} onClick={() => selectCategory(collection.slug)} className={`flex min-h-11 items-center justify-between rounded-md border px-4 text-left text-sm font-semibold transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-100' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}><span>{collection.name}</span>{selected && <Check size={16} />}</button>
            })}
            {categories.length === 0 && <p className="border border-dashed border-slate-200 p-4 text-sm text-slate-500">Chưa có danh mục taxonomy hoạt động.</p>}
          </div>
        </fieldset>

        {modelCollections.length > 0 && <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Dòng xe liên quan <span className="font-normal text-slate-400">(không bắt buộc)</span></legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {modelCollections.map((collection) => {
              const selected = draft.modelCollectionSlugs.includes(collection.slug)
              return <button key={collection.id} type="button" aria-pressed={selected} onClick={() => onChange({ ...draft, modelCollectionSlugs: selected ? draft.modelCollectionSlugs.filter((slug) => slug !== collection.slug) : [...draft.modelCollectionSlugs, collection.slug] })} className={`min-h-10 rounded-md border px-3 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>{collection.name}</button>
            })}
          </div>
        </fieldset>}
      </div>
      )}
    </div>
  )
}

function GeneralStep({
  draft,
  serviceLabels,
  slugEdited,
  onSlugEdited,
  onChange,
}: {
  draft: AdminAccessoryDraft
  serviceLabels: CatalogServiceLabel[]
  slugEdited: boolean
  onSlugEdited: () => void
  onChange: (next: AdminAccessoryDraft) => void
}) {
  return (
    <div className="space-y-6">
      <SectionHeading title="Thông tin chung" />
      <div className="grid gap-5 lg:grid-cols-2">
        <label className={labelClass}>Tên phụ kiện <span className="text-red-500">*</span>
          <input value={draft.name} maxLength={200} onChange={(event) => onChange({ ...draft, name: event.target.value, slug: slugEdited ? draft.slug : accessoryAdminSlug(event.target.value) })} placeholder="Ví dụ: Áo mưa cánh dơi hai mũ" className={inputClass} />
        </label>
        <label className={labelClass}>Đường dẫn <span className="text-red-500">*</span>
          <input value={draft.slug} maxLength={220} onChange={(event) => { onSlugEdited(); onChange({ ...draft, slug: accessoryAdminSlug(event.target.value) }) }} placeholder="ao-mua-canh-doi-hai-mu" className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>Mô tả sản phẩm <span className="text-red-500">*</span>
        <textarea value={draft.description} maxLength={10000} rows={5} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="Mô tả ngắn gọn về sản phẩm và công dụng chính." className={textareaClass} />
      </label>
      <div>
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Nhãn dịch vụ</legend>
          <div className="mt-2 space-y-2 rounded-lg border border-slate-200 p-3">
            {serviceLabels.filter((label) => label.isActive).map((label) => {
              const selected = draft.serviceLabelIds.includes(label.id)
              return <label key={label.id} className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition hover:bg-slate-50 active:scale-[0.99]"><input type="checkbox" checked={selected} onChange={() => onChange({ ...draft, serviceLabelIds: selected ? draft.serviceLabelIds.filter((id) => id !== label.id) : [...draft.serviceLabelIds, label.id] })} className="mt-0.5 h-4 w-4 accent-slate-900" /><span><span className="block text-sm font-semibold text-slate-800">{label.name}</span>{label.description && <span className="mt-0.5 block text-xs leading-5 text-slate-500">{label.description}</span>}</span></label>
            })}
            {serviceLabels.filter((label) => label.isActive).length === 0 && <p className="p-3 text-center text-sm text-slate-400">Chưa có nhãn dịch vụ hoạt động.</p>}
          </div>
        </fieldset>
      </div>
    </div>
  )
}

type ContentEditorMode = 'body' | 'items' | 'attributes'

function defaultContentEditorMode(type: DraftContentSection['type']): ContentEditorMode {
  if (type === 'TECHNICAL_SPECS') return 'attributes'
  if (type === 'FEATURES' || type === 'PACKAGE_CONTENTS') return 'items'
  return 'body'
}

function initialContentEditorMode(section: DraftContentSection): ContentEditorMode {
  if (section.attributes.length > 0) return 'attributes'
  if (section.itemsText.trim()) return 'items'
  if (section.body.trim()) return 'body'
  return defaultContentEditorMode(section.type)
}

function ContentStep({ draft, onChange }: { draft: AdminAccessoryDraft; onChange: (next: AdminAccessoryDraft) => void }) {
  const [editorModeBySection, setEditorModeBySection] = useState<Record<string, ContentEditorMode>>({})

  function addSection() {
    const definition = ACCESSORY_SECTION_TYPES[0]
    const sectionId = draftId('section')
    onChange({
      ...draft,
      sections: [...draft.sections, {
        id: sectionId,
        type: definition.value,
        title: definition.defaultTitle,
        body: '',
        itemsText: '',
        attributes: [{ id: draftId('attribute'), label: '', value: '' }],
      }],
    })
    setEditorModeBySection((current) => ({ ...current, [sectionId]: 'attributes' }))
  }

  function updateSection(id: string, patch: Partial<DraftContentSection>) {
    onChange({ ...draft, sections: draft.sections.map((section) => section.id === id ? { ...section, ...patch } : section) })
  }

  function moveSection(index: number, direction: -1 | 1) {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= draft.sections.length) return
    const sections = [...draft.sections]
    ;[sections[index], sections[nextIndex]] = [sections[nextIndex], sections[index]]
    onChange({ ...draft, sections })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><SectionHeading title="Nội dung chi tiết" /><Button type="button" onClick={addSection} size="sm" className="shrink-0"><Plus size={15} className="mr-2" />Thêm nội dung</Button></div>
      {draft.sections.length === 0 && <button type="button" onClick={addSection} className="flex min-h-48 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"><Layers3 className="h-9 w-9" /><span className="mt-3 text-sm font-bold">Thêm section nội dung đầu tiên</span></button>}
      <div className="space-y-4">
        {draft.sections.map((section, index) => {
          const editorMode = editorModeBySection[section.id] ?? initialContentEditorMode(section)
          const itemCount = section.itemsText.split('\n').filter((item) => item.trim()).length
          const attributeCount = section.attributes.filter((attribute) => attribute.label.trim() || attribute.value.trim()).length

          return (
            <article key={section.id} className={`rounded-md border bg-white ${isSectionComplete(section) ? 'border-slate-200' : 'border-amber-300'}`}>
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm font-bold text-slate-700">Mục {index + 1}</span>
                <button type="button" aria-label="Di chuyển lên" disabled={index === 0} onClick={() => moveSection(index, -1)} className="rounded p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={15} /></button>
                <button type="button" aria-label="Di chuyển xuống" disabled={index === draft.sections.length - 1} onClick={() => moveSection(index, 1)} className="rounded p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={15} /></button>
                <button type="button" aria-label="Xóa nội dung" onClick={() => onChange({ ...draft, sections: draft.sections.filter((item) => item.id !== section.id) })} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <div className="min-w-0"><span className={labelClass}>Mục hiển thị</span>
                    {section.type === 'OTHER' ? (
                      <div className="mt-1.5 flex h-10 overflow-hidden rounded-md border border-slate-200 bg-white transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
                        <input
                          autoFocus
                          aria-label="Tên mục hiển thị"
                          value={section.title}
                          onChange={(event) => updateSection(section.id, { title: event.target.value })}
                          placeholder="Nhập tên mục"
                          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none"
                        />
                        <button
                          type="button"
                          aria-label="Quay lại danh sách mục có sẵn"
                          title="Quay lại danh sách mục có sẵn"
                          onClick={() => {
                            const fallback = ACCESSORY_SECTION_TYPES[0]
                            updateSection(section.id, {
                              type: fallback.value,
                              title: fallback.defaultTitle,
                              attributes: section.attributes.length > 0 ? section.attributes : [{ id: draftId('attribute'), label: '', value: '' }],
                            })
                            setEditorModeBySection((current) => ({ ...current, [section.id]: defaultContentEditorMode(fallback.value) }))
                          }}
                          className="grid w-10 shrink-0 place-items-center border-l border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                        >
                          <ChevronLeft size={15} />
                        </button>
                      </div>
                    ) : (
                      <select
                        value={section.type}
                        onChange={(event) => {
                          const nextType = event.target.value as DraftContentSection['type']
                          const nextDefinition = ACCESSORY_SECTION_TYPES.find((item) => item.value === nextType)
                          const hasContent = Boolean(section.body.trim() || section.itemsText.trim() || section.attributes.some((attribute) => attribute.label.trim() || attribute.value.trim()))
                          const attributes = nextType === 'TECHNICAL_SPECS' && section.attributes.length === 0
                            ? [{ id: draftId('attribute'), label: '', value: '' }]
                            : section.attributes
                          updateSection(section.id, {
                            type: nextType,
                            attributes,
                            title: nextType === 'OTHER' ? '' : nextDefinition?.defaultTitle || section.title,
                          })
                          if (!hasContent) {
                            setEditorModeBySection((current) => ({ ...current, [section.id]: defaultContentEditorMode(nextType) }))
                          }
                        }}
                        className={inputClass}
                      >
                        {ACCESSORY_SECTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.value === 'OTHER' ? 'Khác…' : type.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <div role="tablist" aria-label={`Kiểu nội dung mục ${index + 1}`} className="flex border-b border-slate-200">
                    {([
                      { id: 'body' as const, label: 'Đoạn văn', count: section.body.trim() ? 1 : 0 },
                      { id: 'items' as const, label: 'Danh sách', count: itemCount },
                      { id: 'attributes' as const, label: 'Thuộc tính', count: attributeCount },
                    ]).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={editorMode === tab.id}
                        onClick={() => setEditorModeBySection((current) => ({ ...current, [section.id]: tab.id }))}
                        className={`min-h-10 border-b-2 px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${editorMode === tab.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                      >
                        {tab.label}{tab.count > 0 && <span className="ml-1.5 text-xs text-slate-400">{tab.count}</span>}
                      </button>
                    ))}
                  </div>

                  <div className="pt-3">
                    {editorMode === 'body' && (
                      <textarea aria-label="Nội dung đoạn văn" value={section.body} rows={5} onChange={(event) => updateSection(section.id, { body: event.target.value })} placeholder="Nhập nội dung đoạn văn" className={textareaClass} />
                    )}
                    {editorMode === 'items' && (
                      <textarea aria-label="Danh sách nội dung" value={section.itemsText} rows={6} onChange={(event) => updateSection(section.id, { itemsText: event.target.value })} placeholder={'Nhập mỗi ý trên một dòng'} className={textareaClass} />
                    )}
                    {editorMode === 'attributes' && (
                      <div>
                        <div className="flex justify-end"><button type="button" onClick={() => updateSection(section.id, { attributes: [...section.attributes, { id: draftId('attribute'), label: '', value: '' }] })} className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-brand-700"><Plus size={13} />Thêm thuộc tính</button></div>
                        <div className="mt-2 space-y-2">
                          {section.attributes.map((attribute) => <div key={attribute.id} className="grid grid-cols-[0.8fr_1fr_auto] gap-2"><input aria-label="Tên thuộc tính" value={attribute.label} onChange={(event) => updateSection(section.id, { attributes: section.attributes.map((item) => item.id === attribute.id ? { ...item, label: event.target.value } : item) })} placeholder="Tên thuộc tính" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500" /><input aria-label="Giá trị thuộc tính" value={attribute.value} onChange={(event) => updateSection(section.id, { attributes: section.attributes.map((item) => item.id === attribute.id ? { ...item, value: event.target.value } : item) })} placeholder="Giá trị" className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500" /><button type="button" aria-label="Xóa thuộc tính" onClick={() => updateSection(section.id, { attributes: section.attributes.filter((item) => item.id !== attribute.id) })} className="rounded px-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={15} /></button></div>)}
                          {section.attributes.length === 0 && <button type="button" onClick={() => updateSection(section.id, { attributes: [{ id: draftId('attribute'), label: '', value: '' }] })} className="min-h-16 w-full border border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-brand-300 hover:text-brand-700">Thêm thuộc tính đầu tiên</button>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function OptionsAndVariantsStep({
  draft,
  view,
  onChange,
  onConfirmDestructive,
}: {
  draft: AdminAccessoryDraft
  view: 'options' | 'variants'
  onChange: (next: AdminAccessoryDraft) => void
  onConfirmDestructive: (title: string, message: string, onConfirm: () => void) => void
}) {
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([])
  const [bulkSkuPrefix, setBulkSkuPrefix] = useState('')
  const [bulkOriginalPrice, setBulkOriginalPrice] = useState('')
  const [bulkSalePrice, setBulkSalePrice] = useState('')
  const [bulkEditingOpen, setBulkEditingOpen] = useState(false)

  function addGroup() {
    const groupId = draftId('group')
    const valueId = draftId('value')
    const group: DraftOptionGroup = {
      id: groupId,
      presetCode: '',
      code: '',
      name: '',
      displayType: 'BUTTON',
      minimumSelections: 1,
      maximumSelections: 1,
      values: [createDraftOptionValue(valueId)],
    }
    onChange({ ...draft, optionGroups: [...draft.optionGroups, group] })
  }

  function updateGroup(id: string, patch: Partial<DraftOptionGroup>) {
    onChange({ ...draft, optionGroups: draft.optionGroups.map((group) => group.id === id ? { ...group, ...patch } : group) })
  }

  function setGroupMediaEnabled(id: string, mediaEnabled: boolean) {
    onChange({
      ...draft,
      mediaOptionGroupId: !mediaEnabled && draft.mediaOptionGroupId === id
        ? undefined
        : draft.mediaOptionGroupId,
      optionGroups: draft.optionGroups.map((group) => group.id === id
        ? { ...group, mediaEnabled }
        : group),
    })
  }

  function removeGroup(id: string) {
    onConfirmDestructive('Xóa nhóm tùy chọn?', 'Nhóm, giá trị và liên kết trong ma trận sẽ bị xóa khỏi bản mẫu.', () => {
      onChange({ ...draft, mediaOptionGroupId: draft.mediaOptionGroupId === id ? undefined : draft.mediaOptionGroupId, optionGroups: draft.optionGroups.filter((group) => group.id !== id), variants: draft.variants.map((variant) => { const selections = { ...variant.selections }; delete selections[id]; return { ...variant, selections } }) })
    })
  }

  function addValue(group: DraftOptionGroup) {
    updateGroup(group.id, { values: [...group.values, createDraftOptionValue(draftId('value'))] })
  }

  function applyPreset(group: DraftOptionGroup, presetCode: string) {
    const preset = ACCESSORY_OPTION_PRESETS.find((item) => item.code === presetCode)
    if (!preset) {
      updateGroup(group.id, { presetCode: '', code: '', name: '', displayType: 'BUTTON', mediaEnabled: undefined })
      return
    }
    updateGroup(group.id, {
      presetCode: preset.code,
      code: preset.code,
      name: preset.name,
      displayType: preset.displayType,
      mediaEnabled: undefined,
    })
  }

  function addSuggestedValue(group: DraftOptionGroup, name: string) {
    const code = accessoryAdminSlug(name)
    if (group.values.some((value) => value.code === code)) return
    const blankValue = group.values.find((value) => !value.name.trim() && !value.code.trim())
    const values = blankValue
      ? group.values.map((value) => value.id === blankValue.id ? { ...value, name, code } : value)
      : [...group.values, { ...createDraftOptionValue(draftId('value')), code, name }]
    updateGroup(group.id, { values })
  }

  function removeValue(group: DraftOptionGroup, valueId: string) {
    const values = group.values.filter((value) => value.id !== valueId)
    onConfirmDestructive('Xóa giá trị tùy chọn?', 'Các tổ hợp SKU đang dùng giá trị này sẽ được cập nhật.', () => {
      onChange({ ...draft, optionGroups: draft.optionGroups.map((item) => item.id === group.id ? { ...item, values } : item), variants: draft.variants.map((variant) => ({ ...variant, selections: variant.selections[group.id] === valueId ? { ...variant.selections, [group.id]: null } : variant.selections })) })
    })
  }

  function updateVariant(id: string, patch: Partial<DraftVariant>) {
    onChange({ ...draft, variants: draft.variants.map((variant) => variant.id === id ? { ...variant, ...patch } : variant) })
  }

  function targetVariantIds() {
    return new Set(selectedVariantIds)
  }

  function applyBulkValues() {
    const targets = targetVariantIds()
    onChange({
      ...draft,
      variants: draft.variants.map((variant, index) => targets.has(variant.id)
        ? {
            ...variant,
            sku: bulkSkuPrefix.trim()
              ? generateVariantSku(bulkSkuPrefix, variant, draft.optionGroups, index)
              : variant.sku,
            originalPrice: bulkOriginalPrice.trim() || variant.originalPrice,
            salePrice: bulkSalePrice.trim() || variant.salePrice,
          }
        : variant),
    })
  }

  function setBulkActive(isActive: boolean) {
    const targets = targetVariantIds()
    onChange({ ...draft, variants: draft.variants.map((variant) => targets.has(variant.id) ? { ...variant, isActive } : variant) })
  }

  function setBulkIncluded(isIncluded: boolean) {
    const targets = targetVariantIds()
    onChange({ ...draft, variants: draft.variants.map((variant) => targets.has(variant.id) ? { ...variant, isIncluded } : variant) })
  }

  function toggleVariantSelection(id: string) {
    setSelectedVariantIds((current) => current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id])
  }

  const matrixSize = projectedVariantCount(draft.optionGroups)
  const stepIssues = validateAdminAccessoryDraft(draft).filter((issue) => (
    view === 'options'
      ? issue.section === 'options'
      : issue.section === 'variants'
  ))

  function focusIssue(path: string) {
    const [collection, indexText] = path.split('.')
    const index = Number(indexText)
    const targetId = collection === 'optionGroups'
      ? draft.optionGroups[index] && `accessory-option-group-${draft.optionGroups[index].id}`
      : collection === 'variants'
        ? draft.variants[index] && `accessory-variant-${draft.variants[index].id}`
        : null
    const target = targetId ? document.getElementById(targetId) : null
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => target?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)')?.focus(), 280)
  }

  const includedVariants = draft.variants.filter((variant) => variant.isIncluded !== false)
  const duplicateSkus = new Set(includedVariants.filter((variant, index) => includedVariants.some((other, otherIndex) => otherIndex !== index && other.sku.trim() && other.sku.trim().toUpperCase() === variant.sku.trim().toUpperCase())).map((variant) => variant.id))
  const duplicateSignatures = new Set(variantGroups(draft.optionGroups).length === 0 ? [] : includedVariants.filter((variant, index) => includedVariants.some((other, otherIndex) => otherIndex !== index && variantSignature(other, draft.optionGroups) === variantSignature(variant, draft.optionGroups))).map((variant) => variant.id))

  return (
    <div className="space-y-8">
      {stepIssues.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label={`Kiểm tra ${view === 'options' ? 'tùy chọn' : 'biến thể'}`}>
          <p className="text-xs font-bold text-slate-800">{stepIssues.filter((issue) => issue.severity === 'error').length} lỗi · {stepIssues.filter((issue) => issue.severity === 'warning').length} cảnh báo</p>
          <div className="mt-2 flex flex-wrap gap-2">{stepIssues.slice(0, 6).map((issue, index) => <button key={`${issue.path}-${issue.code}-${index}`} type="button" onClick={() => focusIssue(issue.path)} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-xs font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${issue.severity === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}><AlertCircle size={13} />{issue.message} <span className="font-mono text-[10px] opacity-60">{issue.path}</span></button>)}</div>
        </div>
      )}
      {view === 'options' ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><SectionHeading title="Tùy chọn tạo biến thể" /><p className="mt-1 text-sm text-slate-500">Mỗi tổ hợp tùy chọn tạo một SKU; giá hoàn chỉnh được nhập trực tiếp trên từng SKU.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={addGroup} size="sm" variant="outline"><Plus size={15} className="mr-2" />Thêm nhóm thuộc tính</Button>
            </div>
          </div>

          <section className="space-y-4">
        {draft.optionGroups.map((group) => {
          const preset = ACCESSORY_OPTION_PRESETS.find((item) => item.code === group.presetCode)
          const addedCodes = new Set(group.values.map((value) => value.code))
          return (
            <article id={`accessory-option-group-${group.id}`} key={group.id} className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <Layers3 size={17} className="text-brand-600" />
                <span className="flex-1 text-sm font-bold text-slate-900">{group.name || 'Nhóm tùy chọn mới'}</span>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">Tạo SKU</span>
                {preset && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Dùng {preset.usageCount} lần trong dữ liệu hiện tại</span>}
                <button type="button" aria-label="Xóa nhóm tùy chọn" onClick={() => removeGroup(group.id)} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-4">
                <label className={labelClass}>Thuộc tính có sẵn
                  <select value={group.presetCode} onChange={(event) => applyPreset(group, event.target.value)} className={inputClass}>
                    <option value="">Tạo thuộc tính mới</option>
                    {ACCESSORY_OPTION_PRESETS.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.usageCount} lượt dùng</option>)}
                  </select>
                </label>
                <label className={labelClass}>Tên hiển thị<input value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} placeholder="Màu sắc" className={inputClass} /></label>
                <label className={labelClass}>Kiểu hiển thị<select value={group.displayType} onChange={(event) => updateGroup(group.id, { displayType: event.target.value as DraftOptionGroup['displayType'] })} className={inputClass}><option value="BUTTON">Nút chọn</option><option value="SWATCH">Màu / swatch</option><option value="SELECT">Danh sách</option></select></label>
                <label className="flex items-center gap-3 self-end rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><input type="checkbox" checked={draftOptionGroupIsRequired(group)} onChange={(event) => updateGroup(group.id, { minimumSelections: event.target.checked ? 1 : 0 })} className="h-4 w-4 accent-slate-900" />Bắt buộc chọn</label>
                <details className="lg:col-span-4">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500">Thiết lập nâng cao</summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <label className={labelClass}>Mã nhóm<input value={group.code} onChange={(event) => updateGroup(group.id, { presetCode: '', code: accessoryAdminSlug(event.target.value).replaceAll('-', '_') })} placeholder="color" className={inputClass} /></label>
                    <label className="flex items-center gap-3 self-end rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><input type="checkbox" checked={draftOptionGroupSupportsMedia(group)} onChange={(event) => setGroupMediaEnabled(group.id, event.target.checked)} className="h-4 w-4 accent-slate-900" /><span><span className="block">Thuộc tính này làm thay đổi hình ảnh</span><span className="mt-0.5 block text-xs font-normal text-slate-500">Mặc định bật cho màu/swatch, tắt cho size và thuộc tính thường.</span></span></label>
                  </div>
                </details>
              </div>
              <div className="border-t border-slate-100 px-4 py-4">
                <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-slate-800">Giá trị</h4><button type="button" onClick={() => addValue(group)} className="inline-flex items-center gap-1 text-xs font-bold text-brand-700"><Plus size={13} />Thêm giá trị</button></div>
                {preset && (
                  <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
                    <p className="text-xs font-bold text-brand-800">Gợi ý từ dữ liệu hiện tại</p>
                    <div className="mt-2 flex flex-wrap gap-2">{preset.suggestedValues.map((name) => { const code = accessoryAdminSlug(name); const added = addedCodes.has(code); return <button key={name} type="button" disabled={added} onClick={() => addSuggestedValue(group, name)} className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:border-brand-500 active:scale-[0.98] disabled:cursor-default disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700">{added ? '✓ ' : '+ '}{name}</button> })}</div>
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  {group.values.map((value) => (
                    <div key={value.id} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:grid-cols-[1fr_140px_1fr_auto]">
                      <label className="text-xs font-semibold text-slate-500">Tên giá trị<input value={value.name} onChange={(event) => { const name = event.target.value; updateGroup(group.id, { values: group.values.map((item) => item.id === value.id ? { ...item, name, code: accessoryAdminSlug(name) } : item) }) }} placeholder="Xanh dương" className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900" /></label>
                      {group.displayType === 'SWATCH' ? <label className="text-xs font-semibold text-slate-500">Mã màu<input value={value.colorHex} onChange={(event) => updateGroup(group.id, { values: group.values.map((item) => item.id === value.id ? { ...item, colorHex: event.target.value } : item) })} placeholder="#0057B8" className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900" /></label> : <span />}
                      {group.displayType === 'SWATCH' ? <label className="text-xs font-semibold text-slate-500">URL swatch<input value={value.swatchUrl} onChange={(event) => updateGroup(group.id, { values: group.values.map((item) => item.id === value.id ? { ...item, swatchUrl: event.target.value } : item) })} placeholder="Không bắt buộc" className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900" /></label> : <details className="self-end"><summary className="cursor-pointer pb-2 text-xs font-semibold text-slate-500">Mã: {value.code || 'chưa có'}</summary><input aria-label="Mã giá trị" value={value.code} onChange={(event) => updateGroup(group.id, { values: group.values.map((item) => item.id === value.id ? { ...item, code: accessoryAdminSlug(event.target.value) } : item) })} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" /></details>}
                      <button type="button" aria-label="Xóa giá trị" disabled={group.values.length <= 1} onClick={() => removeValue(group, value.id)} className="self-end rounded px-2 py-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><X size={15} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          )
        })}
        {draft.optionGroups.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-500">Không có nhóm tùy chọn — sản phẩm có thể dùng một biến thể mặc định.</div>}
          </section>

          <div className="flex items-start gap-3 rounded-lg border border-brand-100 bg-brand-50/60 p-4 text-brand-900">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-brand-700 shadow-sm"><Layers3 size={17} /></div>
            <div>
              <p className="text-sm font-bold">{variantGroups(draft.optionGroups).length === 0 ? 'Sẽ tạo 1 biến thể Mặc định' : `${matrixSize} tổ hợp SKU sẽ được tạo tự động`}</p>
              <p className="mt-1 text-xs text-brand-700">Giá niêm yết và giá khuyến mại nằm trên từng SKU, đúng với cấu trúc `product_variants` hiện tại.</p>
              {matrixSize >= 100 && <p className={`mt-2 text-xs font-bold ${matrixSize > 500 ? 'text-red-700' : 'text-amber-700'}`}>{matrixSize > 500 ? 'Vượt giới hạn 500 tổ hợp của prototype.' : 'Ma trận lớn; hãy kiểm tra kỹ trước khi nhập dữ liệu.'}</p>}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <SectionHeading title="Biến thể" />
            <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{draft.variants.length} biến thể</span><span className="text-xs text-slate-400">Kho ban đầu: 0</span>{VARIANT_BULK_EDITING_ENABLED && <button type="button" aria-expanded={bulkEditingOpen} onClick={() => setBulkEditingOpen((current) => !current)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-brand-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{bulkEditingOpen ? 'Ẩn nhập nhanh' : 'Nhập nhanh hàng loạt'}</button>}</div>
          </div>

          <section className="space-y-3">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[840px] table-fixed text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                {VARIANT_BULK_EDITING_ENABLED && <th className="w-10 px-2 py-2"><input type="checkbox" aria-label="Chọn tất cả biến thể" checked={draft.variants.length > 0 && selectedVariantIds.length === draft.variants.length} onChange={(event) => setSelectedVariantIds(event.target.checked ? draft.variants.map((variant) => variant.id) : [])} className="h-4 w-4 accent-slate-900" /></th>}
                <th className="w-[24%] px-2 py-2">Biến thể</th>
                <th className="w-[20%] px-2 py-2">SKU</th>
                <th className="w-[18%] px-2 py-2">Giá niêm yết</th>
                <th className="w-[18%] px-2 py-2">Giá KM</th>
                <th className="w-20 px-2 py-2">Trạng thái</th>
                <th className="w-16 px-2 py-2 text-right" aria-label="Kiểm tra" />
              </tr>
              {VARIANT_BULK_EDITING_ENABLED && bulkEditingOpen && <tr className="border-t border-slate-200/80 bg-slate-100/70">
                <th className="px-2 py-1.5" />
                <th className="px-2 py-1.5">
                  <span className="inline-flex h-8 items-center rounded-md bg-white px-2 text-[10px] font-bold normal-case tracking-normal text-slate-500 ring-1 ring-inset ring-slate-200">
                    {selectedVariantIds.length > 0 ? `${selectedVariantIds.length} dòng đã chọn` : 'Chưa chọn dòng'}
                  </span>
                  <div className="mt-1 flex gap-2"><button type="button" onClick={() => setSelectedVariantIds(draft.variants.map((variant) => variant.id))} className="text-[10px] font-bold normal-case tracking-normal text-brand-700">Chọn tất cả</button><button type="button" disabled={selectedVariantIds.length === 0} onClick={() => setSelectedVariantIds([])} className="text-[10px] font-bold normal-case tracking-normal text-slate-500 disabled:opacity-40">Bỏ chọn</button></div>
                </th>
                <th className="px-2 py-1.5">
                  <div className="group/bulk relative">
                    <input aria-label="Tiền tố SKU áp dụng hàng loạt" aria-describedby="bulk-sku-tooltip" value={bulkSkuPrefix} onChange={(event) => setBulkSkuPrefix(event.target.value.toUpperCase())} placeholder="Tiền tố SKU" className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 font-mono text-[11px] font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    <BulkControlTooltip id="bulk-sku-tooltip" text="Tạo SKU theo mẫu TIỀN-TỐ-GIÁ-TRỊ-1-GIÁ-TRỊ-2 cho các dòng được áp dụng." />
                  </div>
                </th>
                <th className="px-2 py-1.5">
                  <div className="group/bulk relative">
                    <input aria-label="Giá niêm yết áp dụng hàng loạt" aria-describedby="bulk-original-price-tooltip" type="number" min="0" step="1000" value={bulkOriginalPrice} onChange={(event) => setBulkOriginalPrice(event.target.value)} placeholder="Giá chung" className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    <BulkControlTooltip id="bulk-original-price-tooltip" text="Điền giá niêm yết chung cho các dòng được áp dụng. Để trống nếu không muốn thay đổi." />
                  </div>
                </th>
                <th className="px-2 py-1.5">
                  <div className="group/bulk relative">
                    <input aria-label="Giá khuyến mại áp dụng hàng loạt" aria-describedby="bulk-sale-price-tooltip" type="number" min="0" step="1000" value={bulkSalePrice} onChange={(event) => setBulkSalePrice(event.target.value)} placeholder="Giá KM chung" className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    <BulkControlTooltip id="bulk-sale-price-tooltip" text="Điền giá khuyến mại chung cho các dòng được áp dụng. Để trống nếu không muốn thay đổi." />
                  </div>
                </th>
                <th className="px-2 py-1.5">
                  <div className="group/bulk relative flex h-8 rounded-md border border-slate-200 bg-white p-0.5 normal-case tracking-normal">
                    <button type="button" aria-describedby="bulk-active-tooltip" onClick={() => setBulkActive(true)} className="min-w-0 flex-1 rounded text-[10px] font-bold text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Bật</button>
                    <button type="button" aria-describedby="bulk-active-tooltip" onClick={() => setBulkActive(false)} className="min-w-0 flex-1 rounded text-[10px] font-bold text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Tắt</button>
                    <BulkControlTooltip id="bulk-active-tooltip" text="Đổi trạng thái ngay cho các dòng được áp dụng." align="right" />
                  </div>
                </th>
                <th className="px-2 py-1.5 text-right">
                  <div className="group/bulk relative inline-flex">
                    <button type="button" aria-label="Áp dụng SKU và giá hàng loạt" aria-describedby="bulk-apply-tooltip" disabled={selectedVariantIds.length === 0} onClick={applyBulkValues} className="inline-flex h-8 w-12 items-center justify-center rounded-md bg-brand-600 text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
                      <Copy size={14} />
                    </button>
                    <BulkControlTooltip id="bulk-apply-tooltip" text={selectedVariantIds.length > 0 ? `Áp dụng SKU và giá cho ${selectedVariantIds.length} dòng đã chọn.` : 'Hãy chọn ít nhất một dòng trước khi áp dụng.'} align="right" />
                  </div>
                  <div className="mt-1 flex gap-1"><button type="button" disabled={selectedVariantIds.length === 0} onClick={() => setBulkIncluded(true)} className="rounded border border-slate-200 px-1.5 py-1 text-[9px] normal-case text-slate-600 disabled:opacity-40">Bán</button><button type="button" disabled={selectedVariantIds.length === 0} onClick={() => setBulkIncluded(false)} className="rounded border border-slate-200 px-1.5 py-1 text-[9px] normal-case text-slate-600 disabled:opacity-40">Loại</button></div>
                </th>
              </tr>}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.variants.map((variant, index) => {
                const complete = variantIsComplete(variant, draft.optionGroups) && !duplicateSkus.has(variant.id) && !duplicateSignatures.has(variant.id)
                const optionNames = variantGroups(draft.optionGroups).flatMap((group) => {
                  const value = group.values.find((item) => item.id === variant.selections[group.id])
                  return value ? [value.name || value.code] : variant.selections[group.id] === null ? [`Không chọn ${group.name.toLocaleLowerCase('vi-VN')}`] : []
                })
                return (
                  <tr id={`accessory-variant-${variant.id}`} key={variant.id} className={variant.isIncluded === false ? 'bg-slate-100 opacity-70' : complete ? 'bg-white' : 'bg-amber-50/40'}>
                    {VARIANT_BULK_EDITING_ENABLED && <td className="px-2 py-2 align-top"><input type="checkbox" aria-label={`Chọn ${variant.name || `biến thể ${index + 1}`}`} checked={selectedVariantIds.includes(variant.id)} onChange={() => toggleVariantSelection(variant.id)} className="mt-2 h-4 w-4 accent-slate-900" /></td>}
                    <td className="px-2 py-2 align-top"><input aria-label="Tên biến thể" value={variant.name} onChange={(event) => updateVariant(variant.id, { name: event.target.value })} className="h-8 w-full rounded border border-slate-200 px-2 font-semibold outline-none focus:border-brand-500" /><p className="mt-1 truncate text-[10px] text-slate-400" title={optionNames.join(' / ')}>{optionNames.join(' / ') || 'Mặc định'}</p></td>
                    <td className="px-2 py-2 align-top"><input aria-label="SKU" value={variant.sku} onChange={(event) => updateVariant(variant.id, { sku: event.target.value.toUpperCase() })} className={`h-8 w-full rounded border px-2 font-mono text-[11px] outline-none focus:border-brand-500 ${duplicateSkus.has(variant.id) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`} />{duplicateSkus.has(variant.id) && <span className="mt-1 block text-[10px] font-semibold text-red-600">SKU bị trùng</span>}</td>
                    <td className="px-2 py-2 align-top"><input aria-label="Giá niêm yết" type="number" min="0" step="1000" value={variant.originalPrice} onChange={(event) => updateVariant(variant.id, { originalPrice: event.target.value })} className="h-8 w-full rounded border border-slate-200 px-2 outline-none focus:border-brand-500" /></td>
                    <td className="px-2 py-2 align-top"><input aria-label="Giá khuyến mại" type="number" min="0" step="1000" value={variant.salePrice} onChange={(event) => updateVariant(variant.id, { salePrice: event.target.value })} className="h-8 w-full rounded border border-slate-200 px-2 outline-none focus:border-brand-500" /></td>
                    <td className="px-2 py-2 align-top"><div className="space-y-1"><label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-600"><input type="checkbox" checked={variant.isIncluded !== false} onChange={(event) => updateVariant(variant.id, { isIncluded: event.target.checked })} className="h-4 w-4 accent-slate-900" />{variant.isIncluded === false ? 'Đã loại' : 'Đang bán'}</label><label className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] text-slate-500"><input type="checkbox" disabled={variant.isIncluded === false} checked={variant.isActive} onChange={(event) => updateVariant(variant.id, { isActive: event.target.checked })} className="h-3.5 w-3.5 accent-slate-900" />Hoạt động</label></div></td>
                    <td className="px-2 py-2 text-right align-top"><div className="flex items-center justify-end">{variant.isIncluded === false ? <Minus size={15} className="text-slate-400" /> : complete ? <Check size={15} className="text-emerald-600" /> : <AlertCircle size={15} className="text-amber-500" />}</div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
          </section>
        </>
      )}
    </div>
  )
}

function UrlEditor({ urls, label, onChange }: { urls: string[]; label: string; onChange: (urls: string[]) => void }) {
  return <div className="space-y-2">{urls.map((url, index) => <div key={index} className="flex gap-2"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">{url.trim() ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={16} className="text-slate-300" />}</div><input value={url} onChange={(event) => onChange(urls.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`${label} ${index + 1}`} className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500" /><button type="button" aria-label={`Xóa ${label.toLocaleLowerCase('vi-VN')} ${index + 1}`} disabled={urls.length <= 1} onClick={() => onChange(urls.filter((_, itemIndex) => itemIndex !== index))} className="rounded-md px-3 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 size={15} /></button></div>)}<button type="button" onClick={() => onChange([...urls, ''])} className="inline-flex min-h-9 items-center gap-2 text-xs font-bold text-brand-700"><Plus size={14} />Thêm URL</button></div>
}

function MediaStep({ draft, onChange }: { draft: AdminAccessoryDraft; onChange: (next: AdminAccessoryDraft) => void }) {
  const mediaOptionGroups = draft.optionGroups.filter((group) => (
    draftOptionGroupSupportsMedia(group)
    && group.values.some((value) => value.name.trim())
  ))
  const selectedMediaGroupId = resolvedDraftMediaOptionGroupId(draft)
  const selectedMediaGroup = mediaOptionGroups.find((group) => group.id === selectedMediaGroupId) ?? null
  const variantOverrideCount = draft.variants.filter((variant) => nonEmptyUrls(variant.imageUrls).length > 0).length

  function updateOptionValueImages(groupId: string, valueId: string, imageUrls: string[]) {
    onChange({
      ...draft,
      optionGroups: draft.optionGroups.map((group) => group.id === groupId
        ? { ...group, values: group.values.map((value) => value.id === valueId ? { ...value, imageUrls } : value) }
        : group),
    })
  }

  return (
    <div className="space-y-7">
      <SectionHeading title="Hình ảnh sản phẩm" />
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-slate-900">Gallery chung</h3>
        <p className="mb-3 mt-1 text-xs text-slate-500">Ảnh mặc định khi thuộc tính hoặc SKU chưa có bộ ảnh riêng.</p>
        <UrlEditor urls={draft.productImageUrls} label="URL gallery" onChange={(productImageUrls) => onChange({ ...draft, productImageUrls })} />
      </section>

      {mediaOptionGroups.length === 0 ? (
        <section className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
          Không có thuộc tính làm thay đổi hình ảnh. Sản phẩm sẽ dùng Gallery chung; bạn có thể bật khả năng này trong Thiết lập nâng cao của một thuộc tính.
        </section>
      ) : mediaOptionGroups.length === 1 && selectedMediaGroup ? (
        <section className="rounded-lg border border-slate-200 bg-white px-5 py-4">
          <p className="text-sm font-bold text-slate-900">Ảnh thay đổi theo: {selectedMediaGroup.name || selectedMediaGroup.code}</p>
          <p className="mt-1 text-xs text-slate-500">Được tự động xác định từ thuộc tính phía trên; không cần chọn thêm.</p>
        </section>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <label className={labelClass}>Ảnh thay đổi theo
            <select
              value={selectedMediaGroupId ?? ''}
              onChange={(event) => onChange({ ...draft, mediaOptionGroupId: event.target.value || null })}
              className={`${inputClass} max-w-xl`}
            >
              <option value="">Không thay đổi — chỉ dùng Gallery chung</option>
              {mediaOptionGroups.map((group) => {
                const imageCount = group.values.reduce((total, value) => total + nonEmptyUrls(value.imageUrls).length, 0)
                return <option key={group.id} value={group.id}>{group.name || group.code}{imageCount > 0 ? ` · ${imageCount} ảnh đã nhập` : ''}</option>
              })}
            </select>
          </label>
          <p className="mt-2 text-xs text-slate-500">Chỉ những thuộc tính được phép thay đổi hình ảnh mới xuất hiện trong danh sách.</p>
        </section>
      )}

      {selectedMediaGroup && (
        <section className="rounded-lg border border-brand-200 bg-brand-50/40 p-5">
          <h3 className="text-sm font-bold text-brand-900">Ảnh theo {selectedMediaGroup.name || selectedMediaGroup.code}</h3>
          <p className="mt-1 text-xs text-brand-700">Mỗi bộ ảnh được dùng chung cho mọi SKU có cùng giá trị thuộc tính này.</p>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {selectedMediaGroup.values.filter((value) => value.name.trim()).map((value) => (
              <article key={`${selectedMediaGroup.id}-${value.id}`} className="rounded-lg border border-brand-100 bg-white p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className="h-7 w-7 rounded-md border border-black/10" style={{ backgroundColor: value.colorHex || '#e2e8f0' }} />
                  <div><p className="text-sm font-bold text-slate-900">{value.name}</p><p className="font-mono text-[11px] text-slate-400">{selectedMediaGroup.code}={value.code}</p></div>
                </div>
                <UrlEditor urls={value.imageUrls.length > 0 ? value.imageUrls : ['']} label={`URL ảnh ${value.name}`} onChange={(imageUrls) => updateOptionValueImages(selectedMediaGroup.id, value.id, imageUrls)} />
              </article>
            ))}
          </div>
        </section>
      )}

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500">
          <span>Ảnh riêng cho SKU <span className="font-medium text-slate-500">(nâng cao)</span></span>
          <span className="inline-flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{variantOverrideCount}/{draft.variants.length} SKU có ảnh riêng</span><span aria-hidden="true" className="text-slate-400">▾</span></span>
        </summary>
        <div className="space-y-4 border-t border-slate-200 p-5">
          <p className="text-xs text-slate-500">Chỉ nhập khi một SKU cần bộ ảnh khác. Ảnh SKU sẽ ưu tiên hơn ảnh theo thuộc tính và Gallery chung.</p>
          {draft.variants.map((variant) => (
            <section key={variant.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-900">{variant.name || 'Biến thể chưa đặt tên'}</h3><p className="mt-1 font-mono text-xs text-slate-400">{variant.sku || 'CHƯA CÓ SKU'}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">Ảnh riêng cho SKU</span></div>
              <UrlEditor urls={variant.imageUrls} label="URL ảnh riêng" onChange={(imageUrls) => onChange({ ...draft, variants: draft.variants.map((item) => item.id === variant.id ? { ...item, imageUrls } : item) })} />
            </section>
          ))}
        </div>
      </details>
    </div>
  )
}

type AccessoryEditorView = 'edit' | 'preview'
type AccessorySectionId = 'classification' | 'general' | 'content' | 'commerce' | 'media'
type AccessorySectionStatus = 'incomplete' | 'complete' | 'optional'

const ACCESSORY_EDITOR_SECTIONS: Array<{ id: AccessorySectionId; label: string }> = [
  { id: 'classification', label: 'Phân loại' },
  { id: 'general', label: 'Thông tin' },
  { id: 'content', label: 'Nội dung' },
  { id: 'commerce', label: 'Tùy chọn & biến thể' },
  { id: 'media', label: 'Hình ảnh' },
]

const accessorySectionStatusLabel: Record<AccessorySectionStatus, string> = {
  incomplete: 'Chưa hoàn tất',
  complete: 'Đã hoàn tất',
  optional: 'Không áp dụng',
}

function accessoryDraftWithRootCategory(rootCategoryId: string) {
  return { ...createAdminAccessoryDraft(), rootCategoryId }
}

export function AccessoryProductCreateDialog({
  open,
  rootCategoryId,
  serviceLabels,
  onClose,
  onChangeType,
  onDirtyChange,
  onPrototypeComplete,
  onNotify,
  onConfirmDestructive,
}: {
  open: boolean
  rootCategoryId: string
  serviceLabels: CatalogServiceLabel[]
  onClose: () => void
  onChangeType: () => void
  onDirtyChange: (dirty: boolean) => void
  onPrototypeComplete: () => void
  onNotify: (kind: ToastKind, title: string, message?: string) => void
  onConfirmDestructive: (title: string, message: string, onConfirm: () => void) => void
}) {
  const [draft, setDraft] = useState<AdminAccessoryDraft>(() => accessoryDraftWithRootCategory(rootCategoryId))
  const [view, setView] = useState<AccessoryEditorView>('edit')
  const [slugEdited, setSlugEdited] = useState(false)
  const [reviewDecisionOpen, setReviewDecisionOpen] = useState(false)
  const [taxonomyCollections, setTaxonomyCollections] = useState<DraftCollection[]>([])
  const [taxonomyLoading, setTaxonomyLoading] = useState(false)
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null)
  const [taxonomyReloadKey, setTaxonomyReloadKey] = useState(0)
  const [hasLocalDraft, setHasLocalDraft] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const reviewTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open || !rootCategoryId) return
    const controller = new AbortController()
    setTaxonomyLoading(true)
    setTaxonomyError(null)

    fetch(`/api/v1/admin/catalog-collections?rootCategoryId=${encodeURIComponent(rootCategoryId)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof (payload as Record<string, unknown>).error === 'string'
            ? String((payload as Record<string, unknown>).error)
            : 'Không thể tải cấu trúc danh mục.'
          throw new Error(message)
        }
        if (!Array.isArray(payload)) throw new Error('Dữ liệu taxonomy không đúng định dạng.')
        return payload.filter(isDraftCollection)
      })
      .then((collections) => {
        setTaxonomyCollections(collections)
        setDraft((current) => {
          const categoryExists = accessoryCategoryCollections(collections)
            .some((collection) => collection.slug === current.primaryCollectionSlug)
          if (!categoryExists) {
            return current.primaryCollectionSlug || current.modelCollectionSlugs.length > 0
              ? { ...current, primaryCollectionSlug: '', modelCollectionSlugs: [] }
              : current
          }
          const allowedSlugs = new Set(
            accessoryModelCollectionsForCategory(collections, current.primaryCollectionSlug)
              .map((collection) => collection.slug),
          )
          const modelCollectionSlugs = current.modelCollectionSlugs.filter((slug) => allowedSlugs.has(slug))
          return modelCollectionSlugs.length === current.modelCollectionSlugs.length
            ? current
            : { ...current, modelCollectionSlugs }
        })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setTaxonomyCollections([])
        setTaxonomyError(error instanceof Error ? error.message : 'Không thể tải cấu trúc danh mục.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setTaxonomyLoading(false)
      })

    return () => controller.abort()
  }, [open, rootCategoryId, taxonomyReloadKey])

  useEffect(() => {
    if (!open) return
    setHasLocalDraft(Boolean(window.sessionStorage.getItem(ADMIN_ACCESSORY_SESSION_KEY)))
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => closeRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !reviewDecisionOpen) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open, reviewDecisionOpen])

  useEffect(() => {
    onDirtyChange(JSON.stringify(draft) !== JSON.stringify(accessoryDraftWithRootCategory(rootCategoryId)))
  }, [draft, onDirtyChange, rootCategoryId])

  const validationIssues = useMemo(() => validateAdminAccessoryDraft(draft), [draft])
  const optionErrors = validationIssues.filter((issue) => issue.section === 'options' && issue.severity === 'error')
  const variantErrors = validationIssues.filter((issue) => issue.section === 'variants' && issue.severity === 'error')
  const commerceComplete = optionErrors.length === 0 && variantErrors.length === 0
  const hasMedia = Boolean(nonEmptyUrls(draft.productImageUrls).length || draft.variants.some((variant) => nonEmptyUrls(variant.imageUrls).length))
  const primaryCollectionValid = accessoryCategoryCollections(taxonomyCollections)
    .some((collection) => collection.slug === draft.primaryCollectionSlug)
  const optionMatrixKey = useMemo(() => JSON.stringify(draft.optionGroups.map((group) => ({
    id: group.id,
    name: group.name,
    code: group.code,
    minimumSelections: group.minimumSelections,
    maximumSelections: group.maximumSelections,
    values: group.values.map((value) => ({ id: value.id, name: value.name, code: value.code })),
  }))), [draft.optionGroups])

  useEffect(() => {
    setDraft((current) => {
      if (projectedVariantCount(current.optionGroups) > 500) return current
      const variants = buildVariantMatrix(current.optionGroups, current.variants)
      return JSON.stringify(variants) === JSON.stringify(current.variants) ? current : { ...current, variants }
    })
  }, [optionMatrixKey])

  function reset() {
    setDraft(accessoryDraftWithRootCategory(rootCategoryId))
    setView('edit')
    setSlugEdited(false)
    setReviewDecisionOpen(false)
  }

  function saveLocalDraft(nextDraft = draft, notify = true) {
    try {
      window.sessionStorage.setItem(ADMIN_ACCESSORY_SESSION_KEY, serializeAdminAccessoryDraft(nextDraft))
      setHasLocalDraft(true)
      if (notify) onNotify('success', 'Đã lưu bản nháp cục bộ', 'Bản mẫu chỉ tồn tại trong phiên trình duyệt hiện tại.')
      return true
    } catch {
      onNotify('error', 'Không thể lưu bản nháp', 'Bộ nhớ phiên trình duyệt không khả dụng hoặc đã đầy.')
      return false
    }
  }

  function restoreLocalDraft() {
    const serialized = window.sessionStorage.getItem(ADMIN_ACCESSORY_SESSION_KEY)
    if (!serialized) {
      setHasLocalDraft(false)
      onNotify('warning', 'Không có bản nháp cục bộ', 'Hãy lưu bản nháp trước khi khôi phục.')
      return
    }
    try {
      setDraft(restoreAdminAccessoryDraft(serialized, rootCategoryId))
      setSlugEdited(true)
      setView('edit')
      onNotify('success', 'Đã khôi phục bản nháp', 'Dữ liệu đã được nạp từ phiên trình duyệt hiện tại.')
    } catch (error) {
      onNotify('error', 'Không thể khôi phục bản nháp', error instanceof Error ? error.message : 'Dữ liệu bản nháp không hợp lệ.')
    }
  }

  function clearLocalDraft() {
    onConfirmDestructive('Xóa bản nháp cục bộ?', 'Bản nháp trong phiên trình duyệt sẽ không thể khôi phục sau khi xóa.', () => {
      window.sessionStorage.removeItem(ADMIN_ACCESSORY_SESSION_KEY)
      setHasLocalDraft(false)
      onNotify('success', 'Đã xóa bản nháp cục bộ')
    })
  }

  function completeReview(isActive: boolean) {
    const nextDraft = { ...draft, isActive }
    setDraft(nextDraft)
    saveLocalDraft(nextDraft, !isActive)
    setReviewDecisionOpen(false)
    if (isActive) onPrototypeComplete()
  }

  function statusForSection(sectionId: AccessorySectionId): AccessorySectionStatus {
    if (sectionId === 'classification') return primaryCollectionValid ? 'complete' : 'incomplete'
    if (sectionId === 'general') return draft.name.trim() && draft.slug.trim() && draft.description.trim() ? 'complete' : 'incomplete'
    if (sectionId === 'content') return draft.sections.length === 0 ? 'optional' : draft.sections.every(isSectionComplete) ? 'complete' : 'incomplete'
    if (sectionId === 'commerce') return commerceComplete ? 'complete' : 'incomplete'
    return hasMedia ? 'complete' : 'incomplete'
  }

  function scrollToSection(sectionId: AccessorySectionId) {
    document.getElementById(`accessory-editor-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const reviewBlockers = useMemo<ProductReviewBlocker[]>(() => {
    const blockers: ProductReviewBlocker[] = []
    if (!primaryCollectionValid) blockers.push({ stepLabel: 'Phân loại', message: 'Chưa chọn danh mục phụ kiện chính từ taxonomy.' })
    if (!draft.name.trim() || !draft.slug.trim() || !draft.description.trim()) blockers.push({ stepLabel: 'Thông tin', message: 'Cần nhập tên, đường dẫn và mô tả sản phẩm.' })
    if (draft.sections.length > 0 && !draft.sections.every(isSectionComplete)) blockers.push({ stepLabel: 'Nội dung', message: 'Có section nội dung chưa hoàn chỉnh.' })
    optionErrors.slice(0, 3).forEach((issue) => blockers.push({ stepLabel: 'Tùy chọn', message: issue.message }))
    variantErrors.slice(0, 3).forEach((issue) => blockers.push({ stepLabel: 'Biến thể', message: issue.message }))
    if (!hasMedia) blockers.push({ stepLabel: 'Hình ảnh', message: 'Cần ít nhất một ảnh sản phẩm hoặc ảnh biến thể.' })
    return blockers
  }, [draft.description, draft.name, draft.sections, draft.slug, hasMedia, optionErrors, primaryCollectionValid, variantErrors])

  return (
    <AnimatePresence onExitComplete={reset}>
      {open && (
        <motion.div className="fixed inset-0 z-50 !m-0 flex overscroll-none bg-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="create-accessory-title" className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            <header className="flex items-center gap-4 border-b border-slate-200 px-4 py-3 sm:px-6"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-white"><PackagePlus size={19} /></div><div className="min-w-0 flex-1"><h2 id="create-accessory-title" className="text-lg font-bold text-slate-950">Thêm sản phẩm · Phụ kiện</h2><p className="text-xs text-slate-500">Bản mẫu cục bộ · chưa ghi vào hệ thống</p></div><button type="button" onClick={onChangeType} className="hidden rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:inline-flex">Đổi loại</button><button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng" className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X size={20} /></button></header>

            <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/60">
              <AnimatePresence mode="wait" initial={false}>
                {view === 'edit' ? (
                  <motion.div key="edit" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>
                    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
                      <div className="flex items-center gap-3">
                        <nav aria-label="Mục lục chỉnh sửa phụ kiện" className="min-w-0 flex-1 overflow-x-auto">
                          <div className="flex w-max gap-2">
                            {ACCESSORY_EDITOR_SECTIONS.map((item) => {
                              const status = statusForSection(item.id)
                              return (
                                <button key={item.id} type="button" aria-label={`${item.label}: ${accessorySectionStatusLabel[status]}`} onClick={() => scrollToSection(item.id)} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-950 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                                  <span className={`grid h-5 w-5 place-items-center rounded-full ${status === 'complete' ? 'bg-emerald-100 text-emerald-700' : status === 'optional' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{status === 'complete' ? <Check size={12} /> : status === 'optional' ? <Minus size={12} /> : <AlertCircle size={12} />}</span>
                                  {item.label}
                                </button>
                              )
                            })}
                          </div>
                        </nav>
                        <span className={`hidden shrink-0 rounded-md px-3 py-1.5 text-xs font-bold sm:inline-flex ${reviewBlockers.length === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{reviewBlockers.length === 0 ? 'Sẵn sàng duyệt' : `${reviewBlockers.length} mục cần hoàn thiện`}</span>
                      </div>
                    </div>

                    <div className="mx-auto flex w-full max-w-[1500px] items-start">
                      <aside className="sticky top-0 hidden h-[calc(100vh-10rem)] w-56 shrink-0 border-r border-slate-200 bg-white/70 p-4 lg:block">
                        <nav aria-label="Mục lục chỉnh sửa phụ kiện">
                          <div className="space-y-1">
                            {ACCESSORY_EDITOR_SECTIONS.map((item) => {
                              const status = statusForSection(item.id)
                              return (
                                <button key={item.id} type="button" aria-label={`${item.label}: ${accessorySectionStatusLabel[status]}`} onClick={() => scrollToSection(item.id)} className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${status === 'complete' ? 'bg-emerald-100 text-emerald-700' : status === 'optional' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{status === 'complete' ? <Check size={13} /> : status === 'optional' ? <Minus size={13} /> : <AlertCircle size={13} />}</span>
                                  <span>{item.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </nav>
                        <div className="mt-4 border-t border-slate-200 pt-4">
                          <span className={`flex w-full rounded-md px-3 py-2 text-xs font-bold ${reviewBlockers.length === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{reviewBlockers.length === 0 ? 'Sẵn sàng duyệt' : `${reviewBlockers.length} mục cần hoàn thiện`}</span>
                        </div>
                      </aside>

                      <div className="min-w-0 flex-1 space-y-5 p-4 sm:p-6 lg:p-8">
                        <section id="accessory-editor-classification" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><ClassificationStep draft={draft} collections={taxonomyCollections} taxonomyLoading={taxonomyLoading} taxonomyError={taxonomyError} onRetryTaxonomy={() => setTaxonomyReloadKey((value) => value + 1)} onChange={setDraft} /></section>
                        <section id="accessory-editor-general" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><GeneralStep draft={draft} serviceLabels={serviceLabels} slugEdited={slugEdited} onSlugEdited={() => setSlugEdited(true)} onChange={setDraft} /></section>
                        <section id="accessory-editor-content" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><ContentStep draft={draft} onChange={setDraft} /></section>
                        <section id="accessory-editor-commerce" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                          <div className="space-y-10">
                            <OptionsAndVariantsStep draft={draft} view="options" onChange={setDraft} onConfirmDestructive={onConfirmDestructive} />
                            <div className="border-t border-slate-200 pt-8"><OptionsAndVariantsStep draft={draft} view="variants" onChange={setDraft} onConfirmDestructive={onConfirmDestructive} /></div>
                          </div>
                        </section>
                        <section id="accessory-editor-media" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><MediaStep draft={draft} onChange={setDraft} /></section>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="preview" className="mx-auto w-full max-w-[1380px] p-4 sm:p-6 lg:p-8" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.16 }}>
                    <div className="space-y-4">{reviewBlockers.length > 0 && <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><AlertCircle className="h-5 w-5 shrink-0" /><div><p className="font-bold">Bản nháp còn thiếu thông tin</p><p className="mt-1">Còn {reviewBlockers.length} mục cần hoàn thiện trước khi hiển thị.</p></div></div>}<AccessoryProductPreview draft={draft} serviceLabels={serviceLabels} collections={taxonomyCollections} /></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            <footer className="flex items-center gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
              <div className="min-w-0 flex-1">{view === 'preview' ? <Button type="button" variant="outline" onClick={() => setView('edit')}><ChevronLeft size={16} className="mr-2" />Quay lại chỉnh sửa</Button> : <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onChangeType} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 sm:hidden">Đổi loại</button><Button type="button" variant="outline" onClick={() => saveLocalDraft()}><Save size={15} className="mr-2" />Lưu cục bộ</Button><Button type="button" variant="outline" disabled={!hasLocalDraft} onClick={restoreLocalDraft}><RotateCcw size={15} className="mr-2" />Khôi phục</Button>{hasLocalDraft && <button type="button" onClick={clearLocalDraft} className="px-2 py-2 text-xs font-semibold text-slate-500 transition hover:text-red-600">Xóa nháp</button>}</div>}</div>
              <span className="hidden text-xs font-semibold text-slate-500 md:inline">{reviewBlockers.length === 0 ? 'Đã đủ thông tin bắt buộc' : `Còn ${reviewBlockers.length} mục trước khi hiển thị`}</span>
              {view === 'preview' ? <button ref={reviewTriggerRef} type="button" onClick={() => setReviewDecisionOpen(true)} className="inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"><Check size={16} className="mr-2" />Duyệt</button> : <Button type="button" onClick={() => setView('preview')}><Eye size={16} className="mr-2" />Xem trước</Button>}
            </footer>

            <ProductReviewDecisionDialog
              open={reviewDecisionOpen}
              blockers={reviewBlockers}
              triggerRef={reviewTriggerRef}
              onClose={() => setReviewDecisionOpen(false)}
              onSaveDraft={() => completeReview(false)}
              onPublish={() => completeReview(true)}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
