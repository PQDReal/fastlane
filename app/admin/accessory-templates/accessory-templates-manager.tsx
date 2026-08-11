'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Edit, Layers3, Loader2, Plus, Trash2, X } from 'lucide-react'

import { AdminModalPortal } from '@/components/admin/admin-modal-portal'
import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { ACCESSORY_SECTION_TYPES } from '@/lib/catalog/admin-accessory-draft'
import { accessoryTemplateCodeFromName } from '@/lib/catalog/admin-accessory-template-validation'
import type {
  AdminAccessoryTemplate,
  AdminAccessoryTemplateCategoryLookup,
  AccessoryTemplateDefinition,
  AccessoryTemplateSectionDefinition,
} from '@/lib/catalog/admin-accessory-template-types'

const NEW_GROUP_VALUE = '__new_group__'

type FormState = {
  code: string
  name: string
  groupName: string
  customGroupName: string
  description: string
  isActive: boolean
  suggestedCategorySlugs: string[]
  // Preserved for v1 compatibility. It is intentionally not exposed until
  // reusable option-group editing is implemented end to end.
  suggestedOptionCodes: string[]
  sections: AccessoryTemplateSectionDefinition[]
  optionGroups: NonNullable<AccessoryTemplateDefinition['optionGroups']>
}

type TemplateLookups = {
  groups: string[]
  categories: AdminAccessoryTemplateCategoryLookup[]
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  groupName: '',
  customGroupName: '',
  description: '',
  isActive: true,
  suggestedCategorySlugs: [],
  suggestedOptionCodes: [],
  sections: [],
  optionGroups: [],
}

const inputClass = 'mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
const textareaClass = 'mt-1.5 min-h-24 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
const labelClass = 'block text-sm font-semibold text-slate-700'

function responseError(response: Response) {
  return response.json().then((body: unknown) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const error = (body as Record<string, unknown>).error
      if (typeof error === 'string') return error
    }
    return 'Có lỗi xảy ra.'
  }).catch(() => 'Có lỗi xảy ra.')
}

function attributeKeyFromLabel(label: string, fallback: string) {
  if (!label.trim()) return fallback
  const key = accessoryTemplateCodeFromName(label).replaceAll('-', '_')
  return key || fallback
}

function formFromTemplate(template: AdminAccessoryTemplate): FormState {
  const definition = template.definition
  return {
    code: template.code,
    name: template.name,
    groupName: template.groupName ?? '',
    customGroupName: '',
    description: template.description ?? '',
    isActive: template.isActive,
    suggestedCategorySlugs: definition?.suggestedCategorySlugs ?? [],
    suggestedOptionCodes: definition?.suggestedOptionCodes ?? [],
    sections: definition?.sections.map((section) => ({
      ...section,
      attributes: (section.attributes ?? []).map((attribute, index) => ({
        ...attribute,
        key: attribute.key || `attribute_${index + 1}`,
      })),
    })) ?? [],
    optionGroups: definition?.optionGroups?.map((group) => ({ ...group, values: group.values ?? [] })) ?? [],
  }
}

function definitionFromForm(form: FormState): AccessoryTemplateDefinition {
  return {
    schema: 'accessory_template_v1',
    suggestedCategorySlugs: form.suggestedCategorySlugs,
    suggestedOptionCodes: form.suggestedOptionCodes,
    sections: form.sections.map((section) => ({
      ...section,
      attributes: (section.attributes ?? []).map((attribute, index) => ({
        ...attribute,
        key: attributeKeyFromLabel(attribute.label, attribute.key || `attribute_${index + 1}`),
      })),
      items: section.items ?? [],
    })),
    optionGroups: form.optionGroups,
  }
}

function freshSection(): AccessoryTemplateSectionDefinition {
  const definition = ACCESSORY_SECTION_TYPES[0]
  return { key: `section_${Date.now()}`, type: definition.value, title: definition.defaultTitle, attributes: [] }
}

