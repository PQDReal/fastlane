'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, Save, Trash2, X, AlertCircle, Plus, ChevronDown, ChevronUp, Image as ImageIcon, AlignLeft, CheckCircle } from 'lucide-react'

import { CarProductPreview } from '@/components/admin/car-product-preview'
import { Button } from '@/components/ui/button'
import type { ToastKind } from '@/components/ui/toast'
import {
  accessoryCategoryCollections,
  accessoryAdminSlug,
  accessoryModelCollectionsForCategory,
  createAdminAccessoryDraft,
  type AdminAccessoryDraft,
  type DraftCollection,
  type DraftVariant,
  type DraftContentSection,
} from '@/lib/catalog/admin-accessory-draft'
import type { CatalogAccessoryContentSectionType } from '@/lib/catalog/types'
import {
  ADMIN_CAR_SESSION_KEY,
  restoreAdminCarDraft,
  serializeAdminCarDraft,
} from '@/lib/catalog/admin-car-session'
import type { AdminAccessorySaveResult } from '@/lib/catalog/admin-accessory-write'
import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'
import { adminAccessoryDraftToWriteRequest } from '@/lib/catalog/admin-accessory-write'

const inputClass = 'mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'
const textareaClass = 'mt-1.5 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
const labelClass = 'block text-sm font-semibold text-slate-700'

