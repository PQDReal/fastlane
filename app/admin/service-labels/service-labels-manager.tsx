'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Edit, Loader2, Plus, Tags, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { Button } from '@/components/ui/button'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import type { CatalogServiceLabel } from '@/lib/catalog/service-labels'

type LabelForm = {
  code: string
  name: string
  description: string
  displayOrder: string
  isActive: boolean
}

const EMPTY_FORM: LabelForm = {
  code: '',
  name: '',
  description: '',
  displayOrder: '0',
  isActive: true,
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    return typeof body.error === 'string' ? body.error : 'Có lỗi xảy ra.'
  } catch {
    return 'Có lỗi xảy ra.'
  }
}

export function ServiceLabelsManager() {
  const [labels, setLabels] = useState<CatalogServiceLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CatalogServiceLabel | null>(null)
  const [form, setForm] = useState<LabelForm>(EMPTY_FORM)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nameInputRef = useRef<HTMLInputElement>(null)

  const notify = useCallback((kind: ToastMessage['kind'], title: string, message?: string) => {
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, { id, kind, title, message }])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4500)
  }, [])

  const loadLabels = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/v1/admin/service-labels', { cache: 'no-store' })
      if (!response.ok) throw new Error(await responseError(response))
      const data = await response.json()
      setLabels(Array.isArray(data) ? data : [])
    } catch (error) {
      notify('error', 'Tải nhãn dịch vụ thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => { void loadLabels() }, [loadLabels])
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => nameInputRef.current?.focus(), 80)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, saving])

  const normalized = useMemo(() => ({
    code: form.code.trim().toLowerCase(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    displayOrder: Number(form.displayOrder),
    isActive: form.isActive,
  }), [form])

  function createLabel() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, displayOrder: String(labels.length * 10 + 10) })
    setOpen(true)
  }

  function editLabel(label: CatalogServiceLabel) {
    setEditing(label)
    setForm({
      code: label.code,
      name: label.name,
      description: label.description ?? '',
      displayOrder: String(label.displayOrder),
      isActive: label.isActive,
    })
    setOpen(true)
  }

  function closeModal() {
    if (!saving) setOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch(
        editing ? `/api/v1/admin/service-labels/${editing.id}` : '/api/v1/admin/service-labels',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
        },
      )
      if (!response.ok) throw new Error(await responseError(response))
      setOpen(false)
      await loadLabels()
      notify('success', editing ? 'Cập nhật nhãn thành công' : 'Tạo nhãn thành công')
    } catch (error) {
      notify(
        'error',
        editing ? 'Cập nhật nhãn thất bại' : 'Tạo nhãn thất bại',
        error instanceof Error ? error.message : undefined,
      )
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete(label: CatalogServiceLabel) {
    const isAssigned = label.assignmentCount > 0
    const id = Date.now() + Math.random()
    setToasts((items) => [...items, {
      id,
      kind: 'warning',
      title: isAssigned ? 'Tạm ngừng nhãn dịch vụ?' : 'Xác nhận xóa nhãn dịch vụ',
      message: isAssigned
        ? `Nhãn “${label.name}” đang được gán cho ${label.assignmentCount} phụ kiện và không thể xóa. Nhãn sẽ được tạm ngừng.`
        : `Nhãn “${label.name}” sẽ bị xóa vĩnh viễn.`,
      secondaryAction: {
        label: 'Hủy',
        onClick: () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      },
      action: {
        label: isAssigned ? 'Tạm ngừng' : 'Xóa',
        variant: isAssigned ? 'default' : 'danger',
        onClick: () => {
          setToasts((current) => current.filter((toast) => toast.id !== id))
          void (isAssigned ? deactivateLabel(label) : removeLabel(label))
        },
      },
    }])
  }

  async function deactivateLabel(label: CatalogServiceLabel) {
    setDeleting(label.id)
    try {
      const response = await fetch(`/api/v1/admin/service-labels/${label.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      })
      if (!response.ok) throw new Error(await responseError(response))
      await loadLabels()
      notify('success', 'Đã tạm ngừng nhãn dịch vụ')
    } catch (error) {
      notify('error', 'Tạm ngừng nhãn thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setDeleting(null)
    }
  }

  async function removeLabel(label: CatalogServiceLabel) {
    setDeleting(label.id)
    try {
      const response = await fetch(`/api/v1/admin/service-labels/${label.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await responseError(response))
      setLabels((items) => items.filter((item) => item.id !== label.id))
      notify('success', 'Xóa nhãn thành công')
    } catch (error) {
      notify('error', 'Xóa nhãn thất bại', error instanceof Error ? error.message : undefined)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nhãn dịch vụ</h1>
          <p className="mt-1 text-sm text-slate-500">Quản lý nhãn dùng để lọc và mô tả dịch vụ của phụ kiện.</p>
        </div>
        <Button onClick={createLabel} className="bg-slate-900 text-white hover:bg-slate-800">
          <Plus size={16} className="mr-2" /> Tạo nhãn
        </Button>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b bg-slate-50/60 px-5 py-4">
          <Tags className="text-brand-600" size={20} />
          <p className="text-sm font-semibold text-slate-800">{labels.length} nhãn dịch vụ</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-500">
              <tr><th className="px-5 py-3">Tên</th><th className="px-5 py-3">Mã</th><th className="px-5 py-3">Thứ tự</th><th className="px-5 py-3">Đang gán</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Thao tác</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={6} className="px-5 py-12 text-center"><Loader2 className="mx-auto animate-spin text-slate-400" /></td></tr>}
              {!loading && labels.map((label) => (
                <tr key={label.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-4"><p className="font-semibold text-slate-900">{label.name}</p>{label.description && <p className="mt-1 max-w-md text-xs text-slate-500">{label.description}</p>}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">{label.code}</td>
                  <td className="px-5 py-4 tabular-nums">{label.displayOrder}</td>
                  <td className="px-5 py-4 tabular-nums">{label.assignmentCount}</td>
                  <td className="px-5 py-4"><span className={`rounded-md px-2 py-1 text-xs font-bold ${label.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{label.isActive ? 'Hoạt động' : 'Tạm ngừng'}</span></td>
                  <td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" onClick={() => editLabel(label)} className="rounded p-2 text-slate-400 transition active:scale-95 hover:bg-brand-50 hover:text-brand-600" aria-label={`Sửa ${label.name}`}><Edit size={16} /></button><button type="button" onClick={() => confirmDelete(label)} disabled={deleting === label.id} className="rounded p-2 text-slate-400 transition active:scale-95 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label={`Xóa ${label.name}`}>{deleting === label.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}</button></div></td>
                </tr>
              ))}
              {!loading && labels.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-500">Chưa có nhãn dịch vụ.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal() }}>
            <motion.div role="dialog" aria-modal="true" aria-labelledby="service-label-dialog-title" className="w-full max-w-lg rounded-xl bg-white shadow-2xl" initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
              <div className="flex items-center justify-between border-b px-6 py-4"><h2 id="service-label-dialog-title" className="text-lg font-bold">{editing ? 'Sửa nhãn dịch vụ' : 'Tạo nhãn dịch vụ'}</h2><button type="button" onClick={closeModal} disabled={saving} className="rounded p-2 hover:bg-slate-100" aria-label="Đóng"><X size={18} /></button></div>
              <form onSubmit={submit} className="space-y-4 p-6">
                <label className="block text-sm font-medium">Tên nhãn<input ref={nameInputRef} required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 h-10 w-full rounded-md border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" /></label>
                <label className="block text-sm font-medium">Mã ổn định<input required maxLength={80} pattern="[a-z][a-z0-9_]*" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toLowerCase() })} className="mt-1.5 h-10 w-full rounded-md border px-3 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" /><span className="mt-1 block text-xs font-normal text-slate-400">Không đổi mã sau khi đã dùng trong URL hoặc tích hợp.</span></label>
                <label className="block text-sm font-medium">Mô tả<textarea maxLength={1000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1.5 w-full rounded-md border px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" /></label>
                <label className="block text-sm font-medium">Thứ tự hiển thị<input required type="number" min={0} step={1} value={form.displayOrder} onChange={(event) => setForm({ ...form, displayOrder: event.target.value })} className="mt-1.5 h-10 w-full rounded-md border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" /></label>
                <label className="flex items-center gap-3 rounded-lg border bg-slate-50 px-4 py-3 text-sm font-medium"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-slate-900" />Nhãn đang hoạt động</label>
                <div className="flex justify-end gap-3 border-t pt-4"><Button type="button" variant="outline" onClick={closeModal} disabled={saving}>Hủy</Button><Button type="submit" disabled={saving} className="bg-slate-900 text-white">{saving && <Loader2 size={16} className="mr-2 animate-spin" />}{editing ? 'Lưu thay đổi' : 'Tạo nhãn'}</Button></div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
