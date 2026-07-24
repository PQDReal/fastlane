'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Edit, Loader2, Plus, Search, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../../../components/ui/button'
import { ToastViewport, type ToastMessage } from '../../../components/ui/toast'

type Category = {
  id: string
  name: string
  slug: string
  description: string | null
  is_active?: boolean
  isActive?: boolean
}

type CategoryForm = {
  name: string
  slug: string
  description: string
}

const EMPTY_FORM: CategoryForm = { name: '', slug: '', description: '' }

function toSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function readError(response: Response) {
  try {
    const body = await response.json()
    return typeof body.error === 'string' ? body.error : body.error?.message || 'Có lỗi xảy ra.'
  } catch {
    return 'Có lỗi xảy ra.'
  }
}

export default function AdminCategoriesPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, kind, title, message }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500)
  }, [])

  const fetchCategories = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await fetch('/api/v1/admin/categories', { cache: 'no-store' })
      if (!response.ok) throw new Error(await readError(response))
      setCategories(await response.json())
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Kh\u00f4ng th\u1ec3 t\u1ea3i danh m\u1ee5c.'
      setError(message)
      notify('error', 'T\u1ea3i danh m\u1ee5c th\u1ea5t b\u1ea1i', message)
    } finally {
      setIsLoading(false)
    }
  }, [notify])
  useEffect(() => {
    void fetchCategories()
  }, [fetchCategories])

  const filteredCategories = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return categories
    return categories.filter((category) =>
      category.name.toLowerCase().includes(query) ||
      category.slug.toLowerCase().includes(query) ||
      category.description?.toLowerCase().includes(query),
    )
  }, [categories, searchTerm])

  const normalizedForm = {
    name: form.name.trim(),
    slug: form.slug.trim(),
    description: form.description.trim(),
  }
  const hasCategoryChanges = !editingCategory ||
    normalizedForm.name !== editingCategory.name.trim() ||
    normalizedForm.slug !== editingCategory.slug.trim() ||
    normalizedForm.description !== (editingCategory.description || '').trim()
  const canSubmitCategory = Boolean(normalizedForm.name && normalizedForm.slug && hasCategoryChanges)

  function openCreateForm() {
    setEditingCategory(null)
    setForm(EMPTY_FORM)
    setError('')
    setIsFormOpen(true)
  }

  function openEditForm(category: Category) {
    setEditingCategory(category)
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
    })
    setError('')
    setIsFormOpen(true)
  }

  function closeForm() {
    if (isSaving) return
    setIsFormOpen(false)
  }

  function resetFormState() {
    setEditingCategory(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSaving(true)

    const endpoint = editingCategory
      ? `/api/v1/admin/categories/${editingCategory.id}`
      : '/api/v1/admin/categories'

    try {
      const response = await fetch(endpoint, {
        method: editingCategory ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedForm),
      })
      if (!response.ok) throw new Error(await readError(response))

      const saved: Category = await response.json()
      setCategories((current) => editingCategory
        ? current.map((category) => category.id === saved.id ? saved : category)
        : [saved, ...current],
      )
      setIsFormOpen(false)
      notify('success', editingCategory ? 'C\u1eadp nh\u1eadt th\u00e0nh c\u00f4ng' : 'Th\u00eam danh m\u1ee5c th\u00e0nh c\u00f4ng')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Kh\u00f4ng th\u1ec3 l\u01b0u danh m\u1ee5c.'
      setError(message)
      notify('error', 'L\u01b0u danh m\u1ee5c th\u1ea5t b\u1ea1i', message)
    } finally {
      setIsSaving(false)
    }
  }
  async function toggleCategoryStatus(category: Category) {
    const currentStatus = category.isActive ?? category.is_active ?? true
    const nextStatus = !currentStatus
    setTogglingId(category.id)
    setError('')

    try {
      const response = await fetch(`/api/v1/admin/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextStatus }),
      })
      if (!response.ok) throw new Error(await readError(response))

      const saved: Category = await response.json()
      setCategories((current) => current.map((item) => item.id === saved.id ? saved : item))
      notify('success', nextStatus ? 'Danh m\u1ee5c \u0111\u00e3 ho\u1ea1t \u0111\u1ed9ng' : 'Danh m\u1ee5c \u0111\u00e3 ng\u1eebng ho\u1ea1t \u0111\u1ed9ng')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Kh\u00f4ng th\u1ec3 c\u1eadp nh\u1eadt tr\u1ea1ng th\u00e1i.'
      setError(message)
      notify('error', 'C\u1eadp nh\u1eadt tr\u1ea1ng th\u00e1i th\u1ea5t b\u1ea1i', message)
    } finally {
      setTogglingId(null)
    }
  }
  function requestDeleteCategory(category: Category) {
    const id = Date.now()
    setToasts((current) => [...current, {
      id,
      kind: 'warning',
      title: 'X\u00e1c nh\u1eadn x\u00f3a danh m\u1ee5c',
      message: `Danh m\u1ee5c “${category.name}” s\u1ebd b\u1ecb x\u00f3a v\u0129nh vi\u1ec5n.`,
      secondaryAction: { label: 'H\u1ee7y', onClick: () => setToasts((current) => current.filter((toast) => toast.id !== id)) },
      action: {
        label: 'X\u00f3a',
        variant: 'danger',
        onClick: () => {
          setToasts((current) => current.filter((toast) => toast.id !== id))
          void deleteCategory(category)
        },
      },
    }])
  }

  async function deleteCategory(category: Category) {
    setDeletingId(category.id)
    setError('')
    try {
      const response = await fetch(`/api/v1/admin/categories/${category.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await readError(response))
      setCategories((current) => current.filter((item) => item.id !== category.id))
      notify('success', 'X\u00f3a danh m\u1ee5c th\u00e0nh c\u00f4ng')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Kh\u00f4ng th\u1ec3 x\u00f3a danh m\u1ee5c.'
      setError(message)
      notify('error', 'X\u00f3a danh m\u1ee5c th\u1ea5t b\u1ea1i', message)
    } finally {
      setDeletingId(null)
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Danh mục</h1>
          <p className="mt-1 text-sm text-slate-500">Quản lý các danh mục sản phẩm của hệ thống.</p>
        </div>
        <Button onClick={openCreateForm} className="shrink-0 bg-slate-900 text-white hover:bg-slate-800">
          <Plus size={16} className="mr-2" /> Thêm danh mục
        </Button>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 p-4 sm:flex-row">
          <div className="relative w-full sm:w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Tìm kiếm danh mục..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-4 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-500">
              <tr>
                <th className="px-6 py-4">Tên danh mục</th>
                <th className="px-6 py-4">Mô tả</th>
<th className="w-48 px-6 py-4">{'Tr\u1ea1ng th\u00e1i'}</th>
                <th className="w-32 px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" /></td></tr>
              ) : filteredCategories.map((category) => (
                <tr key={category.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-6 py-4 font-semibold text-slate-900">{category.name}</td>
                  <td className="max-w-xs truncate px-6 py-4 text-slate-500">{category.description || '-'}</td>
                  <td className="w-48 px-6 py-4">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={category.isActive ?? category.is_active ?? true}
                      onClick={() => void toggleCategoryStatus(category)}
                      disabled={togglingId === category.id}
                      className="inline-flex items-center gap-3 rounded-md py-1 text-sm font-medium text-slate-700 disabled:cursor-wait disabled:opacity-60"
                      aria-label={`Chuyển ${category.name} sang ${(category.isActive ?? category.is_active ?? true) ? 'không hoạt động' : 'hoạt động'}`}
                    >
                      <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${(category.isActive ?? category.is_active ?? true) ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${(category.isActive ?? category.is_active ?? true) ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </span>
                      <span>{(category.isActive ?? category.is_active ?? true) ? 'Hoạt động' : 'Không hoạt động'}</span>
                      {togglingId === category.id && <Loader2 size={14} className="animate-spin text-slate-400" />}
                    </button>
                  </td>
                  <td className="w-32 px-6 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => openEditForm(category)} className="rounded p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-600" aria-label={`Sửa ${category.name}`} title="Sửa">
                        <Edit size={16} />
                      </button>
                      <button type="button" onClick={() => requestDeleteCategory(category)} disabled={deletingId === category.id} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label={`Xóa ${category.name}`} title="Xóa">
                        {deletingId === category.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && filteredCategories.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500">Không tìm thấy danh mục nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ToastViewport toasts={toasts} onClose={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />

      <AnimatePresence onExitComplete={resetFormState}>
        {isFormOpen && (
<motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-form-title"
          >
<motion.div
              className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="category-form-title" className="text-lg font-bold text-slate-900">{editingCategory ? 'Sửa danh mục' : 'Thêm danh mục'}</h2>
              <button type="button" onClick={closeForm} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng"><X size={18} /></button>
            </div>
            <form onSubmit={submitForm} className="space-y-4 p-6">
              {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
              <label className="block text-sm font-medium text-slate-700">
                Tên danh mục <span className="text-red-500">*</span>
                <input required maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, ...(!editingCategory ? { slug: toSlug(event.target.value) } : {}) }))} className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Đường dẫn <span className="text-red-500">*</span>
                <input required maxLength={160} pattern="[a-z0-9-]+" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: toSlug(event.target.value) }))} placeholder="vi-du-danh-muc" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Mô tả
                <textarea rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="mt-1.5 w-full resize-y rounded-md border border-slate-200 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
              </label>
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={closeForm} disabled={isSaving}>Hủy</Button>
                <Button type="submit" disabled={isSaving || !canSubmitCategory} className="bg-slate-900 text-white hover:bg-slate-800">
                  {isSaving && <Loader2 size={16} className="mr-2 animate-spin" />}
                  {editingCategory ? 'Lưu thay đổi' : 'Thêm danh mục'}
                </Button>
              </div>
            </form>
            </motion.div>
          </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}