export function AccessoryTemplatesManager() {
  const [templates, setTemplates] = useState<AdminAccessoryTemplate[]>([])
  const [lookups, setLookups] = useState<TemplateLookups>({ groups: [], categories: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminAccessoryTemplate | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [open, setOpen] = useState(false)
  const [activeContentSectionKey, setActiveContentSectionKey] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [templatesResponse, lookupResponse] = await Promise.all([
        fetch('/api/v1/admin/accessory-templates?includeInactive=true', { cache: 'no-store' }),
        fetch('/api/v1/admin/accessory-templates/lookups', { cache: 'no-store' }),
      ])
      if (!templatesResponse.ok) throw new Error(await responseError(templatesResponse))
      if (!lookupResponse.ok) throw new Error(await responseError(lookupResponse))
      const templatesBody = await templatesResponse.json() as { data?: unknown }
      const lookupBody = await lookupResponse.json() as { data?: unknown }
      setTemplates(Array.isArray(templatesBody.data) ? templatesBody.data as AdminAccessoryTemplate[] : [])
      if (lookupBody.data && typeof lookupBody.data === 'object' && !Array.isArray(lookupBody.data)) {
        const data = lookupBody.data as Partial<TemplateLookups>
        setLookups({
          groups: Array.isArray(data.groups) ? data.groups.filter((value): value is string => typeof value === 'string') : [],
          categories: Array.isArray(data.categories) ? data.categories as AdminAccessoryTemplateCategoryLookup[] : [],
        })
      }
    } catch (error) {
      notify('error', 'Tải mẫu phụ kiện thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { void loadData() }, [loadData])

  const activeCount = useMemo(() => templates.filter((template) => template.isActive).length, [templates])
  const groupOptions = useMemo(() => [...new Set([
    ...lookups.groups,
    ...templates.map((template) => template.groupName).filter((value): value is string => Boolean(value)),
  ])].sort((left, right) => left.localeCompare(right, 'vi')), [lookups.groups, templates])
  const categoryOptions = useMemo(() => {
    const known = new Set(lookups.categories.map((category) => category.slug))
    const legacy = form.suggestedCategorySlugs
      .filter((slug) => !known.has(slug))
      .map((slug) => ({ id: `legacy-${slug}`, slug, name: `${slug} (không còn hoạt động)`, displayOrder: 999_999 }))
    return [...lookups.categories, ...legacy]
  }, [form.suggestedCategorySlugs, lookups.categories])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, suggestedCategorySlugs: [], sections: [], optionGroups: [] })
    setActiveContentSectionKey(null)
    setOpen(true)
  }

  function openEdit(template: AdminAccessoryTemplate) {
    const nextForm = formFromTemplate(template)
    setEditing(template)
    setForm(nextForm)
    setActiveContentSectionKey(nextForm.sections[0]?.key ?? null)
    setOpen(true)
  }

  function cloneTemplate(template: AdminAccessoryTemplate) {
    const next = formFromTemplate(template)
    setEditing(null)
    setForm({ ...next, code: '', name: `${next.name} (bản sao)`, isActive: true })
    setActiveContentSectionKey(next.sections[0]?.key ?? null)
    setOpen(true)
  }

  function closeModal() {
    if (!saving) setOpen(false)
  }

  function addContentSection() {
    const section = freshSection()
    setForm((current) => ({ ...current, sections: [...current.sections, section] }))
    setActiveContentSectionKey(section.key)
  }

  function removeContentSection(sectionKey: string) {
    const next = form.sections.filter((section) => section.key !== sectionKey)
    setForm((current) => ({ ...current, sections: next }))
    if (activeContentSectionKey === sectionKey) setActiveContentSectionKey(next[0]?.key ?? null)
  }

  function updateSection(sectionKey: string, patch: Partial<AccessoryTemplateSectionDefinition>) {
    setForm((current) => ({ ...current, sections: current.sections.map((section) => section.key === sectionKey ? { ...section, ...patch } : section) }))
  }

  function addAttribute(sectionKey: string) {
    setForm((current) => ({ ...current, sections: current.sections.map((section) => section.key === sectionKey
      ? { ...section, attributes: [...(section.attributes ?? []), { key: `attribute_${(section.attributes?.length ?? 0) + 1}`, label: '', defaultValue: '' }] }
      : section) }))
  }

  function removeAttribute(sectionKey: string, attributeIndex: number) {
    setForm((current) => ({ ...current, sections: current.sections.map((section) => section.key === sectionKey
      ? { ...section, attributes: (section.attributes ?? []).filter((_, currentIndex) => currentIndex !== attributeIndex) }
      : section) }))
  }

  function updateAttribute(sectionKey: string, attributeIndex: number, patch: { label?: string; defaultValue?: string }) {
    setForm((current) => ({ ...current, sections: current.sections.map((section) => section.key === sectionKey
      ? {
        ...section,
        attributes: (section.attributes ?? []).map((attribute, currentIndex) => currentIndex === attributeIndex
          ? {
            ...attribute,
            ...patch,
            ...(patch.label === undefined ? {} : { key: attributeKeyFromLabel(patch.label, attribute.key) }),
          }
          : attribute),
      }
      : section) }))
  }

  function selectedGroupValue() {
    return form.groupName === NEW_GROUP_VALUE ? NEW_GROUP_VALUE : form.groupName
  }

  function resolvedGroupName() {
    if (form.groupName !== NEW_GROUP_VALUE) return form.groupName.trim() || null
    return form.customGroupName.trim() || null
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const groupName = resolvedGroupName()
    if (form.groupName === NEW_GROUP_VALUE && !groupName) {
      notify('warning', 'Cần nhập tên nhóm mới')
      return
    }
    const invalidSection = form.sections.find((section) => !section.title.trim() || !section.type.trim())
    if (invalidSection) {
      setActiveContentSectionKey(invalidSection.key)
      notify('warning', 'Cần hoàn thiện tên và loại của mục nội dung')
      return
    }
    const invalidAttributeSection = form.sections.find((section) => (section.attributes ?? []).some((attribute) => !attribute.label.trim()))
    if (invalidAttributeSection) {
      setActiveContentSectionKey(invalidAttributeSection.key)
      notify('warning', 'Cần nhập tên cho thuộc tính đã thêm')
      return
    }
    setSaving(true)
    try {
      const definition = definitionFromForm(form)
      if (!editing) {
        const response = await fetch('/api/v1/admin/accessory-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, groupName, description: form.description || null, isActive: form.isActive, definition }),
        })
        if (!response.ok) throw new Error(await responseError(response))
        notify('success', 'Đã tạo mẫu phụ kiện')
      } else {
        const versionResponse = await fetch(`/api/v1/admin/accessory-templates/${editing.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ definition, changeNote: 'Cập nhật cấu trúc từ màn hình quản trị', expectedUpdatedAt: editing.updatedAt }),
        })
        if (!versionResponse.ok) throw new Error(await responseError(versionResponse))
        const metadataResponse = await fetch(`/api/v1/admin/accessory-templates/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, groupName, description: form.description || null, isActive: form.isActive }),
        })
        if (!metadataResponse.ok) throw new Error(await responseError(metadataResponse))
        notify('success', 'Đã cập nhật mẫu phụ kiện')
      }
      setOpen(false)
      await loadData()
    } catch (error) {
      notify('error', editing ? 'Cập nhật mẫu thất bại' : 'Tạo mẫu thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(template: AdminAccessoryTemplate) {
    const id = Date.now() + Math.random()
    const inUse = template.usageCount > 0
    setToasts((items) => [...items, {
      id,
      kind: 'warning',
      title: inUse ? 'Tạm ngừng mẫu phụ kiện?' : 'Xác nhận xóa mẫu phụ kiện',
      message: inUse
        ? `Mẫu “${template.name}” đang được dùng bởi ${template.usageCount} sản phẩm và không thể xóa. Bạn có thể tạm ngừng mẫu.`
        : `Mẫu “${template.name}” sẽ bị xóa cùng các phiên bản chưa được tham chiếu.`,
      secondaryAction: { label: 'Hủy', onClick: () => setToasts((current) => current.filter((toast) => toast.id !== id)) },
      action: {
        label: inUse ? 'Tạm ngừng' : 'Xóa',
        variant: inUse ? 'default' : 'danger',
        onClick: () => {
          setToasts((current) => current.filter((toast) => toast.id !== id))
          void (inUse ? archiveTemplate(template) : removeTemplate(template))
        },
      },
    }])
  }

  async function archiveTemplate(template: AdminAccessoryTemplate) {
    setDeleting(template.id)
    try {
      const response = await fetch(`/api/v1/admin/accessory-templates/${template.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: false }) })
      if (!response.ok) throw new Error(await responseError(response))
      notify('success', 'Đã tạm ngừng mẫu phụ kiện')
      await loadData()
    } catch (error) {
      notify('error', 'Tạm ngừng mẫu thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setDeleting(null)
    }
  }

  async function removeTemplate(template: AdminAccessoryTemplate) {
    setDeleting(template.id)
    try {
      const response = await fetch(`/api/v1/admin/accessory-templates/${template.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await responseError(response))
      notify('success', 'Đã xóa mẫu phụ kiện')
      await loadData()
    } catch (error) {
      notify('error', 'Xóa mẫu thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setDeleting(null)
    }
  }

  const generatedCode = accessoryTemplateCodeFromName(form.name)
  const activeContentSection = form.sections.find((section) => section.key === activeContentSectionKey) ?? null

  return (
    <div className="min-w-0 space-y-6">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Danh mục cấu hình</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Mẫu phụ kiện</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Tạo cấu trúc dùng lại cho nội dung và thông số. Mỗi lần sửa cấu trúc sẽ tạo một phiên bản mới.</p>
          </div>
          <Button type="button" onClick={openCreate}><Plus size={16} className="mr-2" />Tạo mẫu</Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
          <span className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-700">{activeCount} đang hoạt động</span>
          <span className="rounded-md bg-slate-100 px-2.5 py-1.5">{templates.length} mẫu trong hệ thống</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-slate-500"><tr><th className="px-5 py-3">Mẫu</th><th className="px-5 py-3">Nhóm</th><th className="px-5 py-3">Phiên bản</th><th className="px-5 py-3">Đang dùng</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">
          {loading && <tr><td colSpan={6} className="px-5 py-12 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></td></tr>}
          {!loading && templates.map((template) => <tr key={template.id} className="transition-colors hover:bg-slate-50"><td className="px-5 py-4"><p className="font-semibold text-slate-900">{template.name}</p><p className="mt-1 font-mono text-xs text-slate-500">{template.code}</p>{template.description && <p className="mt-1 max-w-md text-xs text-slate-500">{template.description}</p>}</td><td className="px-5 py-4 text-slate-600">{template.groupName || 'Chưa phân nhóm'}</td><td className="px-5 py-4 tabular-nums">v{template.currentVersion}</td><td className="px-5 py-4 tabular-nums">{template.usageCount}</td><td className="px-5 py-4"><span className={`rounded-md px-2 py-1 text-xs font-bold ${template.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{template.isActive ? 'Hoạt động' : 'Tạm ngừng'}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" onClick={() => openEdit(template)} className="rounded p-2 text-slate-400 transition active:scale-95 hover:bg-brand-50 hover:text-brand-600" aria-label={`Sửa ${template.name}`}><Edit size={16} /></button><button type="button" onClick={() => cloneTemplate(template)} className="rounded p-2 text-slate-400 transition active:scale-95 hover:bg-slate-100 hover:text-slate-800" aria-label={`Nhân bản ${template.name}`}><Copy size={16} /></button><button type="button" onClick={() => confirmDelete(template)} disabled={deleting === template.id} className="rounded p-2 text-slate-400 transition active:scale-95 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label={`Xóa ${template.name}`}>{deleting === template.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</button></div></td></tr>)}
          {!loading && templates.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">Chưa có mẫu phụ kiện.</td></tr>}
        </tbody></table></div>
      </section>

      <AdminModalPortal><AnimatePresence>{open && <motion.div className="fixed inset-0 z-50 flex overscroll-none bg-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div role="dialog" aria-modal="true" aria-labelledby="accessory-template-dialog-title" className="flex h-full w-full flex-col overflow-hidden bg-white" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6"><div><h2 id="accessory-template-dialog-title" className="text-lg font-bold text-slate-950">{editing ? 'Sửa mẫu phụ kiện' : 'Tạo mẫu phụ kiện'}</h2><p className="mt-1 text-xs text-slate-500">{editing ? `Lưu sẽ tạo phiên bản v${editing.currentVersion + 1}.` : 'Mã mẫu và thứ tự hiển thị sẽ được hệ thống tự sinh.'}</p><p className="mt-1 text-xs text-slate-500"><span className="font-bold text-red-500" aria-hidden="true">*</span> Trường bắt buộc</p></div><button type="button" onClick={closeModal} disabled={saving} aria-label="Đóng" className="rounded p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto space-y-6 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Tên mẫu <span className="text-red-500" aria-hidden="true">*</span><input required disabled={saving} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Film cách nhiệt" className={inputClass} /></label>
              <label className={labelClass}>Mã hệ thống<input readOnly value={editing ? form.code : generatedCode} className={`${inputClass} bg-slate-50 font-mono text-xs`} /><span className="mt-1 block text-xs font-normal text-slate-500">Tự sinh từ tên; dùng để nhận diện nội bộ.</span></label>
              <label className={labelClass}>Nhóm <span className="text-xs font-normal text-slate-500">(không bắt buộc)</span><select disabled={saving} value={selectedGroupValue()} onChange={(event) => setForm((current) => ({ ...current, groupName: event.target.value, customGroupName: event.target.value === NEW_GROUP_VALUE ? current.customGroupName : '' }))} className={inputClass}><option value="">Không phân nhóm</option>{groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}<option value={NEW_GROUP_VALUE}>+ Tạo nhóm mới…</option></select></label>
              {form.groupName === NEW_GROUP_VALUE && <label className={labelClass}>Tên nhóm mới <span className="text-red-500" aria-hidden="true">*</span><input required disabled={saving} value={form.customGroupName} onChange={(event) => setForm((current) => ({ ...current, customGroupName: event.target.value }))} placeholder="Ví dụ: Phụ kiện nội thất" className={inputClass} /></label>}
            </div>
            <label className={labelClass}>Mô tả <span className="text-xs font-normal text-slate-500">(không bắt buộc)</span><textarea disabled={saving} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Mẫu này dùng cho..." className={textareaClass} /></label>
            <fieldset>
              <legend className={labelClass}>Danh mục mặc định <span className="text-xs font-normal text-slate-500">(không bắt buộc)</span></legend>
              <p className="mt-1 text-sm text-slate-500">Chọn một hoặc nhiều danh mục có sẵn trong taxonomy. Đây chỉ là lựa chọn ban đầu khi tạo phụ kiện và vẫn có thể sửa.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {categoryOptions.map((category) => {
                  const selected = form.suggestedCategorySlugs.includes(category.slug)
                  return <button key={category.id} type="button" disabled={saving} aria-pressed={selected} onClick={() => setForm((current) => ({ ...current, suggestedCategorySlugs: selected ? current.suggestedCategorySlugs.filter((slug) => slug !== category.slug) : [...new Set([...current.suggestedCategorySlugs, category.slug])] }))} className={`flex min-h-11 items-center justify-between rounded-md border px-4 text-left text-sm font-semibold transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-100' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}><span>{category.name}</span>{selected && <Check size={16} />}</button>
                })}
                {categoryOptions.length === 0 && <p className="border border-dashed border-slate-200 p-4 text-sm text-slate-500">Chưa có danh mục taxonomy hoạt động.</p>}
              </div>
            </fieldset>
            <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-slate-900">Mục nội dung & thuộc tính <span className="text-xs font-normal text-slate-500">(không bắt buộc)</span></h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Chỉnh sửa trực tiếp tại đây. Các thay đổi sẽ được lưu cùng mẫu khi bấm nút ở cuối trang.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addContentSection} disabled={saving}><Plus size={14} className="mr-1" />Thêm mục</Button>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
                <aside className="border-b border-slate-200 bg-slate-50/70 p-3 lg:border-b-0 lg:border-r">
                  <div className="flex items-center justify-between gap-3 px-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{form.sections.length} mục</span><button type="button" onClick={addContentSection} disabled={saving} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Plus size={14} />Thêm</button></div>
                  <div className="mt-3 max-h-64 space-y-1 overflow-y-auto lg:max-h-[calc(100vh-25rem)]">{form.sections.map((section, index) => { const selected = section.key === activeContentSectionKey; return <button key={section.key} type="button" aria-pressed={selected} onClick={() => setActiveContentSectionKey(section.key)} className={`flex min-h-14 w-full items-center rounded-lg px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/80 hover:text-slate-950'}`}><span className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{index + 1}</span><span className="min-w-0 truncate text-sm font-semibold">{section.title || 'Mục chưa đặt tên'}</span></button> })}{form.sections.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Chưa có mục nào.</div>}</div>
                  <button type="button" onClick={addContentSection} disabled={saving} className="mt-3 hidden min-h-10 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs font-bold text-brand-700 transition hover:border-brand-400 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:flex"><Plus size={14} />Thêm mục nội dung</button>
                </aside>
                <div className="p-5 sm:p-6">{activeContentSection ? <div className="mx-auto max-w-4xl space-y-5"><div className="flex justify-end"><button type="button" onClick={() => removeContentSection(activeContentSection.key)} disabled={saving} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><Trash2 size={14} />Xóa mục</button></div><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]"><label className={labelClass}>Tiêu đề hiển thị <span className="text-red-500" aria-hidden="true">*</span><input required value={activeContentSection.title} disabled={saving} onChange={(event) => updateSection(activeContentSection.key, { title: event.target.value })} className={inputClass} /></label><label className={labelClass}>Loại nội dung <span className="text-red-500" aria-hidden="true">*</span><select required value={activeContentSection.type} disabled={saving} onChange={(event) => { const next = ACCESSORY_SECTION_TYPES.find((item) => item.value === event.target.value); updateSection(activeContentSection.key, { type: event.target.value as AccessoryTemplateSectionDefinition['type'], title: next?.defaultTitle ?? activeContentSection.title }) }} className={inputClass}>{ACCESSORY_SECTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label></div><label className={labelClass}>Placeholder nội dung <span className="text-xs font-normal text-slate-500">(không bắt buộc)</span><textarea value={activeContentSection.bodyPlaceholder ?? ''} disabled={saving} onChange={(event) => updateSection(activeContentSection.key, { bodyPlaceholder: event.target.value })} placeholder="Nội dung mặc định nếu cần..." className={`${textareaClass} min-h-28`} /></label><section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="font-bold text-slate-900">Thuộc tính định sẵn <span className="text-xs font-normal text-slate-500">(nếu thêm)</span></h4><p className="mt-1 text-xs text-slate-500">Tên thuộc tính là bắt buộc; giá trị mặc định có thể bỏ trống.</p></div><button type="button" onClick={() => addAttribute(activeContentSection.key)} disabled={saving} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Plus size={14} />Thêm thuộc tính</button></div><div className="mt-4 space-y-3">{(activeContentSection.attributes ?? []).map((attribute, attributeIndex) => <div key={`${attribute.key}-${attributeIndex}`} className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.5rem]"><label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Tên thuộc tính <span className="text-red-500" aria-hidden="true">*</span></span><input aria-label="Tên thuộc tính" required value={attribute.label} disabled={saving} onChange={(event) => updateAttribute(activeContentSection.key, attributeIndex, { label: event.target.value })} placeholder="Vật liệu" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></label><label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Giá trị mặc định <span className="font-normal text-slate-500">(không bắt buộc)</span></span><input aria-label="Giá trị mặc định" value={attribute.defaultValue ?? ''} disabled={saving} onChange={(event) => updateAttribute(activeContentSection.key, attributeIndex, { defaultValue: event.target.value })} placeholder="Nhập nếu có" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></label><button type="button" onClick={() => removeAttribute(activeContentSection.key, attributeIndex)} disabled={saving} aria-label="Xóa thuộc tính" className="mt-6 rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><X size={16} className="mx-auto" /></button></div>)}{(activeContentSection.attributes ?? []).length === 0 && <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Chưa có thuộc tính định sẵn.</div>}</div></section></div> : <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 p-8 text-center"><Layers3 className="h-10 w-10 text-slate-300" /><h3 className="mt-3 font-bold text-slate-800">Chưa có mục nội dung</h3><p className="mt-1 max-w-md text-sm text-slate-500">Thêm mục để chuẩn bị nội dung và thuộc tính dùng lại khi tạo phụ kiện.</p><Button type="button" className="mt-4" onClick={addContentSection} disabled={saving}><Plus size={15} className="mr-1" />Thêm mục</Button></div>}</div>
              </div>
            </section>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.isActive} disabled={saving} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-slate-900" />Cho phép chọn khi thêm phụ kiện</label>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:px-6"><Button type="button" variant="outline" onClick={closeModal} disabled={saving}>Hủy</Button><Button type="submit" disabled={saving}>{saving && <Loader2 size={15} className="mr-2 animate-spin" />}{editing ? 'Lưu phiên bản' : 'Tạo mẫu'}</Button></div>
        </form>
      </motion.div></motion.div>}</AnimatePresence></AdminModalPortal>

    </div>
  )
}