function draftId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function SectionHeading({ title }: { title: string }) {
  return <h3 className="text-lg font-bold text-slate-950">{title}</h3>
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
      <SectionHeading title="Phân loại ô tô điện" />
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
          <legend className="text-sm font-semibold text-slate-700">Danh mục ô tô điện chính <span className="text-red-500">*</span></legend>
          <div className="mt-2 grid gap-2">
            {categories.map((collection) => {
              const selected = draft.primaryCollectionSlug === collection.slug
              return <button key={collection.id} type="button" aria-pressed={selected} onClick={() => selectCategory(collection.slug)} className={`flex min-h-11 items-center justify-between rounded-md border px-4 text-left text-sm font-semibold transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-100' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}><span>{collection.name}</span>{selected && <Check size={16} />}</button>
            })}
            {categories.length === 0 && <p className="border border-dashed border-slate-200 p-4 text-sm text-slate-500">Chưa có danh mục hoạt động.</p>}
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
  slugEdited,
  onSlugEdited,
  onChange,
}: {
  draft: AdminAccessoryDraft
  slugEdited: boolean
  onSlugEdited: () => void
  onChange: (next: AdminAccessoryDraft) => void
}) {
  return (
    <div className="space-y-6">
      <SectionHeading title="Thông tin chung" />
      <div className="grid gap-5 lg:grid-cols-2">
        <label className={labelClass}>Tên ô tô điện <span className="text-red-500">*</span>
          <input value={draft.name} maxLength={200} onChange={(event) => onChange({ ...draft, name: event.target.value, slug: slugEdited ? draft.slug : accessoryAdminSlug(event.target.value) })} placeholder="Ví dụ: VinFast VF 8" className={inputClass} />
        </label>
        <label className={labelClass}>Đường dẫn <span className="text-red-500">*</span>
          <input value={draft.slug} maxLength={220} onChange={(event) => { onSlugEdited(); onChange({ ...draft, slug: accessoryAdminSlug(event.target.value) }) }} placeholder="vinfast-vf-8" className={inputClass} />
        </label>
      </div>
      <label className={labelClass}>Mô tả ngắn
        <textarea value={draft.description} maxLength={1000} rows={4} onChange={(event) => onChange({ ...draft, description: event.target.value })} placeholder="Mô tả ngắn gọn về xe." className={textareaClass} />
      </label>
      <label className={labelClass}>URL Hình ảnh đại diện
        <input value={draft.productImageUrls[0] || ''} onChange={(event) => onChange({ ...draft, productImageUrls: [event.target.value] })} placeholder="https://example.com/image.jpg" className={inputClass} />
      </label>
    </div>
  )
}

function LandingPageStep({ draft, onChange }: { draft: AdminAccessoryDraft; onChange: (next: AdminAccessoryDraft) => void }) {
  function addBlock(type: CatalogAccessoryContentSectionType, defaultTitle: string) {
    onChange({
      ...draft,
      sections: [...draft.sections, {
        id: draftId('section'),
        type,
        title: defaultTitle,
        body: '',
        itemsText: '',
        attributes: []
      }]
    })
  }

  function updateBlock(id: string, patch: Partial<DraftContentSection>) {
    onChange({ ...draft, sections: draft.sections.map(s => s.id === id ? { ...s, ...patch } : s) })
  }

  function removeBlock(id: string) {
    onChange({ ...draft, sections: draft.sections.filter(s => s.id !== id) })
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= draft.sections.length) return
    const newSections = [...draft.sections]
    const temp = newSections[index]
    newSections[index] = newSections[newIndex]
    newSections[newIndex] = temp
    onChange({ ...draft, sections: newSections })
  }

  return (
    <div className="space-y-6">
      <SectionHeading title="Thiết kế Landing Page" />
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap gap-2">
        <Button type="button" onClick={() => addBlock('CAR_HERO', 'Khám phá kỷ nguyên mới')} size="sm" variant="outline" className="bg-white"><ImageIcon className="mr-2" size={16}/> Hero Banner</Button>
        <Button type="button" onClick={() => addBlock('CAR_FEATURE_SPLIT', 'Đặc điểm nổi bật')} size="sm" variant="outline" className="bg-white"><AlignLeft className="mr-2" size={16}/> Feature Split</Button>
        <Button type="button" onClick={() => addBlock('TECHNICAL_SPECS', 'Thông số kỹ thuật')} size="sm" variant="outline" className="bg-white"><CheckCircle className="mr-2" size={16}/> Tech Specs</Button>
        <Button type="button" onClick={() => addBlock('CAR_GALLERY', 'Thư viện ảnh')} size="sm" variant="outline" className="bg-white"><ImageIcon className="mr-2" size={16}/> Gallery</Button>
      </div>

      <div className="space-y-4">
        {draft.sections.length === 0 && <div className="text-center py-10 border border-dashed border-slate-300 rounded-lg text-slate-500">Chưa có khối nội dung nào. Hãy chọn một loại bên trên để thêm.</div>}
        {draft.sections.map((section, index) => (
          <div key={section.id} className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm relative group">
            <div className="flex items-center justify-between bg-slate-100 p-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-700 ml-2">{section.type === 'CAR_HERO' ? 'Hero Banner' : section.type === 'CAR_FEATURE_SPLIT' ? 'Feature Split' : section.type === 'TECHNICAL_SPECS' ? 'Tech Specs' : section.type === 'CAR_GALLERY' ? 'Gallery' : section.title || 'Block'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronUp size={16}/></button>
                <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === draft.sections.length - 1} className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronDown size={16}/></button>
                <button type="button" onClick={() => removeBlock(section.id)} className="p-1.5 text-slate-400 hover:text-red-500 ml-2"><Trash2 size={16}/></button>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <label className={labelClass}>Tiêu đề khối
                <input value={section.title} onChange={(e) => updateBlock(section.id, { title: e.target.value })} className={inputClass} />
              </label>

              {section.type === 'CAR_HERO' && (
                <>
                  <label className={labelClass}>Tiêu đề phụ / Slogan
                    <input value={section.body} onChange={(e) => updateBlock(section.id, { body: e.target.value })} className={inputClass} placeholder="Mạnh mẽ, thông minh..." />
                  </label>
                  <label className={labelClass}>URL Ảnh/Video Nền
                    <input value={section.itemsText} onChange={(e) => updateBlock(section.id, { itemsText: e.target.value })} className={inputClass} placeholder="https://..." />
                  </label>
                </>
              )}

              {section.type === 'CAR_FEATURE_SPLIT' && (
                <>
                  <label className={labelClass}>Nội dung mô tả
                    <textarea value={section.body} rows={3} onChange={(e) => updateBlock(section.id, { body: e.target.value })} className={textareaClass} />
                  </label>
                  <label className={labelClass}>URL Hình ảnh minh họa
                    <input value={section.itemsText} onChange={(e) => updateBlock(section.id, { itemsText: e.target.value })} className={inputClass} placeholder="https://..." />
                  </label>
                </>
              )}

              {section.type === 'CAR_GALLERY' && (
                <>
                  <label className={labelClass}>Danh sách URL Hình ảnh (mỗi dòng 1 link)
                    <textarea value={section.itemsText} rows={4} onChange={(e) => updateBlock(section.id, { itemsText: e.target.value })} className={textareaClass} placeholder="https://...&#10;https://..." />
                  </label>
                </>
              )}

              {section.type === 'TECHNICAL_SPECS' && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-sm font-semibold text-slate-700">Các thông số</span>
                      <button type="button" onClick={() => updateBlock(section.id, { attributes: [...section.attributes, { id: draftId('attr'), label: '', value: '' }] })} className="text-xs text-brand-600 font-bold flex items-center gap-1 hover:underline"><Plus size={14}/> Thêm thông số</button>
                    </div>
                    {section.attributes.map((attr) => (
                      <div key={attr.id} className="flex gap-2 items-center">
                        <input value={attr.label} onChange={(e) => updateBlock(section.id, { attributes: section.attributes.map(a => a.id === attr.id ? { ...a, label: e.target.value } : a) })} className={inputClass + ' flex-1'} placeholder="Tên (VD: Động cơ)" />
                        <input value={attr.value} onChange={(e) => updateBlock(section.id, { attributes: section.attributes.map(a => a.id === attr.id ? { ...a, value: e.target.value } : a) })} className={inputClass + ' flex-1'} placeholder="Giá trị (VD: 300kW)" />
                        <button type="button" onClick={() => updateBlock(section.id, { attributes: section.attributes.filter(a => a.id !== attr.id) })} className="mt-1.5 p-2 text-slate-400 hover:text-red-500 rounded"><X size={16}/></button>
                      </div>
                    ))}
                    {section.attributes.length === 0 && <p className="text-xs text-slate-500 mt-2">Chưa có thông số nào.</p>}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VariantStep({ draft, onChange }: { draft: AdminAccessoryDraft; onChange: (next: AdminAccessoryDraft) => void }) {
  function addVariant() {
    onChange({
      ...draft,
      variants: [...draft.variants, { id: draftId('variant'), name: '', sku: '', originalPrice: '', salePrice: '', isActive: true, isIncluded: true, selections: {}, imageUrls: [] }],
    })
  }

  function updateVariant(id: string, patch: Partial<DraftVariant>) {
    onChange({ ...draft, variants: draft.variants.map((v) => v.id === id ? { ...v, ...patch } : v) })
  }

  function removeVariant(id: string) {
    if (draft.variants.length <= 1) return
    onChange({ ...draft, variants: draft.variants.filter((v) => v.id !== id) })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center"><SectionHeading title="Phiên bản xe" />
      <Button type="button" onClick={addVariant} size="sm" variant="outline">Thêm phiên bản</Button></div>
      <div className="space-y-4">
        {draft.variants.map((variant, index) => (
          <div key={variant.id} className="p-4 border border-slate-200 rounded-lg bg-white relative">
            <h4 className="font-bold text-slate-700 mb-4">Phiên bản {index + 1}</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Tên phiên bản
                <input value={variant.name} onChange={(e) => updateVariant(variant.id, { name: e.target.value })} placeholder="VD: Eco Kèm Pin" className={inputClass} />
              </label>
              <label className={labelClass}>Mã SKU
                <input value={variant.sku} onChange={(e) => updateVariant(variant.id, { sku: e.target.value })} placeholder="VD: VF8-ECO-BAT" className={inputClass} />
              </label>
              <label className={labelClass}>Giá (VNĐ)
                <input value={variant.originalPrice} type="number" onChange={(e) => updateVariant(variant.id, { originalPrice: e.target.value })} placeholder="1200000000" className={inputClass} />
              </label>
            </div>
            {draft.variants.length > 1 && (
              <button type="button" onClick={() => removeVariant(variant.id)} className="absolute top-4 right-4 text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const STEPS = ['Phân loại', 'Thông tin chung', 'Landing Page', 'Phiên bản', 'Hoàn tất'] as const

export function CarProductCreateDialog({
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
}: {
  open: boolean
  rootCategoryId: string
  serviceLabels: CatalogServiceLabel[]
  onClose: () => void
  onChangeType: () => void
  onDirtyChange: (dirty: boolean) => void
  onSaved: (result: AdminAccessorySaveResult) => void
  onNotify: (kind: ToastKind, title: string, message?: string) => void
  onConfirmDestructive: (title: string, message: string, onConfirm: () => void) => void
  onAfterExit: () => void
  initialDraft?: AdminAccessoryDraft
  productId?: string
  expectedUpdatedAt?: string
}) {
  const [draft, setDraft] = useState<AdminAccessoryDraft>(() => initialDraft ?? createAdminAccessoryDraft())
  const [slugEdited, setSlugEdited] = useState(Boolean(initialDraft))
  const [activeStep, setActiveStep] = useState<number>(0)
  const [collections, setCollections] = useState<DraftCollection[]>([])
  const [taxonomyLoading, setTaxonomyLoading] = useState(true)
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isEditing = Boolean(productId)

  useEffect(() => {
    let active = true
    setTaxonomyLoading(true)
    fetch(`/api/v1/admin/catalog-collections?rootCategoryId=${encodeURIComponent(rootCategoryId)}`)
      .then((res) => { if (!res.ok) throw new Error(); return res.json() })
      .then((data) => { if (active) { setCollections(Array.isArray(data) ? data : []); setTaxonomyError(null) } })
      .catch(() => { if (active) setTaxonomyError('Không thể tải taxonomy từ máy chủ.') })
      .finally(() => { if (active) setTaxonomyLoading(false) })
    return () => { active = false }
  }, [rootCategoryId])

  useEffect(() => {
    if (!open || isEditing) return
    const stored = localStorage.getItem(ADMIN_CAR_SESSION_KEY)
    if (!stored) return
    try {
      const restored = restoreAdminCarDraft(stored, rootCategoryId)
      setDraft(restored)
      onNotify('success', 'Đã khôi phục bản nháp ô tô điện', 'Bản lưu nháp chưa hoàn tất trước đó đã được tải lên.')
    } catch {
      localStorage.removeItem(ADMIN_CAR_SESSION_KEY)
    }
  }, [open, rootCategoryId, isEditing, onNotify])

  useEffect(() => {
    if (!open) return
    const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft ?? createAdminAccessoryDraft())
    onDirtyChange(dirty)
    if (!isEditing) {
      if (dirty) localStorage.setItem(ADMIN_CAR_SESSION_KEY, serializeAdminCarDraft(draft))
      else localStorage.removeItem(ADMIN_CAR_SESSION_KEY)
    }
  }, [draft, open, initialDraft, rootCategoryId, isEditing, onDirtyChange])

  function handleDraftChange(next: AdminAccessoryDraft) {
    setDraft(next)
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      const payload = adminAccessoryDraftToWriteRequest(draft, collections)
      // Custom payload modification for cars if needed, for now use standard
      const response = await fetch(`/api/v1/admin/products${productId ? `/${productId}` : ''}`, {
        method: productId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Save failed')
      const result = await response.json()
      if (!isEditing) localStorage.removeItem(ADMIN_CAR_SESSION_KEY)
      onSaved(result)
    } catch (e) {
      onNotify('error', 'Lưu thất bại', (e as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AnimatePresence onExitComplete={onAfterExit}>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex flex-col bg-white" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.15, ease: 'easeOut' }}>
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <h2 className="text-lg font-bold">{isEditing ? 'Chỉnh sửa ô tô điện' : 'Thêm sản phẩm ô tô điện'}</h2>
            <button onClick={() => { if (JSON.stringify(draft) !== JSON.stringify(initialDraft ?? createAdminAccessoryDraft())) { onConfirmDestructive('Đóng cửa sổ?', 'Thay đổi chưa lưu sẽ bị mất.', onClose) } else { onClose() } }} className="rounded-md p-2 hover:bg-slate-100 text-slate-500"><X size={20}/></button>
          </header>
          
          <div className="flex flex-1 min-h-0">
            <aside className="w-64 border-r border-slate-200 bg-slate-50 overflow-y-auto">
              <nav className="p-4 space-y-1">
                {STEPS.map((name, i) => (
                  <button key={i} onClick={() => setActiveStep(i)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${activeStep === i ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-200/50'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${activeStep === i ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span>
                    {name}
                  </button>
                ))}
              </nav>
            </aside>
            <main className="flex-1 overflow-y-auto bg-slate-50/50 p-6 lg:p-10">
              <div className={activeStep === 2 ? "max-w-5xl mx-auto" : "max-w-3xl mx-auto"}>
                {activeStep === 0 && <ClassificationStep draft={draft} collections={collections} taxonomyLoading={taxonomyLoading} taxonomyError={taxonomyError} onRetryTaxonomy={() => {}} onChange={handleDraftChange} />}
                {activeStep === 1 && <GeneralStep draft={draft} slugEdited={slugEdited} onSlugEdited={() => setSlugEdited(true)} onChange={handleDraftChange} />}
                {activeStep === 2 && <LandingPageStep draft={draft} onChange={handleDraftChange} />}
                {activeStep === 3 && <VariantStep draft={draft} onChange={handleDraftChange} />}
                {activeStep === 4 && (
                  <div className="space-y-6">
                    <SectionHeading title="Hoàn tất và Đăng tải" />
                    <div className="bg-brand-50 border border-brand-200 rounded-lg p-5">
                      <h4 className="font-bold text-brand-800 mb-2">Đã hoàn thành nhập thông tin</h4>
                      <p className="text-sm text-brand-700">Kiểm tra lại dữ liệu trước khi xuất bản sản phẩm ô tô điện.</p>
                      <div className="mt-6 flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={() => handleSave()} disabled={isSaving}>Lưu Bản nháp</Button>
                        <Button type="button" onClick={() => { handleDraftChange({ ...draft, isActive: true }); handleSave() }} disabled={isSaving} className="bg-brand-600 text-white hover:bg-brand-700">
                          {isSaving && <Loader2 size={16} className="mr-2 animate-spin"/>} Lưu và Xuất bản
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="mt-10 border-t border-slate-200 pt-6 flex justify-between">
                  <Button type="button" variant="outline" onClick={() => setActiveStep(s => Math.max(0, s - 1))} disabled={activeStep === 0}>Quay lại</Button>
                  <Button type="button" onClick={() => setActiveStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={activeStep === STEPS.length - 1}>Tiếp tục</Button>
                </div>
              </div>
            </main>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
