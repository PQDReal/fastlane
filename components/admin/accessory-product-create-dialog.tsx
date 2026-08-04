'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  GripVertical,
  ImageIcon,
  Layers3,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { AccessoryProductPreview } from '@/components/admin/accessory-product-preview'
import { ImageUploadDropzone } from '@/components/admin/image-upload-dropzone'
import { ProductReviewDecisionDialog, type ProductReviewBlocker } from '@/components/admin/product-create/product-review-decision-dialog'
import { Button } from '@/components/ui/button'
import type { ToastKind } from '@/components/ui/toast'
import {
  ACCESSORY_OPTION_PRESETS,
  ACCESSORY_SECTION_TYPES,
  accessoryCategoryCollections,
  accessoryAdminSlug,
  accessoryModelCollectionsForCategory,
  applyAccessoryTemplateCategoryDefaults,
  buildVariantMatrix,
  createDraftOptionValue,
  createAdminAccessoryDraft,
  draftOptionGroupIsRequired,
  isSectionComplete,
  nonEmptyUrls,
  projectedVariantCount,
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
  ACCESSORY_TEMPLATE_DEFINITIONS,
  applyAccessoryTemplateToDraft,
  accessoryTemplate,
  isTemplateSectionKey,
  type AccessoryTemplateCode,
} from '@/lib/catalog/admin-accessory-templates'
import {
  ADMIN_ACCESSORY_SESSION_KEY,
  restoreAdminAccessoryDraft,
  serializeAdminAccessoryDraft,
} from '@/lib/catalog/admin-accessory-session'
import { validateAdminAccessoryDraft } from '@/lib/catalog/admin-accessory-validation'
import {
  adminAccessoryDraftToWriteRequest,
  type AdminAccessorySaveResult,
} from '@/lib/catalog/admin-accessory-write'
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

function TemplateSelectionStep({
  selectedCode,
  currentCode,
  revisiting,
  onSelect,
}: {
  selectedCode: AccessoryTemplateCode | null
  currentCode: AccessoryTemplateCode
  revisiting: boolean
  onSelect: (templateCode: AccessoryTemplateCode) => void
}) {
  const currentTemplate = accessoryTemplate(currentCode)
  const changingTemplate = revisiting && selectedCode !== null && selectedCode !== currentCode

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="max-w-3xl">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Bước 1 · Chọn mẫu nhập</span>
          <h3 className="mt-2 text-2xl font-bold text-slate-950">Chọn mẫu nhập phụ kiện</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">Mẫu chuẩn bị sẵn các trường nội dung phù hợp. Bạn vẫn có thể chỉnh sửa ở bước tiếp theo.</p>
          {revisiting && currentTemplate && (
            <p className="mt-3 text-sm font-semibold text-slate-700">Mẫu đang dùng: <span className="text-brand-700">{currentTemplate.label}</span></p>
          )}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ACCESSORY_TEMPLATE_DEFINITIONS.map((template) => {
            const selected = selectedCode === template.code
            const custom = template.code === 'custom'
            return (
              <button
                key={template.code}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(template.code)}
                className={`relative min-h-28 rounded-lg border p-4 pr-11 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : custom ? 'border-dashed border-slate-300 bg-slate-50 hover:border-slate-500' : 'border-slate-200 bg-white hover:border-slate-400'}`}
              >
                <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{template.group}</span>
                <span className="mt-1 block text-sm font-bold text-slate-900">{template.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{template.description}</span>
                {selected && (
                  <span className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white" aria-hidden="true">
                    <Check size={13} strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {changingTemplate && (
          <div role="status" className="mt-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-bold">Bạn đang chọn một mẫu khác</p><p className="mt-1 leading-6">Khi tiếp tục, các trường do mẫu “{currentTemplate?.label}” tạo sẽ được thay bằng trường của mẫu mới. Thông tin chung, phân loại, tùy chọn, SKU và hình ảnh vẫn được giữ lại.</p></div>
          </div>
        )}
      </div>
    </div>
  )
}

function ClassificationStep({
  draft,
  collections,
  taxonomyLoading,
  taxonomyError,
  onRetryTaxonomy,
  onChange,
  onConfirmDestructive,
}: {
  draft: AdminAccessoryDraft
  collections: DraftCollection[]
  taxonomyLoading: boolean
  taxonomyError: string | null
  onRetryTaxonomy: () => void
  onChange: (next: AdminAccessoryDraft) => void
  onConfirmDestructive: (title: string, message: string, onConfirm: () => void, confirmLabel?: string) => void
}) {
  const categories = useMemo(() => accessoryCategoryCollections(collections), [collections])

  function assignmentFor(categoryId: string) {
    return draft.categoryAssignments.find((assignment) => assignment.categoryId === categoryId)
  }

  function toggleCategory(categoryId: string) {
    const existing = assignmentFor(categoryId)
    if (!existing) {
      const models = accessoryModelCollectionsForCategory(collections, categoryId)
      onChange({
        ...draft,
        categoryAssignments: [...draft.categoryAssignments, {
          categoryId,
          compatibilityMode: models.length === 0 ? 'NOT_APPLICABLE' : null,
          modelIds: [],
        }],
      })
      return
    }
    onConfirmDestructive(
      'Bỏ danh mục phụ kiện?',
      'Phạm vi tương thích dòng xe của danh mục này cũng sẽ bị xóa khỏi bản nháp.',
      () => onChange({ ...draft, categoryAssignments: draft.categoryAssignments.filter((assignment) => assignment.categoryId !== categoryId) }),
    )
  }

  function updateAssignment(categoryId: string, patch: Partial<AdminAccessoryDraft['categoryAssignments'][number]>) {
    onChange({
      ...draft,
      categoryAssignments: draft.categoryAssignments.map((assignment) => (
        assignment.categoryId === categoryId ? { ...assignment, ...patch } : assignment
      )),
    })
  }

  return (
    <div className="space-y-5">
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
      <div className="space-y-5">
        <fieldset>
          <legend className="text-sm font-semibold text-slate-700">Danh mục phụ kiện <span className="text-red-500">*</span></legend>
          <p className="mt-1 text-sm text-slate-500">Có thể chọn nhiều danh mục ngang hàng; không có danh mục chính/phụ.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((collection) => {
              const selected = Boolean(assignmentFor(collection.id))
              const atLimit = !selected && draft.categoryAssignments.length >= 20
              return <button key={collection.id} type="button" disabled={atLimit} aria-pressed={selected} onClick={() => toggleCategory(collection.id)} className={`flex min-h-11 items-center justify-between rounded-md border px-4 text-left text-sm font-semibold transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-45 ${selected ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-100' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}><span>{collection.name}</span>{selected && <Check size={16} />}</button>
            })}
            {categories.length === 0 && <p className="border border-dashed border-slate-200 p-4 text-sm text-slate-500">Chưa có danh mục taxonomy hoạt động.</p>}
          </div>
        </fieldset>

        {draft.categoryAssignments.map((assignment) => {
          const category = categories.find((item) => item.id === assignment.categoryId)
          if (!category) return null
          const models = accessoryModelCollectionsForCategory(collections, category.id)
          if (models.length === 0) return null
          const selectedModels = new Set(assignment.modelIds)
          return <fieldset key={category.id} className="rounded-lg border border-brand-200 bg-brand-50/30 p-4"><legend className="px-1 text-sm font-bold text-slate-800">Tương thích · {category.name} <span className="text-red-500">*</span></legend><div className="mt-2 flex flex-wrap gap-2"><button type="button" aria-pressed={assignment.compatibilityMode === 'ALL_MODELS'} onClick={() => updateAssignment(category.id, { compatibilityMode: 'ALL_MODELS', modelIds: [] })} className={`rounded-md border px-3 py-2 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${assignment.compatibilityMode === 'ALL_MODELS' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>Tất cả dòng xe</button><button type="button" aria-pressed={assignment.compatibilityMode === 'SELECTED_MODELS'} onClick={() => updateAssignment(category.id, { compatibilityMode: 'SELECTED_MODELS' })} className={`rounded-md border px-3 py-2 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${assignment.compatibilityMode === 'SELECTED_MODELS' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>Chọn dòng xe</button></div>{assignment.compatibilityMode === 'SELECTED_MODELS' && <div className="mt-3"><div className="mb-2 flex flex-wrap gap-2"><button type="button" onClick={() => updateAssignment(category.id, { modelIds: models.map((model) => model.id) })} className="text-xs font-bold text-brand-700">Chọn tất cả</button><button type="button" onClick={() => updateAssignment(category.id, { modelIds: [] })} className="text-xs font-bold text-slate-600">Bỏ chọn</button></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{models.map((model) => { const selected = selectedModels.has(model.id); return <button key={model.id} type="button" aria-pressed={selected} onClick={() => updateAssignment(category.id, { modelIds: selected ? assignment.modelIds.filter((id) => id !== model.id) : [...assignment.modelIds, model.id] })} className={`min-h-10 rounded-md border px-3 text-sm font-semibold transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'border-brand-600 bg-white text-brand-800' : 'border-slate-200 bg-white text-slate-600'}`}>{model.name}</button> })}</div></div>}</fieldset>
        })}
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
    <div className="space-y-5">
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

function ContentSectionEditor({
  section,
  editorMode,
  templateOwned,
  onModeChange,
  onUpdate,
}: {
  section: DraftContentSection
  editorMode: ContentEditorMode
  templateOwned: boolean
  onModeChange: (mode: ContentEditorMode) => void
  onUpdate: (patch: Partial<DraftContentSection>) => void
}) {
  const itemCount = section.itemsText.split('\n').filter((item) => item.trim()).length
  const attributeCount = section.attributes.filter((attribute) => attribute.label.trim() || attribute.value.trim()).length
  const tabs = [
    { id: 'body' as const, label: 'Đoạn văn', count: section.body.trim() ? 1 : 0 },
    { id: 'items' as const, label: 'Danh sách', count: itemCount },
    { id: 'attributes' as const, label: 'Thuộc tính', count: attributeCount },
  ]

  return (
    <div>
      <div className="flex items-end justify-between gap-3 border-b border-slate-200">
        <div role="tablist" aria-label={`Kiểu nội dung ${section.title}`} className="flex min-w-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={editorMode === tab.id}
              onClick={() => onModeChange(tab.id)}
              className={`min-h-10 shrink-0 border-b-2 px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${editorMode === tab.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
            >
              {tab.label}{tab.count > 0 && <span className="ml-1.5 text-xs text-slate-400">{tab.count}</span>}
            </button>
          ))}
        </div>
        {editorMode === 'attributes' && !templateOwned && (
          <button type="button" onClick={() => onUpdate({ attributes: [...section.attributes, { id: draftId('attribute'), label: '', value: '' }] })} className="mb-1 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-bold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Plus size={13} />Thêm thuộc tính</button>
        )}
      </div>

      <div className="pt-3">
        {editorMode === 'body' && (
          <textarea aria-label={`Nội dung đoạn văn ${section.title}`} value={section.body} rows={5} onChange={(event) => onUpdate({ body: event.target.value })} placeholder="Nhập nội dung đoạn văn" className={textareaClass} />
        )}
        {editorMode === 'items' && (
          <textarea aria-label={`Danh sách nội dung ${section.title}`} value={section.itemsText} rows={6} onChange={(event) => onUpdate({ itemsText: event.target.value })} placeholder="Nhập mỗi ý trên một dòng" className={textareaClass} />
        )}
        {editorMode === 'attributes' && templateOwned && section.attributes.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {section.attributes.map((attribute) => (
              <label key={attribute.id} className={labelClass}>{attribute.label}
                <input aria-label={attribute.label} value={attribute.value} onChange={(event) => onUpdate({ attributes: section.attributes.map((item) => item.id === attribute.id ? { ...item, value: event.target.value } : item) })} placeholder={`Nhập ${attribute.label.toLocaleLowerCase('vi-VN')}`} className={inputClass} />
              </label>
            ))}
          </div>
        )}
        {editorMode === 'attributes' && templateOwned && section.attributes.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Mục theo mẫu này không có thuộc tính định sẵn. Có thể dùng Đoạn văn hoặc Danh sách.</p>
        )}
        {editorMode === 'attributes' && !templateOwned && (
          <div className="space-y-2">
            {section.attributes.map((attribute) => <div key={attribute.id} className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 sm:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)_2.5rem]"><input aria-label="Tên thuộc tính" value={attribute.label} onChange={(event) => onUpdate({ attributes: section.attributes.map((item) => item.id === attribute.id ? { ...item, label: event.target.value } : item) })} placeholder="Tên thuộc tính" className="h-10 min-w-0 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500" /><input aria-label="Giá trị thuộc tính" value={attribute.value} onChange={(event) => onUpdate({ attributes: section.attributes.map((item) => item.id === attribute.id ? { ...item, value: event.target.value } : item) })} placeholder="Giá trị" className="col-start-1 row-start-2 h-10 min-w-0 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 sm:col-start-2 sm:row-start-1" /><button type="button" aria-label="Xóa thuộc tính" onClick={() => onUpdate({ attributes: section.attributes.filter((item) => item.id !== attribute.id) })} className="col-start-2 row-span-2 row-start-1 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 sm:col-start-3 sm:row-span-1"><X size={15} className="mx-auto" /></button></div>)}
            {section.attributes.length === 0 && <button type="button" onClick={() => onUpdate({ attributes: [{ id: draftId('attribute'), label: '', value: '' }] })} className="flex h-10 w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-brand-300 hover:text-brand-700"><Plus size={14} />Thêm thuộc tính đầu tiên</button>}
          </div>
        )}
      </div>
    </div>
  )
}

function ContentStep({ draft, onChange }: { draft: AdminAccessoryDraft; onChange: (next: AdminAccessoryDraft) => void }) {
  const [editorModeBySection, setEditorModeBySection] = useState<Record<string, ContentEditorMode>>({})
  const [activeSectionId, setActiveSectionId] = useState<string | null>(() => draft.sections[0]?.id ?? null)

  useEffect(() => {
    if (draft.sections.some((section) => section.id === activeSectionId)) return
    setActiveSectionId(draft.sections[0]?.id ?? null)
  }, [activeSectionId, draft.sections])

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
    setActiveSectionId(sectionId)
  }

  function updateSection(id: string, patch: Partial<DraftContentSection>) {
    onChange({ ...draft, sections: draft.sections.map((section) => section.id === id ? { ...section, ...patch } : section) })
  }

  function moveCustomSection(sectionId: string, direction: -1 | 1) {
    const customPositions = draft.sections.flatMap((section, index) => isTemplateSectionKey(section.id) ? [] : [index])
    const currentCustomIndex = customPositions.findIndex((index) => draft.sections[index].id === sectionId)
    const nextCustomIndex = currentCustomIndex + direction
    if (currentCustomIndex < 0 || nextCustomIndex < 0 || nextCustomIndex >= customPositions.length) return
    const currentIndex = customPositions[currentCustomIndex]
    const nextIndex = customPositions[nextCustomIndex]
    const sections = [...draft.sections]
    ;[sections[currentIndex], sections[nextIndex]] = [sections[nextIndex], sections[currentIndex]]
    onChange({ ...draft, sections })
  }

  function removeCustomSection(sectionId: string) {
    const nextSections = draft.sections.filter((section) => section.id !== sectionId)
    onChange({ ...draft, sections: nextSections })
    if (activeSectionId === sectionId) setActiveSectionId(nextSections[0]?.id ?? null)
  }

  const customSections = draft.sections.filter((section) => !isTemplateSectionKey(section.id))
  const activeSection = draft.sections.find((section) => section.id === activeSectionId) ?? draft.sections[0] ?? null

  function sectionLabel(section: DraftContentSection) {
    return section.title.trim() || 'Mục chưa đặt tên'
  }

  function customSectionActions(section: DraftContentSection) {
    const customIndex = customSections.findIndex((item) => item.id === section.id)
    return (
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" aria-label="Di chuyển nội dung lên" disabled={customIndex === 0} onClick={() => moveCustomSection(section.id, -1)} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-30"><ArrowUp size={14} />Lên</button>
        <button type="button" aria-label="Di chuyển nội dung xuống" disabled={customIndex === customSections.length - 1} onClick={() => moveCustomSection(section.id, 1)} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-30"><ArrowDown size={14} />Xuống</button>
        <button type="button" aria-label="Xóa nội dung" onClick={() => removeCustomSection(section.id)} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><Trash2 size={14} />Xóa</button>
      </div>
    )
  }

  function sectionForm(section: DraftContentSection) {
    const templateOwned = isTemplateSectionKey(section.id)
    const editorMode = editorModeBySection[section.id] ?? initialContentEditorMode(section)
    const hasOtherWarrantySection = draft.sections.some((item) => item.id !== section.id && item.type === 'WARRANTY')

    return (
      <div className="space-y-4">
        {!templateOwned && <div className="min-w-0"><span className={labelClass}>Mục hiển thị</span>
          {section.type === 'OTHER' ? (
            <div className="mt-1.5 flex h-10 overflow-hidden rounded-md border border-slate-200 bg-white transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
              <input autoFocus aria-label="Tên mục hiển thị" value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} placeholder="Nhập tên mục" className="min-w-0 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none" />
              <button type="button" aria-label="Quay lại danh sách mục có sẵn" title="Quay lại danh sách mục có sẵn" onClick={() => {
                const fallback = ACCESSORY_SECTION_TYPES[0]
                updateSection(section.id, {
                  type: fallback.value,
                  title: fallback.defaultTitle,
                  attributes: section.attributes.length > 0 ? section.attributes : [{ id: draftId('attribute'), label: '', value: '' }],
                })
                setEditorModeBySection((current) => ({ ...current, [section.id]: defaultContentEditorMode(fallback.value) }))
              }} className="grid w-10 shrink-0 place-items-center border-l border-slate-200 text-slate-400 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"><ChevronLeft size={15} /></button>
            </div>
          ) : (
            <select value={section.type} onChange={(event) => {
              const nextType = event.target.value as DraftContentSection['type']
              const nextDefinition = ACCESSORY_SECTION_TYPES.find((item) => item.value === nextType)
              const hasContent = Boolean(section.body.trim() || section.itemsText.trim() || section.attributes.some((attribute) => attribute.label.trim() || attribute.value.trim()))
              const attributes = nextType === 'TECHNICAL_SPECS' && section.attributes.length === 0 ? [{ id: draftId('attribute'), label: '', value: '' }] : section.attributes
              updateSection(section.id, { type: nextType, attributes, title: nextType === 'OTHER' ? '' : nextDefinition?.defaultTitle || section.title })
              if (!hasContent) setEditorModeBySection((current) => ({ ...current, [section.id]: defaultContentEditorMode(nextType) }))
            }} className={inputClass}>
              {ACCESSORY_SECTION_TYPES.map((type) => <option key={type.value} value={type.value} disabled={type.value === 'WARRANTY' && hasOtherWarrantySection}>{type.value === 'OTHER' ? 'Khác…' : `${type.label}${type.value === 'WARRANTY' && hasOtherWarrantySection ? ' (đã có)' : ''}`}</option>)}
            </select>
          )}
        </div>}

        <ContentSectionEditor
          section={section}
          editorMode={editorMode}
          templateOwned={templateOwned}
          onModeChange={(mode) => setEditorModeBySection((current) => ({ ...current, [section.id]: mode }))}
          onUpdate={(patch) => updateSection(section.id, patch)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><SectionHeading title="Nội dung & thông số" /><p className="mt-1 text-sm text-slate-500">Chọn một mục hiển thị để chỉnh sửa. Các phần theo mẫu giữ nhãn thống nhất.</p></div><Button type="button" onClick={addSection} size="sm" className="shrink-0 lg:hidden"><Plus size={15} className="mr-2" />Thêm mục hiển thị</Button></div>
      {draft.sections.length === 0 && <button type="button" onClick={addSection} className="flex min-h-48 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-slate-400 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700"><Layers3 className="h-9 w-9" /><span className="mt-3 text-sm font-bold">Thêm mục hiển thị đầu tiên</span></button>}

      {draft.sections.length > 0 && <div className="hidden overflow-hidden rounded-lg border border-slate-200 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-slate-50/70 p-3">
          <div className="space-y-1">
            {draft.sections.map((section) => {
              const selected = activeSection?.id === section.id
              const complete = isSectionComplete(section)
              return <button key={section.id} type="button" aria-pressed={selected} onClick={() => setActiveSectionId(section.id)} className={`flex min-h-12 w-full items-center gap-2 rounded-md px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/80 hover:text-slate-950'}`}><span className={`h-2 w-2 shrink-0 rounded-full ${complete ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{sectionLabel(section)}</span>{isTemplateSectionKey(section.id) && <span className="text-[10px] font-bold text-brand-700">MẪU</span>}</button>
            })}
          </div>
          <button type="button" onClick={addSection} className="mt-3 flex min-h-10 w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-xs font-bold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Plus size={14} />Thêm mục hiển thị</button>
        </aside>

        {activeSection && <article className="min-w-0 bg-white">
          <header className="flex min-h-14 items-center gap-3 border-b border-slate-200 px-5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{sectionLabel(activeSection)}</p>{isTemplateSectionKey(activeSection.id) && <p className="mt-0.5 text-[11px] font-semibold text-brand-700">Theo mẫu · {activeSection.title}</p>}</div>{!isTemplateSectionKey(activeSection.id) && customSectionActions(activeSection)}</header>
          <div className="p-5">{sectionForm(activeSection)}</div>
        </article>}
      </div>}

      {draft.sections.length > 0 && <div className="space-y-2 lg:hidden">
        {draft.sections.map((section) => {
          const selected = activeSection?.id === section.id
          const complete = isSectionComplete(section)
          const templateOwned = isTemplateSectionKey(section.id)
          return <article key={section.id} className={`rounded-lg border bg-white ${selected ? 'border-brand-300' : 'border-slate-200'}`}><div className="flex items-center"><button type="button" aria-expanded={selected} onClick={() => setActiveSectionId(section.id)} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-3 text-left transition active:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"><span className={`h-2 w-2 shrink-0 rounded-full ${complete ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{sectionLabel(section)}</span>{templateOwned && <span className="text-[10px] font-bold text-brand-700">MẪU</span>}<span aria-hidden="true" className={`text-slate-400 transition-transform ${selected ? 'rotate-180' : ''}`}>▾</span></button>{!templateOwned && customSectionActions(section)}</div><AnimatePresence initial={false}>{selected && <motion.div key="content" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} className="overflow-hidden"><div className="border-t border-slate-200 p-4">{sectionForm(section)}</div></motion.div>}</AnimatePresence></article>
        })}
      </div>}
    </div>
  )
}

function OptionsAndVariantsStep({
  draft,
  onChange,
  onConfirmDestructive,
}: {
  draft: AdminAccessoryDraft
  onChange: (next: AdminAccessoryDraft) => void
  onConfirmDestructive: (title: string, message: string, onConfirm: () => void, confirmLabel?: string) => void
}) {
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([])
  const [bulkOriginalPrice, setBulkOriginalPrice] = useState('')
  const [bulkSalePrice, setBulkSalePrice] = useState('')
  const [bulkImageUrls, setBulkImageUrls] = useState<string[]>([''])
  const [bulkEditingOpen, setBulkEditingOpen] = useState(false)
  const [optionEditingOpen, setOptionEditingOpen] = useState(false)
  const [issuesExpanded, setIssuesExpanded] = useState(false)
  const [activeOptionGroupId, setActiveOptionGroupId] = useState<string | null>(() => draft.optionGroups[0]?.id ?? null)
  const [activeVariantId, setActiveVariantId] = useState<string | null>(() => draft.variants[0]?.id ?? null)

  useEffect(() => {
    if (!draft.optionGroups.some((group) => group.id === activeOptionGroupId)) {
      setActiveOptionGroupId(draft.optionGroups[0]?.id ?? null)
    }
    if (!draft.variants.some((variant) => variant.id === activeVariantId)) {
      setActiveVariantId(draft.variants[0]?.id ?? null)
    }
    setSelectedVariantIds((current) => current.filter((id) => draft.variants.some((variant) => variant.id === id)))
  }, [activeOptionGroupId, activeVariantId, draft.optionGroups, draft.variants])

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
    setActiveOptionGroupId(groupId)
    setOptionEditingOpen(true)
  }

  function updateGroup(id: string, patch: Partial<DraftOptionGroup>) {
    onChange({ ...draft, optionGroups: draft.optionGroups.map((group) => group.id === id ? { ...group, ...patch } : group) })
  }

  function removeGroup(id: string) {
    onConfirmDestructive('Xóa nhóm tùy chọn?', 'Nhóm, giá trị và liên kết trong ma trận sẽ bị xóa khỏi bản mẫu.', () => {
      onChange({ ...draft, optionGroups: draft.optionGroups.filter((group) => group.id !== id), variants: draft.variants.map((variant) => { const selections = { ...variant.selections }; delete selections[id]; return { ...variant, selections } }) })
    })
  }

  function addValue(group: DraftOptionGroup) {
    updateGroup(group.id, { values: [...group.values, createDraftOptionValue(draftId('value'))] })
  }

  function applyPreset(group: DraftOptionGroup, presetCode: string) {
    const preset = ACCESSORY_OPTION_PRESETS.find((item) => item.code === presetCode)
    if (!preset) {
      updateGroup(group.id, { presetCode: '', code: '', name: '', displayType: 'BUTTON' })
      return
    }
    updateGroup(group.id, {
      presetCode: preset.code,
      code: preset.code,
      name: preset.name,
      displayType: preset.displayType,
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
  const stepIssues = validateAdminAccessoryDraft(draft).filter((issue) => issue.section === 'options' || issue.section === 'variants')
  const stepErrorCount = stepIssues.filter((issue) => issue.severity === 'error').length
  const stepWarningCount = stepIssues.filter((issue) => issue.severity === 'warning').length
  const primaryIssue = stepIssues.find((issue) => issue.severity === 'error') ?? stepIssues[0] ?? null

  function focusIssue(path: string) {
    const [collection, indexText] = path.split('.')
    const index = Number(indexText)
    const targetId = collection === 'optionGroups'
      ? draft.optionGroups[index] && `accessory-option-group-${draft.optionGroups[index].id}`
      : collection === 'variants'
        ? draft.variants[index] && 'accessory-variant-editor'
        : null
    if (!targetId) return
    if (collection === 'optionGroups' && draft.optionGroups[index]) {
      setActiveOptionGroupId(draft.optionGroups[index].id)
      setOptionEditingOpen(true)
    }
    if (collection === 'variants' && draft.variants[index]) setActiveVariantId(draft.variants[index].id)
    window.setTimeout(() => {
      const target = document.getElementById(targetId)
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const focusTarget = [...(target?.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)') ?? [])]
        .find((element) => element.offsetParent !== null)
      focusTarget?.focus()
    }, 120)
  }

  const includedVariants = draft.variants.filter((variant) => variant.isIncluded !== false)
  const duplicateSignatures = new Set(variantGroups(draft.optionGroups).length === 0 ? [] : includedVariants.filter((variant, index) => includedVariants.some((other, otherIndex) => otherIndex !== index && variantSignature(other, draft.optionGroups) === variantSignature(variant, draft.optionGroups))).map((variant) => variant.id))
  const activeOptionGroup = draft.optionGroups.find((group) => group.id === activeOptionGroupId) ?? draft.optionGroups[0] ?? null
  const activeVariant = draft.variants.find((variant) => variant.id === activeVariantId) ?? draft.variants[0] ?? null

  function variantComplete(variant: DraftVariant) {
    return variantIsComplete(variant, draft.optionGroups)
      && !duplicateSignatures.has(variant.id)
  }

  function applyBulkImageUrls() {
    const urls = nonEmptyUrls(bulkImageUrls)
    if (urls.length === 0 || selectedVariantIds.length === 0) return
    const selected = draft.variants.filter((variant) => selectedVariantIds.includes(variant.id))
    const apply = () => onChange({
      ...draft,
      variants: draft.variants.map((variant) => selectedVariantIds.includes(variant.id)
        ? { ...variant, imageUrls: [...urls] }
        : variant),
    })
    if (selected.some((variant) => nonEmptyUrls(variant.imageUrls).length > 0)) {
      onConfirmDestructive('Ghi đè ảnh SKU đã chọn?', 'Bộ ảnh hiện tại của ít nhất một SKU sẽ bị thay thế hoàn toàn.', apply, 'Ghi đè')
      return
    }
    apply()
  }

  function variantEditor(variant: DraftVariant) {
    return (
      <div className="space-y-4">
        <div className={`grid gap-4 sm:grid-cols-2 ${variant.sku.trim() ? 'lg:grid-cols-3' : ''}`}>
          {variant.sku.trim() && <div className={labelClass}><span>SKU</span><div aria-label="SKU" className={`${inputClass} flex items-center bg-slate-50 font-mono text-slate-500`}>{variant.sku}</div></div>}
          <label className={labelClass}>Giá niêm yết<input aria-label="Giá niêm yết" type="number" min="0" step="1000" value={variant.originalPrice} onChange={(event) => updateVariant(variant.id, { originalPrice: event.target.value })} className={inputClass} /></label>
          <label className={labelClass}>Giá khuyến mại<input aria-label="Giá khuyến mại" type="number" min="0" step="1000" value={variant.salePrice} onChange={(event) => updateVariant(variant.id, { salePrice: event.target.value })} className={inputClass} /></label>
        </div>
        {duplicateSignatures.has(variant.id) && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Tổ hợp tùy chọn đang bị trùng.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={variant.isIncluded !== false} onChange={(event) => updateVariant(variant.id, { isIncluded: event.target.checked })} className="h-4 w-4 accent-slate-900" />Đưa vào danh sách bán</label>
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700"><input type="checkbox" disabled={variant.isIncluded === false} checked={variant.isActive} onChange={(event) => updateVariant(variant.id, { isActive: event.target.checked })} className="h-4 w-4 accent-slate-900" />Đang hoạt động</label>
        </div>
        <p className="text-xs text-slate-500">Tồn kho khởi tạo: <span className="font-bold text-slate-700">0</span>. Giá là giá đầy đủ của SKU, không phải phần cộng thêm.</p>
        <div className="border-t border-slate-100 pt-4">
          <UrlEditor
            urls={variant.imageUrls.length > 0 ? variant.imageUrls : ['']}
            label="URL ảnh SKU"
            title="Hình ảnh SKU"
            description={variant.isIncluded === false ? 'SKU đã loại khỏi danh sách bán có thể để trống ảnh.' : 'SKU đưa vào bán cần ít nhất một URL ảnh trực tiếp. Có thể dùng cùng URL cho nhiều SKU.'}
            onChange={(imageUrls) => updateVariant(variant.id, { imageUrls })}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <>
        <div><SectionHeading title="Tùy chọn & biến thể" /><p className="mt-1 text-sm text-slate-500">Khai báo thuộc tính tạo SKU, sau đó nhập giá đầy đủ trên từng biến thể.</p></div>

        {primaryIssue && (
          <section className={`overflow-hidden rounded-lg border ${stepErrorCount > 0 ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}`} aria-label="Kiểm tra tùy chọn và biến thể">
            <div className="flex min-h-11 items-center gap-2 px-3">
              <AlertCircle size={15} className={`shrink-0 ${stepErrorCount > 0 ? 'text-red-600' : 'text-amber-600'}`} />
              <button type="button" onClick={() => focusIssue(primaryIssue.path)} className={`min-w-0 flex-1 truncate text-left text-xs transition active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${stepErrorCount > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                <span className="font-bold">{stepErrorCount > 0 ? `${stepErrorCount} lỗi cần sửa` : `${stepWarningCount} cảnh báo`}</span>
                <span className="ml-2 hidden font-medium sm:inline">{primaryIssue.message}</span>
              </button>
              <button type="button" aria-expanded={issuesExpanded} onClick={() => setIssuesExpanded((current) => !current)} className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold transition hover:bg-white/70 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${stepErrorCount > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                {issuesExpanded ? 'Thu gọn' : `Xem ${stepIssues.length} mục`}
              </button>
            </div>
            <AnimatePresence initial={false}>
              {issuesExpanded && (
                <motion.div key="option-issues" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden border-t border-current/10">
                  <div className="max-h-44 divide-y divide-slate-200/70 overflow-y-auto bg-white/60">
                    {stepIssues.map((issue, index) => (
                      <button key={`${issue.path}-${issue.code}-${index}`} type="button" onClick={() => focusIssue(issue.path)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition hover:bg-white active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                        <AlertCircle size={13} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{issue.message}</span>
                        <span className="hidden shrink-0 font-mono text-[10px] opacity-50 lg:inline">{issue.path}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">Thuộc tính tạo SKU</h3>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{draft.optionGroups.length} nhóm</span>
              {!optionEditingOpen && draft.optionGroups.length > 0
                ? draft.optionGroups.map((group) => {
                    const valueNames = group.values.map((value) => value.name || value.code).filter(Boolean)
                    return <span key={group.id} title={valueNames.join(', ')} className="max-w-52 truncate rounded-md bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600"><span className="text-slate-900">{group.name || 'Chưa đặt tên'}</span> · {valueNames.length} giá trị</span>
                  })
                : draft.optionGroups.length === 0 && <span className="text-xs text-slate-500">Một SKU mặc định, không có thuộc tính.</span>}
              <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-brand-700">{variantGroups(draft.optionGroups).length === 0 ? '1 SKU' : `${matrixSize} SKU`}</span>
            </div>
            <button type="button" aria-expanded={draft.optionGroups.length > 0 ? optionEditingOpen : undefined} onClick={() => draft.optionGroups.length === 0 ? addGroup() : setOptionEditingOpen((current) => !current)} className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-brand-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{draft.optionGroups.length === 0 ? 'Thêm thuộc tính' : optionEditingOpen ? 'Ẩn cấu hình' : 'Chỉnh sửa thuộc tính'}</button>
          </div>

          <AnimatePresence initial={false}>
            {optionEditingOpen && <motion.div key="option-editor" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} className="overflow-hidden border-t border-slate-200">
              <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
                <aside className="border-b border-slate-200 bg-slate-50/70 p-3 lg:border-b-0 lg:border-r">
                  {draft.optionGroups.length > 0 && <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-1 lg:overflow-visible">{draft.optionGroups.map((group) => { const selected = activeOptionGroup?.id === group.id; return <button key={group.id} type="button" aria-pressed={selected} onClick={() => setActiveOptionGroupId(group.id)} className={`flex min-h-12 min-w-48 items-center rounded-md px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:w-full lg:min-w-0 ${selected ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/80 hover:text-slate-950'}`}><span className="block truncate text-sm font-semibold">{group.name || 'Nhóm chưa đặt tên'}</span></button> })}</div>}
                  <button type="button" onClick={addGroup} className="mt-3 flex min-h-10 w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-xs font-bold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Plus size={14} />Thêm nhóm thuộc tính</button>
                </aside>
                <div className="min-w-0 bg-white">
        {(activeOptionGroup ? [activeOptionGroup] : []).map((group) => {
          const preset = ACCESSORY_OPTION_PRESETS.find((item) => item.code === group.presetCode)
          const addedCodes = new Set(group.values.map((value) => value.code))
          return (
            <article id={`accessory-option-group-${group.id}`} key={group.id}>
              <div className="flex min-h-12 flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"><input aria-label="Tên hiển thị" value={group.name} onChange={(event) => updateGroup(group.id, { name: event.target.value })} placeholder="Tên nhóm thuộc tính" className="h-8 w-full max-w-64 rounded-md border border-transparent bg-transparent px-2 text-sm font-bold text-slate-900 outline-none transition hover:border-slate-200 hover:bg-white focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100" /><span className="shrink-0 text-[11px] text-slate-500">{group.values.length} giá trị · Tạo biến thể SKU</span></div>
                <label className="flex shrink-0 items-center gap-1.5"><span className="text-[11px] font-bold text-slate-500">Mẫu</span>
                  <select aria-label="Mẫu thuộc tính" value={group.presetCode} onChange={(event) => applyPreset(group, event.target.value)} className="h-8 w-48 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                    <option value="">Tự tạo</option>
                    {ACCESSORY_OPTION_PRESETS.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.usageCount} lượt dùng</option>)}
                  </select>
                </label>
                <button type="button" aria-label="Xóa nhóm tùy chọn" onClick={() => removeGroup(group.id)} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><Trash2 size={14} />Xóa</button>
              </div>
              <div className="p-5">
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className={labelClass}>Kiểu hiển thị<select value={group.displayType} onChange={(event) => updateGroup(group.id, { displayType: event.target.value as DraftOptionGroup['displayType'] })} className={inputClass}><option value="BUTTON">Nút chọn</option><option value="SWATCH">Màu / swatch</option><option value="SELECT">Danh sách</option></select></label>
                  <label className="flex items-center gap-3 self-end rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"><input type="checkbox" checked={draftOptionGroupIsRequired(group)} onChange={(event) => updateGroup(group.id, { minimumSelections: event.target.checked ? 1 : 0 })} className="h-4 w-4 accent-slate-900" />Bắt buộc chọn</label>
                <details className="lg:col-span-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500">Thiết lập nâng cao</summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <label className={labelClass}>Mã nhóm<input value={group.code} onChange={(event) => updateGroup(group.id, { presetCode: '', code: accessoryAdminSlug(event.target.value).replaceAll('-', '_') })} placeholder="color" className={inputClass} /></label>
                  </div>
                </details>
                </div>
              </div>
              <div className="border-t border-slate-100 px-5 py-3">
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><h4 className="text-sm font-bold text-slate-800">Giá trị</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{group.values.length}</span></div><button type="button" onClick={() => addValue(group)} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-brand-700 shadow-sm transition hover:border-brand-400 hover:bg-brand-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Plus size={13} />Thêm giá trị</button></div>
                {preset && (
                  <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
                    <p className="text-xs font-bold text-brand-800">Gợi ý từ dữ liệu hiện tại</p>
                    <div className="mt-2 flex flex-wrap gap-2">{preset.suggestedValues.map((name) => { const code = accessoryAdminSlug(name); const added = addedCodes.has(code); return <button key={name} type="button" disabled={added} onClick={() => addSuggestedValue(group, name)} className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:border-brand-500 active:scale-[0.98] disabled:cursor-default disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700">{added ? '✓ ' : '+ '}{name}</button> })}</div>
                  </div>
                )}
                <div className="mt-2 space-y-1.5">
                  {group.values.map((value) => (
                    <div key={value.id} className={`grid items-start gap-2 rounded-md border border-slate-200 bg-slate-50/60 p-2 ${group.displayType === 'SWATCH' ? 'sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1.8fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.45fr)_auto]'}`}>
                      <input aria-label="Tên giá trị" value={value.name} onChange={(event) => { const name = event.target.value; updateGroup(group.id, { values: group.values.map((item) => item.id === value.id ? { ...item, name, code: accessoryAdminSlug(name) } : item) }) }} placeholder="Tên giá trị, ví dụ Xanh dương" className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                      {group.displayType === 'SWATCH' && <input aria-label="Mã màu" value={value.colorHex} onChange={(event) => updateGroup(group.id, { values: group.values.map((item) => item.id === value.id ? { ...item, colorHex: event.target.value } : item) })} placeholder="#0057B8" className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />}
                      {group.displayType === 'SWATCH'
                        ? <SwatchInput value={value.swatchUrl} onChange={(nextUrl) => updateGroup(group.id, { values: group.values.map((item) => item.id === value.id ? { ...item, swatchUrl: nextUrl } : item) })} />
                        : <details className="group/code"><summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-transparent px-3 text-xs font-semibold text-slate-500 transition hover:border-slate-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 [&::-webkit-details-marker]:hidden">Mã: {value.code || 'chưa có'}</summary><input aria-label="Mã giá trị" value={value.code} onChange={(event) => updateGroup(group.id, { values: group.values.map((item) => item.id === value.id ? { ...item, code: accessoryAdminSlug(event.target.value) } : item) })} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-3 text-xs outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></details>}
                      <button type="button" aria-label="Xóa giá trị" disabled={group.values.length <= 1} onClick={() => removeValue(group, value.id)} className="grid h-9 w-9 place-items-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-30"><X size={15} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          )
        })}
                </div>
              </div>
            </motion.div>}
          </AnimatePresence>
        </section>

        {matrixSize >= 100 && <div className={`rounded-lg border px-4 py-3 text-xs font-bold ${matrixSize > 500 ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{matrixSize > 500 ? 'Vượt giới hạn 500 tổ hợp của prototype.' : 'Ma trận lớn; hãy kiểm tra kỹ trước khi nhập dữ liệu.'}</div>}

        <div className="space-y-4 border-t border-slate-200 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div><h3 className="text-base font-bold text-slate-900">Danh sách SKU</h3><p className="mt-1 text-xs text-slate-500">Giá là giá đầy đủ của từng SKU, không phải phần cộng thêm.</p></div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">{draft.variants.length > 1 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{draft.variants.length} biến thể</span>}<span className="text-xs text-slate-400">Kho ban đầu: 0</span>{draft.variants.length === 1 && activeVariant && <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${activeVariant.isIncluded === false ? 'bg-slate-100 text-slate-500' : variantComplete(activeVariant) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{activeVariant.isIncluded === false ? 'Đã loại' : variantComplete(activeVariant) ? 'Hoàn tất' : 'Cần hoàn thiện'}</span>}{VARIANT_BULK_EDITING_ENABLED && draft.variants.length > 1 && <button type="button" aria-expanded={bulkEditingOpen} onClick={() => setBulkEditingOpen((current) => !current)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-brand-400 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{bulkEditingOpen ? 'Ẩn nhập nhanh' : 'Nhập nhanh hàng loạt'}</button>}</div>
          </div>

          {VARIANT_BULK_EDITING_ENABLED && draft.variants.length > 1 && bulkEditingOpen && <section className="rounded-lg border border-brand-200 bg-brand-50/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">Nhập nhanh cho biến thể đã chọn</p><p className="mt-1 text-xs text-slate-500">{selectedVariantIds.length > 0 ? `${selectedVariantIds.length} biến thể được chọn` : 'Chọn biến thể trong danh sách bên dưới.'}</p></div><div className="flex gap-2"><button type="button" onClick={() => setSelectedVariantIds(draft.variants.map((variant) => variant.id))} className="text-xs font-bold text-brand-700">Chọn tất cả</button><button type="button" disabled={selectedVariantIds.length === 0} onClick={() => setSelectedVariantIds([])} className="text-xs font-bold text-slate-500 disabled:opacity-40">Bỏ chọn</button></div></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className={labelClass}>Giá niêm yết chung<input type="number" min="0" step="1000" value={bulkOriginalPrice} onChange={(event) => setBulkOriginalPrice(event.target.value)} placeholder="Để trống nếu giữ nguyên" className={inputClass} /></label>
              <label className={labelClass}>Giá khuyến mại chung<input type="number" min="0" step="1000" value={bulkSalePrice} onChange={(event) => setBulkSalePrice(event.target.value)} placeholder="Để trống nếu giữ nguyên" className={inputClass} /></label>
            </div>
            <div className="mt-4 border-t border-brand-100 pt-4">
              <UrlEditor
                urls={bulkImageUrls}
                label="URL ảnh hàng loạt"
                title="Bộ ảnh áp dụng cho SKU đã chọn"
                description="Nhập một hoặc nhiều URL. Khi áp dụng, bộ ảnh sẽ thay thế toàn bộ ảnh hiện có của SKU được chọn."
                onChange={setBulkImageUrls}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><Button type="button" disabled={selectedVariantIds.length === 0} onClick={applyBulkValues} size="sm"><Copy size={14} className="mr-2" />Áp dụng giá</Button><Button type="button" disabled={selectedVariantIds.length === 0 || nonEmptyUrls(bulkImageUrls).length === 0} onClick={applyBulkImageUrls} size="sm"><ImageIcon size={14} className="mr-2" />Áp dụng ảnh cho SKU đã chọn</Button><Button type="button" variant="outline" disabled={selectedVariantIds.length === 0} onClick={() => setBulkActive(true)} size="sm">Bật hoạt động</Button><Button type="button" variant="outline" disabled={selectedVariantIds.length === 0} onClick={() => setBulkActive(false)} size="sm">Tắt hoạt động</Button><Button type="button" variant="outline" disabled={selectedVariantIds.length === 0} onClick={() => setBulkIncluded(true)} size="sm">Đưa vào bán</Button><Button type="button" variant="outline" disabled={selectedVariantIds.length === 0} onClick={() => setBulkIncluded(false)} size="sm">Loại khỏi bán</Button></div>
          </section>}

          <section id="accessory-variant-editor" className="space-y-3">
            {draft.variants.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-500">Chưa có biến thể. Hãy hoàn thiện nhóm tùy chọn để tạo ma trận SKU.</div> : <>
              <div className={`hidden overflow-hidden rounded-lg border border-slate-200 lg:grid ${draft.variants.length > 1 ? 'lg:grid-cols-[19rem_minmax(0,1fr)]' : 'lg:grid-cols-1'}`}>
                {draft.variants.length > 1 && <aside className="border-r border-slate-200 bg-slate-50/70">
                  <div className="flex min-h-11 items-center gap-2 border-b border-slate-200 px-3"><input type="checkbox" aria-label="Chọn tất cả biến thể" checked={draft.variants.length > 0 && selectedVariantIds.length === draft.variants.length} onChange={(event) => setSelectedVariantIds(event.target.checked ? draft.variants.map((variant) => variant.id) : [])} className="h-4 w-4 accent-slate-900" /><span className="text-xs font-bold text-slate-600">{selectedVariantIds.length}/{draft.variants.length} đã chọn</span></div>
                  <div className="max-h-[34rem] space-y-1 overflow-y-auto p-2">{draft.variants.map((variant, index) => { const selected = activeVariant?.id === variant.id; const complete = variantComplete(variant); return <div key={variant.id} className={`flex items-center rounded-md transition ${selected ? 'bg-white shadow-sm ring-1 ring-slate-200' : 'hover:bg-white/80'}`}><input type="checkbox" aria-label={`Chọn ${variant.name || `biến thể ${index + 1}`}`} checked={selectedVariantIds.includes(variant.id)} onChange={() => toggleVariantSelection(variant.id)} className="ml-3 h-4 w-4 shrink-0 accent-slate-900" /><button type="button" aria-pressed={selected} onClick={() => setActiveVariantId(variant.id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"><span className={`h-2 w-2 shrink-0 rounded-full ${variant.isIncluded === false ? 'bg-slate-300' : complete ? 'bg-emerald-500' : 'bg-amber-400'}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{variant.name || `Biến thể ${index + 1}`}</span>{variant.sku.trim() && <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-400">{variant.sku}</span>}</span></button></div> })}</div>
                </aside>}
                {activeVariant && <article className="min-w-0 bg-white">{draft.variants.length > 1 && <header className="flex min-h-12 items-center gap-3 border-b border-slate-200 px-5"><p className="min-w-0 flex-1 text-sm font-bold text-slate-900">Thông tin SKU</p><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${activeVariant.isIncluded === false ? 'bg-slate-100 text-slate-500' : variantComplete(activeVariant) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{activeVariant.isIncluded === false ? 'Đã loại' : variantComplete(activeVariant) ? 'Hoàn tất' : 'Cần hoàn thiện'}</span></header>}<div className="p-5">{variantEditor(activeVariant)}</div></article>}
              </div>

              <div className="space-y-2 lg:hidden">{draft.variants.map((variant, index) => { const selected = activeVariant?.id === variant.id; const complete = variantComplete(variant); return <article key={variant.id} className={`rounded-lg border bg-white ${selected ? 'border-brand-300' : 'border-slate-200'}`}><div className="flex items-center"><input type="checkbox" aria-label={`Chọn ${variant.name || `biến thể ${index + 1}`}`} checked={selectedVariantIds.includes(variant.id)} onChange={() => toggleVariantSelection(variant.id)} className="ml-3 h-4 w-4 shrink-0 accent-slate-900" /><button type="button" aria-expanded={selected} onClick={() => setActiveVariantId(variant.id)} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"><span className={`h-2 w-2 shrink-0 rounded-full ${variant.isIncluded === false ? 'bg-slate-300' : complete ? 'bg-emerald-500' : 'bg-amber-400'}`} /><span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{variant.name || `Biến thể ${index + 1}`}</span><span aria-hidden="true" className={`text-slate-400 transition-transform ${selected ? 'rotate-180' : ''}`}>▾</span></button></div><AnimatePresence initial={false}>{selected && <motion.div key="variant-content" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} className="overflow-hidden"><div className="border-t border-slate-200 p-4">{variantEditor(variant)}</div></motion.div>}</AnimatePresence></article> })}</div>
            </>}
          </section>
        </div>
      </>
    </div>
  )
}

function SwatchInput({
  value,
  onChange,
  onNotifyError,
}: {
  value: string
  onChange: (url: string) => void
  onNotifyError?: (message: string) => void
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const hasImage = Boolean(value.trim())

  useEffect(() => {
    if (!previewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewOpen])

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      {hasImage ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setPreviewOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setPreviewOpen(true)
            }
          }}
          title="Bấm để xem ảnh swatch phóng to"
          className="group relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 transition hover:border-brand-500 hover:ring-2 hover:ring-brand-100"
        >
          <img src={value.trim()} alt="Swatch" className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 transition group-hover:opacity-100">
            <Eye size={13} className="text-white" />
          </div>
        </div>
      ) : (
        <ImageUploadDropzone
          onUploadSuccess={(urls) => {
            if (urls[0]) onChange(urls[0])
          }}
          onError={onNotifyError}
        >
          {({ isUploading }) => (
            <div
              title={isUploading ? 'Đang tải ảnh...' : 'Bấm để chọn/tải ảnh swatch từ máy'}
              className={`group relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border transition ${
                isUploading
                  ? 'border-brand-500 bg-brand-50 shadow-inner'
                  : 'border-slate-200 bg-slate-50 hover:border-brand-500 hover:ring-2 hover:ring-brand-100'
              }`}
            >
              <ImageIcon
                size={15}
                className={`transition ${
                  isUploading ? 'text-brand-600 animate-pulse' : 'text-slate-400 group-hover:text-brand-600'
                }`}
              />
              {!isUploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 transition group-hover:opacity-100">
                  <Upload size={13} className="text-white" />
                </div>
              )}
            </div>
          )}
        </ImageUploadDropzone>
      )}

      <div className="relative flex min-w-0 flex-1 items-center">
        <input
          aria-label="URL swatch"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="URL swatch (dán URL hoặc bấm icon bên trái)"
          className={`h-9 min-w-0 w-full rounded-md border border-slate-200 bg-white pl-2.5 text-xs text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
            hasImage ? 'pr-8 font-mono text-[11px]' : 'pr-2.5'
          }`}
        />
        {hasImage && (
          <button
            type="button"
            title="Xóa URL swatch"
            onClick={() => onChange('')}
            className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {hasImage && (
        <ImageUploadDropzone
          compact
          label="Tải mới"
          onUploadSuccess={(urls) => {
            if (urls[0]) onChange(urls[0])
          }}
          onError={onNotifyError}
        />
      )}

      {/* Lightbox Preview Modal for Swatch */}
      <AnimatePresence>
        {previewOpen && hasImage && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Xem trước hình ảnh swatch"
            onClick={() => setPreviewOpen(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                aria-label="Đóng xem trước"
                className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-slate-800/80 text-white backdrop-blur-md transition hover:bg-red-600 focus-visible:outline-none"
              >
                <X size={16} />
              </button>
              <img
                src={value.trim()}
                alt="Xem trước ảnh swatch"
                className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

function UrlEditor({
  urls,
  label,
  title,
  description,
  header,
  onChange,
  onNotifyError,
}: {
  urls: string[]
  label: string
  title?: string
  description?: string
  header?: ReactNode
  onChange: (urls: string[]) => void
  onNotifyError?: (message: string) => void
}) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const completedCount = nonEmptyUrls(urls).length
  const hasHeadingContent = Boolean(header || title || description)
  const validUrls = useMemo(() => urls.map((u) => u.trim()).filter(Boolean), [urls])

  useEffect(() => {
    if (previewIndex === null || validUrls.length === 0) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewIndex(null)
      if (e.key === 'ArrowLeft' && validUrls.length > 1) {
        setPreviewIndex((current) =>
          current === null ? null : (current - 1 + validUrls.length) % validUrls.length,
        )
      }
      if (e.key === 'ArrowRight' && validUrls.length > 1) {
        setPreviewIndex((current) =>
          current === null ? null : (current + 1) % validUrls.length,
        )
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewIndex, validUrls.length])

  const handleUploadSuccess = (newUrls: string[]) => {
    if (newUrls.length === 0) return
    const currentValid = urls.filter((u) => u.trim() !== '')
    onChange([...currentValid, ...newUrls])
  }

  const handleSingleRowUploadSuccess = (index: number, newUrls: string[]) => {
    if (newUrls.length === 0) return
    const updated = [...urls]
    updated[index] = newUrls[0]
    if (newUrls.length > 1) {
      updated.push(...newUrls.slice(1))
    }
    onChange(updated)
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      const updated = [...urls]
      const [moved] = updated.splice(draggedIndex, 1)
      updated.splice(targetIndex, 0, moved)
      onChange(updated)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const activePreviewUrl =
    previewIndex !== null && validUrls[previewIndex] ? validUrls[previewIndex] : null

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {hasHeadingContent ? (
          <div className="min-w-48 flex-1">
            {header ?? (
              <>
                {title && <h3 className="text-sm font-bold text-slate-900">{title}</h3>}
                {description && (
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    {description} {urls.length > 1 && '(Kéo icon ⠿ để sắp xếp thứ tự)'}
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <span className="text-[11px] font-semibold text-slate-400">
            {completedCount}/{urls.length} ảnh đã nhập
          </span>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {hasHeadingContent && (
            <span className="text-[11px] font-semibold text-slate-400">
              {completedCount}/{urls.length} ảnh đã nhập
            </span>
          )}
          <ImageUploadDropzone
            compact
            label="Tải ảnh từ máy"
            onUploadSuccess={handleUploadSuccess}
            onError={onNotifyError}
          />
          <button
            type="button"
            disabled={urls.length >= 20}
            onClick={() => onChange([...urls, ''])}
            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-bold text-brand-700 shadow-sm transition hover:border-brand-400 hover:bg-brand-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={13} />
            Thêm ô URL
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {urls.map((url, index) => {
          const isDragging = draggedIndex === index
          const isDragOver = dragOverIndex === index
          const hasImage = Boolean(url.trim())

          return (
            <div
              key={index}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              className={`flex min-w-0 items-center gap-2 rounded-lg transition ${
                isDragging ? 'opacity-40 scale-[0.99]' : ''
              } ${
                isDragOver && !isDragging ? 'ring-2 ring-brand-500 bg-brand-50/30' : ''
              }`}
            >
              {/* Drag Handle */}
              <div
                draggable={urls.length > 1}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                title={urls.length > 1 ? 'Kéo thả để đổi vị trí thứ tự ảnh' : 'Cần ít nhất 2 ảnh để sắp xếp'}
                className={`flex h-9 w-6 shrink-0 items-center justify-center text-slate-400 transition ${
                  urls.length > 1
                    ? 'cursor-grab hover:text-slate-700 active:cursor-grabbing'
                    : 'cursor-not-allowed opacity-30'
                }`}
              >
                <GripVertical size={16} />
              </div>

              {/* Thumbnail: If hasImage -> Preview Modal on click; If empty -> Trigger file upload */}
              {hasImage ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    const idx = validUrls.indexOf(url.trim())
                    setPreviewIndex(idx !== -1 ? idx : 0)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      const idx = validUrls.indexOf(url.trim())
                      setPreviewIndex(idx !== -1 ? idx : 0)
                    }
                  }}
                  title="Bấm để xem ảnh phóng to"
                  className="group relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50 transition hover:border-brand-500 hover:ring-2 hover:ring-brand-100"
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 transition group-hover:opacity-100">
                    <Eye size={13} className="text-white" />
                  </div>
                </div>
              ) : (
                <ImageUploadDropzone
                  onUploadSuccess={(newUrls) => handleSingleRowUploadSuccess(index, newUrls)}
                  onError={onNotifyError}
                >
                  {({ isUploading }) => (
                    <div
                      title={isUploading ? 'Đang tải ảnh...' : 'Bấm để chọn/tải ảnh từ máy'}
                      className={`group relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border transition ${
                        isUploading
                          ? 'border-brand-500 bg-brand-50 shadow-inner'
                          : 'border-slate-200 bg-slate-50 hover:border-brand-500 hover:ring-2 hover:ring-brand-100'
                      }`}
                    >
                      <ImageIcon
                        size={15}
                        className={`transition ${
                          isUploading ? 'text-brand-600 animate-pulse' : 'text-slate-400 group-hover:text-brand-600'
                        }`}
                      />
                      {!isUploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 transition group-hover:opacity-100">
                          <Upload size={13} className="text-white" />
                        </div>
                      )}
                    </div>
                  )}
                </ImageUploadDropzone>
              )}

              {/* URL Input with embedded X clear button */}
              <div className="relative flex min-w-0 flex-1 items-center">
                <input
                  aria-label={`${label} ${index + 1}`}
                  value={url}
                  onChange={(event) =>
                    onChange(urls.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                  }
                  placeholder={hasImage ? `${label} ${index + 1}` : `${label} ${index + 1} (dán URL hoặc bấm icon bên trái)`}
                  className={`h-9 min-w-0 w-full rounded-md border border-slate-200 bg-white pl-2.5 text-xs text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${
                    hasImage ? 'pr-8 font-mono text-[11px]' : 'pr-2.5'
                  }`}
                />
                {hasImage && (
                  <button
                    type="button"
                    title="Xóa URL dòng này"
                    onClick={() => onChange(urls.map((item, itemIndex) => (itemIndex === index ? '' : item)))}
                    className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Delete row button */}
              <button
                type="button"
                aria-label={`Xóa dòng ${label.toLocaleLowerCase('vi-VN')} ${index + 1}`}
                disabled={urls.length <= 1}
                onClick={() => onChange(urls.filter((_, itemIndex) => itemIndex !== index))}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-25"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Lightbox Image Preview Modal with Gallery Navigation */}
      <AnimatePresence>
        {activePreviewUrl !== null && previewIndex !== null && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Xem trước hình ảnh"
            onClick={() => setPreviewIndex(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
          >
            {/* Left Chevron Button */}
            {validUrls.length > 1 && (
              <button
                type="button"
                aria-label="Ảnh trước"
                title="Ảnh trước (Phím ←)"
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewIndex((current) =>
                    current === null ? null : (current - 1 + validUrls.length) % validUrls.length,
                  )
                }}
                className="absolute left-4 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-slate-900/80 text-white shadow-lg backdrop-blur-md transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <ChevronLeft size={26} />
              </button>
            )}

            {/* Right Chevron Button */}
            {validUrls.length > 1 && (
              <button
                type="button"
                aria-label="Ảnh sau"
                title="Ảnh sau (Phím →)"
                onClick={(e) => {
                  e.stopPropagation()
                  setPreviewIndex((current) =>
                    current === null ? null : (current + 1) % validUrls.length,
                  )
                }}
                className="absolute right-4 top-1/2 z-20 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-slate-900/80 text-white shadow-lg backdrop-blur-md transition hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <ChevronRight size={26} />
              </button>
            )}

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setPreviewIndex(null)}
                aria-label="Đóng xem trước"
                className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-slate-800/80 text-white backdrop-blur-md transition hover:bg-red-600 focus-visible:outline-none"
              >
                <X size={16} />
              </button>

              {/* Counter Badge */}
              {validUrls.length > 1 && (
                <div className="absolute left-3 top-3 z-10 rounded-md bg-slate-800/80 px-2.5 py-1 text-xs font-semibold text-slate-200 backdrop-blur-md">
                  {previewIndex + 1} / {validUrls.length}
                </div>
              )}

              <img
                key={activePreviewUrl}
                src={activePreviewUrl}
                alt={`Xem trước ảnh ${previewIndex + 1}`}
                className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

type AccessoryEditorView = 'template' | 'edit' | 'preview'
type AccessorySectionId = 'classification' | 'general' | 'content' | 'commerce'
type AccessorySectionStatus = 'incomplete' | 'complete' | 'optional'

const ACCESSORY_EDITOR_SECTIONS: Array<{ id: AccessorySectionId; label: string }> = [
  { id: 'classification', label: 'Phân loại' },
  { id: 'general', label: 'Thông tin' },
  { id: 'content', label: 'Nội dung' },
  { id: 'commerce', label: 'Tùy chọn & biến thể' },
]

const accessorySectionStatusLabel: Record<AccessorySectionStatus, string> = {
  incomplete: 'Chưa hoàn tất',
  complete: 'Đã hoàn tất',
  optional: 'Không áp dụng',
}

function accessoryDraftWithRootCategory(rootCategoryId: string) {
  return { ...createAdminAccessoryDraft(), rootCategoryId }
}

function cloneAccessoryDraft(draft: AdminAccessoryDraft) {
  return JSON.parse(JSON.stringify(draft)) as AdminAccessoryDraft
}

async function persistenceResponseError(response: Response) {
  const body: unknown = await response.json().catch(() => null)
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const error = (body as Record<string, unknown>).error
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message
      if (typeof message === 'string') return message
    }
  }
  return 'Không thể lưu sản phẩm phụ kiện.'
}

export function AccessoryProductCreateDialog({
  open,
  rootCategoryId,
  serviceLabels,
  onClose,
  onChangeType,
  onDirtyChange,
  onSaved,
  onNotify,
  onConfirmDestructive,
  onAfterExit,
  initialDraft,
  productId,
  expectedUpdatedAt,
}: {
  open: boolean
  rootCategoryId: string
  serviceLabels: CatalogServiceLabel[]
  onClose: () => void
  onChangeType: () => void
  onDirtyChange: (dirty: boolean) => void
  onSaved: (result: AdminAccessorySaveResult) => void
  onNotify: (kind: ToastKind, title: string, message?: string) => void
  onConfirmDestructive: (title: string, message: string, onConfirm: () => void, confirmLabel?: string) => void
  onAfterExit: () => void
  initialDraft?: AdminAccessoryDraft
  productId?: string
  expectedUpdatedAt?: string
}) {
  const isEditing = Boolean(productId && initialDraft && expectedUpdatedAt)
  const [draft, setDraft] = useState<AdminAccessoryDraft>(() => initialDraft
    ? cloneAccessoryDraft(initialDraft)
    : accessoryDraftWithRootCategory(rootCategoryId))
  const [view, setView] = useState<AccessoryEditorView>(() => initialDraft ? 'edit' : 'template')
  const [templateCandidate, setTemplateCandidate] = useState<AccessoryTemplateCode | null>(() => initialDraft?.templateCode ?? null)
  const [templateCommitted, setTemplateCommitted] = useState(Boolean(initialDraft))
  const [pendingSuggestedCategoryTemplate, setPendingSuggestedCategoryTemplate] = useState<AccessoryTemplateCode | null>(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [reviewDecisionOpen, setReviewDecisionOpen] = useState(false)
  const [taxonomyCollections, setTaxonomyCollections] = useState<DraftCollection[]>([])
  const [taxonomyLoading, setTaxonomyLoading] = useState(false)
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null)
  const [taxonomyReloadKey, setTaxonomyReloadKey] = useState(0)
  const [hasLocalDraft, setHasLocalDraft] = useState(false)
  const [saving, setSaving] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const reviewTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    setDraft(initialDraft ? cloneAccessoryDraft(initialDraft) : accessoryDraftWithRootCategory(rootCategoryId))
    setView(initialDraft ? 'edit' : 'template')
    setTemplateCandidate(initialDraft?.templateCode ?? null)
    setTemplateCommitted(Boolean(initialDraft))
    setPendingSuggestedCategoryTemplate(null)
    setSlugEdited(Boolean(initialDraft))
    setReviewDecisionOpen(false)
    setSaving(false)
  }, [expectedUpdatedAt, open, productId, rootCategoryId])

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
          const categoryAssignments = current.categoryAssignments.flatMap((assignment) => {
            const category = accessoryCategoryCollections(collections).find((collection) => (
              collection.id === assignment.categoryId || collection.slug === assignment.categoryId
            ))
            if (!category) return []
            const models = accessoryModelCollectionsForCategory(collections, category.id)
            const modelIds = assignment.modelIds.flatMap((modelId) => {
              const model = models.find((item) => item.id === modelId || item.slug === modelId)
              return model ? [model.id] : []
            })
            return [{
              categoryId: category.id,
              compatibilityMode: models.length === 0
                ? 'NOT_APPLICABLE' as const
                : assignment.compatibilityMode === 'NOT_APPLICABLE'
                  ? null
                  : assignment.compatibilityMode,
              modelIds,
            }]
          })
          return JSON.stringify(categoryAssignments) === JSON.stringify(current.categoryAssignments)
            ? current
            : { ...current, categoryAssignments }
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
    setHasLocalDraft(!isEditing && Boolean(window.sessionStorage.getItem(ADMIN_ACCESSORY_SESSION_KEY)))
  }, [isEditing, open])

  useEffect(() => {
    if (!open || !pendingSuggestedCategoryTemplate || taxonomyCollections.length === 0) return
    setDraft((current) => applyAccessoryTemplateCategoryDefaults(
      current,
      taxonomyCollections,
      pendingSuggestedCategoryTemplate,
    ))
    setPendingSuggestedCategoryTemplate(null)
  }, [open, pendingSuggestedCategoryTemplate, taxonomyCollections])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => closeRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !reviewDecisionOpen && !saving) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open, reviewDecisionOpen, saving])

  useEffect(() => {
    const baseline = initialDraft ? initialDraft : accessoryDraftWithRootCategory(rootCategoryId)
    onDirtyChange(JSON.stringify(draft) !== JSON.stringify(baseline))
  }, [draft, initialDraft, onDirtyChange, rootCategoryId])

  const validationIssues = useMemo(() => validateAdminAccessoryDraft(draft), [draft])
  const activeTemplate = accessoryTemplate(draft.templateCode)
  const templateSelectionChanges = templateCommitted
    && templateCandidate !== null
    && templateCandidate !== draft.templateCode
  const optionErrors = validationIssues.filter((issue) => issue.section === 'options' && issue.severity === 'error')
  const variantErrors = validationIssues.filter((issue) => issue.section === 'variants' && issue.severity === 'error')
  const commerceComplete = optionErrors.length === 0 && variantErrors.length === 0
  const classificationValid = draft.categoryAssignments.length > 0 && draft.categoryAssignments.every((assignment) => {
    const category = accessoryCategoryCollections(taxonomyCollections)
      .find((collection) => collection.id === assignment.categoryId)
    if (!category || !assignment.compatibilityMode) return false
    const models = accessoryModelCollectionsForCategory(taxonomyCollections, category.id)
    if (models.length === 0) return assignment.compatibilityMode === 'NOT_APPLICABLE' && assignment.modelIds.length === 0
    if (assignment.compatibilityMode === 'ALL_MODELS') return assignment.modelIds.length === 0
    return assignment.compatibilityMode === 'SELECTED_MODELS' && assignment.modelIds.length > 0
  })
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
    setDraft(initialDraft ? cloneAccessoryDraft(initialDraft) : accessoryDraftWithRootCategory(rootCategoryId))
    setView(initialDraft ? 'edit' : 'template')
    setTemplateCandidate(initialDraft?.templateCode ?? null)
    setTemplateCommitted(Boolean(initialDraft))
    setPendingSuggestedCategoryTemplate(null)
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
      const restoredDraft = restoreAdminAccessoryDraft(serialized, rootCategoryId)
      setDraft(restoredDraft)
      setTemplateCandidate(restoredDraft.templateCode)
      setTemplateCommitted(true)
      setPendingSuggestedCategoryTemplate(null)
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

  function returnToTemplateSelection() {
    setTemplateCandidate(draft.templateCode)
    setView('template')
  }

  function confirmTemplateSelection() {
    if (!templateCandidate) return
    if (draft.categoryAssignments.length === 0) {
      setPendingSuggestedCategoryTemplate(templateCandidate)
    }
    setDraft((current) => templateCandidate === current.templateCode && templateCommitted
      ? current
      : applyAccessoryTemplateToDraft(current, templateCandidate))
    setTemplateCommitted(true)
    setView('edit')
  }

  async function persistReview() {
    if (saving) return
    const nextDraft = { ...draft, isActive: isEditing ? draft.isActive : true }
    setDraft(nextDraft)
    setSaving(true)
    try {
      const payload = adminAccessoryDraftToWriteRequest(
        nextDraft,
        taxonomyCollections,
        isEditing ? expectedUpdatedAt : undefined,
      )
      const response = await fetch(productId
        ? `/api/v1/admin/products/${encodeURIComponent(productId)}`
        : '/api/v1/admin/products', {
        method: productId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(await persistenceResponseError(response))
      const body: unknown = await response.json()
      const result = body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).data
        : null
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('Kết quả lưu sản phẩm không hợp lệ.')
      }
      const saved = result as Record<string, unknown>
      if (typeof saved.id !== 'string' || typeof saved.updatedAt !== 'string' || typeof saved.isActive !== 'boolean') {
        throw new Error('Kết quả lưu sản phẩm không hợp lệ.')
      }
      if (!isEditing) window.sessionStorage.removeItem(ADMIN_ACCESSORY_SESSION_KEY)
      setReviewDecisionOpen(false)
      onSaved({
        id: saved.id,
        productType: 'ACCESSORY',
        isActive: saved.isActive,
        updatedAt: saved.updatedAt,
      })
    } catch (error) {
      onNotify(
        'error',
        isEditing ? 'Cập nhật phụ kiện thất bại' : 'Tạo phụ kiện thất bại',
        error instanceof Error ? error.message : undefined,
      )
    } finally {
      setSaving(false)
    }
  }

  function statusForSection(sectionId: AccessorySectionId): AccessorySectionStatus {
    if (sectionId === 'classification') return classificationValid ? 'complete' : 'incomplete'
    if (sectionId === 'general') return draft.name.trim() && draft.slug.trim() && draft.description.trim() ? 'complete' : 'incomplete'
    if (sectionId === 'content') {
      const customSections = draft.sections.filter((section) => !isTemplateSectionKey(section.id))
      return customSections.length === 0 ? 'optional' : customSections.every(isSectionComplete) ? 'complete' : 'incomplete'
    }
    return commerceComplete ? 'complete' : 'incomplete'
  }

  function scrollToSection(sectionId: AccessorySectionId) {
    document.getElementById(`accessory-editor-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const reviewBlockers = useMemo<ProductReviewBlocker[]>(() => {
    const blockers: ProductReviewBlocker[] = []
    if (!classificationValid) blockers.push({ stepLabel: 'Phân loại', message: 'Chọn ít nhất một danh mục và xác nhận phạm vi tương thích dòng xe.' })
    if (!draft.name.trim() || !draft.slug.trim() || !draft.description.trim()) blockers.push({ stepLabel: 'Thông tin', message: 'Cần nhập tên, đường dẫn và mô tả sản phẩm.' })
    if (draft.sections.some((section) => !isTemplateSectionKey(section.id) && !isSectionComplete(section))) blockers.push({ stepLabel: 'Nội dung', message: 'Có mục hiển thị tự thêm chưa hoàn chỉnh.' })
    optionErrors.slice(0, 3).forEach((issue) => blockers.push({ stepLabel: 'Tùy chọn', message: issue.message }))
    variantErrors.slice(0, 3).forEach((issue) => blockers.push({ stepLabel: 'Biến thể', message: issue.message }))
    return blockers
  }, [classificationValid, draft.description, draft.name, draft.sections, draft.slug, optionErrors, variantErrors])

  return (
    <AnimatePresence onExitComplete={() => {
      reset()
      onAfterExit()
    }}>
      {open && (
        <motion.div className="fixed inset-0 z-50 !m-0 flex overscroll-none bg-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby="create-accessory-title" className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
            <header className="flex items-center gap-4 border-b border-slate-200 px-4 py-3 sm:px-6"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-white"><PackagePlus size={19} /></div><div className="min-w-0 flex-1"><h2 id="create-accessory-title" className="text-lg font-bold text-slate-950">{isEditing ? 'Sửa sản phẩm · Phụ kiện' : 'Thêm sản phẩm · Phụ kiện'}</h2><p className="text-xs text-slate-500">{isEditing ? 'Đang chỉnh sửa dữ liệu hiện có' : 'Sẽ ghi đồng bộ sản phẩm, SKU và quan hệ'}</p></div>{!isEditing && <button type="button" onClick={onChangeType} disabled={saving} className="hidden rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 sm:inline-flex">Đổi loại</button>}<button ref={closeRef} type="button" onClick={onClose} disabled={saving} aria-label="Đóng" className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"><X size={20} /></button></header>

            <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/60">
              <AnimatePresence mode="wait" initial={false}>
                {view === 'template' ? (
                  <motion.div key="template" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>
                    <TemplateSelectionStep selectedCode={templateCandidate} currentCode={draft.templateCode} revisiting={templateCommitted} onSelect={setTemplateCandidate} />
                  </motion.div>
                ) : view === 'edit' ? (
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

                      <div className="min-w-0 flex-1 space-y-4 p-4 sm:p-5 lg:p-6">
                        <section className="flex flex-col gap-3 rounded-lg border border-brand-200 bg-brand-50/60 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                          <div><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Mẫu nhập đang dùng</p><p className="mt-1 text-sm font-bold text-slate-900">{activeTemplate?.label ?? draft.templateCode}</p></div>
                          <Button type="button" variant="outline" disabled={saving} onClick={returnToTemplateSelection}><ChevronLeft size={16} className="mr-2" />Quay lại bước chọn mẫu</Button>
                        </section>
                        <section id="accessory-editor-classification" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><ClassificationStep draft={draft} collections={taxonomyCollections} taxonomyLoading={taxonomyLoading} taxonomyError={taxonomyError} onRetryTaxonomy={() => setTaxonomyReloadKey((value) => value + 1)} onChange={setDraft} onConfirmDestructive={onConfirmDestructive} /></section>
                        <section id="accessory-editor-general" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><GeneralStep draft={draft} serviceLabels={serviceLabels} slugEdited={slugEdited} onSlugEdited={() => setSlugEdited(true)} onChange={setDraft} /></section>
                        <section id="accessory-editor-content" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><ContentStep draft={draft} onChange={setDraft} /></section>
                        <section id="accessory-editor-commerce" className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                          <OptionsAndVariantsStep draft={draft} onChange={setDraft} onConfirmDestructive={onConfirmDestructive} />
                        </section>
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
              <div className="min-w-0 flex-1">{view === 'template' ? (templateCommitted ? <Button type="button" variant="outline" disabled={saving} onClick={() => { setTemplateCandidate(draft.templateCode); setView('edit') }}><ChevronLeft size={16} className="mr-2" />Quay lại form</Button> : <button type="button" onClick={onChangeType} disabled={saving} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50">Đổi loại sản phẩm</button>) : view === 'preview' ? <Button type="button" variant="outline" disabled={saving} onClick={() => setView('edit')}><ChevronLeft size={16} className="mr-2" />Quay lại chỉnh sửa</Button> : !isEditing ? <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onChangeType} disabled={saving} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50 sm:hidden">Đổi loại</button><Button type="button" variant="outline" disabled={saving} onClick={() => saveLocalDraft()}><Save size={15} className="mr-2" />Lưu cục bộ</Button><Button type="button" variant="outline" disabled={!hasLocalDraft || saving} onClick={restoreLocalDraft}><RotateCcw size={15} className="mr-2" />Khôi phục</Button>{hasLocalDraft && <button type="button" disabled={saving} onClick={clearLocalDraft} className="px-2 py-2 text-xs font-semibold text-slate-500 transition hover:text-red-600 disabled:opacity-50">Xóa nháp</button>}</div> : <span className="text-xs font-semibold text-slate-500">Mọi thay đổi sẽ được kiểm tra lại trước khi lưu.</span>}</div>
              {view !== 'template' && <span className="hidden text-xs font-semibold text-slate-500 md:inline">{reviewBlockers.length === 0 ? 'Đã đủ thông tin bắt buộc' : `Còn ${reviewBlockers.length} mục trước khi hiển thị`}</span>}
              {view === 'template' ? <Button type="button" disabled={!templateCandidate || saving} onClick={confirmTemplateSelection}>{templateSelectionChanges ? 'Áp dụng và tiếp tục' : 'Tiếp tục'}</Button> : view === 'preview' ? <button ref={reviewTriggerRef} type="button" disabled={saving} onClick={() => setReviewDecisionOpen(true)} className="inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50"><Check size={16} className="mr-2" />{isEditing ? 'Lưu' : 'Duyệt'}</button> : <Button type="button" disabled={saving} onClick={() => setView('preview')}><Eye size={16} className="mr-2" />Xem trước</Button>}
            </footer>

            <ProductReviewDecisionDialog
              open={reviewDecisionOpen}
              blockers={reviewBlockers}
              triggerRef={reviewTriggerRef}
              onClose={() => { if (!saving) setReviewDecisionOpen(false) }}
              onSaveDraft={isEditing ? undefined : () => {
                saveLocalDraft()
                setReviewDecisionOpen(false)
              }}
              onPublish={() => void persistReview()}
              mode={isEditing ? 'edit' : 'create'}
              saving={saving}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
