'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ImageIcon, Loader2, Pencil, Save, Search, ShieldAlert, X } from 'lucide-react'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import type { VisualKnowledgeReviewItem, VisualReviewStatus } from '@/lib/sales-agent/knowledge/types'

const PAGE_SIZE = 30

const STATUS_OPTIONS: Array<{ value: VisualReviewStatus; label: string }> = [
  { value: 'AI_DRAFT', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Đã từ chối' },
]

const IMAGE_TYPE_OPTIONS = [
  'DIAGRAM', 'PROCEDURE_STEP', 'SCREENSHOT', 'WARNING', 'CONTROL_LOCATION',
  'TABLE_LEGEND', 'ICON_MARKER', 'PHOTO', 'OTHER',
] as const

export function VisualKnowledgeReview() {
  const [items, setItems] = useState<VisualKnowledgeReviewItem[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<VisualReviewStatus>('AI_DRAFT')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<VisualKnowledgeReviewItem | null>(null)
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<Set<string>>(new Set())
  const [editMode, setEditMode] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftSummary, setDraftSummary] = useState('')
  const [draftKeywords, setDraftKeywords] = useState('')
  const [draftVisibleText, setDraftVisibleText] = useState('')
  const [draftImageType, setDraftImageType] = useState('OTHER')
  const [draftRecommendation, setDraftRecommendation] = useState<'INCLUDE' | 'EXCLUDE' | 'REVIEW'>('REVIEW')
  const [draftSafetyCritical, setDraftSafetyCritical] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const closeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])
  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now() + Math.floor(Math.random() * 1_000)
    setToasts((current) => [...current, { ...toast, id }])
    return id
  }, [])

  const loadItems = useCallback(async (nextOffset = 0, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const params = new URLSearchParams({ status, limit: String(PAGE_SIZE), offset: String(nextOffset) })
      if (search.trim()) params.set('search', search.trim())
      const response = await fetch(`/api/v1/admin/knowledge/assets?${params.toString()}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Không thể tải hàng chờ duyệt ảnh.')
      const nextItems = payload.data.items || []
      setItems((current) => append ? [...current, ...nextItems] : nextItems)
      setTotal(Number(payload.data.total || 0))
      if (!append) setSelectedAnnotationIds(new Set())
    } catch (error: any) {
      pushToast({ kind: 'error', title: 'Không thể tải ảnh', message: error?.message || 'Có lỗi khi tải hàng chờ.' })
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }, [pushToast, search, status])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadItems(0), 180)
    return () => window.clearTimeout(timer)
  }, [loadItems])

  useEffect(() => {
    if (!selected) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected])

  useEffect(() => {
    setEditMode(false)
    setDraftTitle(selected?.title || '')
    setDraftSummary(selected?.summary || '')
    setDraftKeywords(selected?.keywords.join(', ') || '')
    setDraftVisibleText(selected?.visibleText.join('\n') || '')
    setDraftImageType(selected?.imageType || 'OTHER')
    setDraftRecommendation(selected?.retrievalRecommendation || 'REVIEW')
    setDraftSafetyCritical(selected?.safetyCritical === true)
  }, [selected?.annotationId])

  async function submitReview(targetStatus: 'APPROVED' | 'REJECTED') {
    if (!selected || reviewing) return
    setReviewing(true)
    try {
      const response = await fetch(`/api/v1/admin/knowledge/assets/${selected.annotationId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Không thể cập nhật trạng thái duyệt.')
      const messages = {
        APPROVED: 'Đã duyệt chú thích ảnh.',
        REJECTED: 'Đã từ chối chú thích ảnh.',
      }
      pushToast({ kind: 'success', title: messages[targetStatus] })
      setSelected(null)
      await loadItems()
    } catch (error: any) {
      pushToast({ kind: 'error', title: 'Không thể cập nhật', message: error?.message || 'Có lỗi khi duyệt ảnh.' })
    } finally {
      setReviewing(false)
    }
  }

  async function saveRevision() {
    if (!selected || reviewing) return
    const keywords = [...new Set(draftKeywords.split(',').map((item) => item.trim()).filter(Boolean))]
    const visibleText = [...new Set(draftVisibleText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))]
    if (!draftTitle.trim() || draftTitle.trim().length > 120 || !draftSummary.trim() || draftSummary.trim().length > 800 || keywords.length > 12 || visibleText.length > 24) {
      pushToast({ kind: 'warning', title: 'Nội dung chỉnh sửa chưa hợp lệ', message: 'Tiêu đề tối đa 120 ký tự, mô tả tối đa 800 ký tự, tối đa 12 từ khóa và 24 dòng OCR.' })
      return
    }
    setReviewing(true)
    try {
      const response = await fetch(`/api/v1/admin/knowledge/assets/${selected.annotationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle.trim(),
          summary: draftSummary.trim(),
          keywords,
          visibleText,
          imageType: draftImageType,
          retrievalRecommendation: draftRecommendation,
          safetyCritical: draftSafetyCritical,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Không thể lưu revision chú thích ảnh.')
      pushToast({
        kind: 'success',
        title: 'Đã tạo revision mới',
        message: 'Revision do bạn chỉnh sửa phải được một quản trị viên khác duyệt theo maker-checker.',
      })
      setSelected(null)
      await loadItems()
    } catch (error: any) {
      pushToast({ kind: 'error', title: 'Không thể lưu chỉnh sửa', message: error?.message || 'Có lỗi khi tạo revision.' })
    } finally {
      setReviewing(false)
    }
  }

  function toggleSelection(annotationId: string) {
    setSelectedAnnotationIds((current) => {
      const next = new Set(current)
      if (next.has(annotationId)) next.delete(annotationId)
      else next.add(annotationId)
      return next
    })
  }

  async function submitBulkReview(targetStatus: 'APPROVED' | 'REJECTED') {
    if (!selectedAnnotationIds.size || reviewing) return
    setReviewing(true)
    try {
      const response = await fetch('/api/v1/admin/knowledge/assets/review-bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ annotationIds: [...selectedAnnotationIds], status: targetStatus }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Không thể duyệt ảnh hàng loạt.')
      pushToast({ kind: 'success', title: `Đã cập nhật ${payload.data.count} chú thích ảnh.` })
      await loadItems()
    } catch (error: any) {
      pushToast({ kind: 'error', title: 'Không thể duyệt hàng loạt', message: error?.message || 'Có lỗi khi cập nhật hàng chờ.' })
    } finally {
      setReviewing(false)
    }
  }

  function requestBulkReview(targetStatus: 'APPROVED' | 'REJECTED') {
    const count = selectedAnnotationIds.size
    if (!count) return
    const labels = { APPROVED: 'duyệt', REJECTED: 'từ chối' }
    const id = pushToast({
      kind: targetStatus === 'APPROVED' ? 'warning' : 'warning',
      title: `Xác nhận ${labels[targetStatus]} ${count} chú thích?`,
      message: 'Thao tác được thực hiện nguyên tử và lưu reviewer/thời điểm cho từng revision.',
      secondaryAction: { label: 'Hủy', onClick: () => closeToast(id) },
      action: {
        label: 'Xác nhận',
        variant: targetStatus === 'APPROVED' ? 'default' : 'danger',
        onClick: () => {
          closeToast(id)
          void submitBulkReview(targetStatus)
        },
      },
    })
  }

  function requestDestructiveReview(targetStatus: 'REJECTED') {
    const id = pushToast({
      kind: 'warning',
      title: 'Từ chối chú thích này?',
      message: 'Chú thích bị từ chối sẽ không được dùng cho retrieval.',
      secondaryAction: { label: 'Hủy', onClick: () => closeToast(id) },
      action: {
        label: 'Từ chối',
        variant: 'danger',
        onClick: () => {
          closeToast(id)
          void submitReview(targetStatus)
        },
      },
    })
  }

  const statusLabel = useMemo(
    () => STATUS_OPTIONS.find((option) => option.value === status)?.label || status,
    [status],
  )

  return (
    <div className="space-y-5">
      <ToastViewport toasts={toasts} onClose={closeToast} />
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Duyệt ảnh tri thức</h2>
            <p className="mt-1 text-sm text-slate-500">Review theo asset SHA-256; draft chỉ dùng cho môi trường test, production vẫn yêu cầu đã duyệt.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Tìm tiêu đề hoặc mô tả"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:w-64"
              />
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as VisualReviewStatus)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">{statusLabel}: {total.toLocaleString('vi-VN')} asset</p>
        {status === 'AI_DRAFT' && items.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <button type="button" onClick={() => setSelectedAnnotationIds(new Set(items.map((item) => item.annotationId)))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Chọn trang này</button>
            {selectedAnnotationIds.size > 0 ? (
              <>
                <button type="button" onClick={() => setSelectedAnnotationIds(new Set())} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Bỏ chọn</button>
                <span className="text-xs text-slate-500">Đã chọn {selectedAnnotationIds.size}</span>
                <button type="button" disabled={reviewing} onClick={() => requestBulkReview('REJECTED')} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">Từ chối</button>
                <button type="button" disabled={reviewing} onClick={() => requestBulkReview('APPROVED')} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Duyệt</button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-200 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-label="Đang tải ảnh" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Không có asset ở trạng thái này.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.annotationId} className="relative">
              {status === 'AI_DRAFT' ? (
                <button
                  type="button"
                  onClick={() => toggleSelection(item.annotationId)}
                  className={`absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md border shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selectedAnnotationIds.has(item.annotationId) ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-transparent hover:text-slate-300'}`}
                  aria-label={selectedAnnotationIds.has(item.annotationId) ? 'Bỏ chọn chú thích ảnh' : 'Chọn chú thích ảnh'}
                  aria-pressed={selectedAnnotationIds.has(item.annotationId)}
                >
                  <Check className="h-4 w-4" />
                </button>
              ) : null}
              <motion.button
              type="button"
              whileTap={{ scale: 0.985 }}
              onClick={() => setSelected(item)}
              className="h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <div className="flex h-44 items-center justify-center bg-slate-100">
                {item.sourceUrl ? <img src={item.sourceUrl} alt={item.title} className="h-full w-full object-contain" /> : <ImageIcon className="h-10 w-10 text-slate-400" />}
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{item.title}</h3>
                  {item.safetyCritical && <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" aria-label="Ảnh liên quan an toàn" />}
                </div>
                <p className="line-clamp-3 text-sm leading-5 text-slate-600">{item.summary}</p>
                <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                  <span className="rounded bg-slate-100 px-2 py-1">{item.imageType}</span>
                  <span className="rounded bg-slate-100 px-2 py-1">Tin cậy {Math.round(item.confidence * 100)}%</span>
                  <span className="rounded bg-slate-100 px-2 py-1">{item.occurrenceCount} vị trí</span>
                </div>
              </div>
              </motion.button>
            </div>
          ))}
        </div>
      )}

      {!loading && items.length < total ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadItems(items.length, true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loadingMore ? 'Đang tải thêm…' : `Xem thêm (${total - items.length})`}
          </button>
        </div>
      ) : null}

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelected(null)
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="visual-review-title"
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="flex h-[92vh] max-h-[960px] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl xl:max-w-7xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                <div>
                  <h3 id="visual-review-title" className="font-semibold text-slate-900">{selected.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">SHA-256 {selected.assetSha256.slice(0, 16)}… · revision {selected.revisionNo}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Đóng chi tiết ảnh"><X size={20} /></button>
              </div>
              <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[460px_1fr] lg:overflow-hidden xl:grid-cols-[520px_1fr]">
                <div className="flex flex-col gap-3 lg:h-full lg:overflow-hidden">
                  <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100/90 p-4">
                    {selected.sourceUrl ? (
                      <img
                        src={selected.sourceUrl}
                        alt={selected.title}
                        className="max-h-[45vh] w-full rounded-lg object-contain lg:max-h-full"
                      />
                    ) : (
                      <ImageIcon className="h-14 w-14 text-slate-400" />
                    )}
                    {selected.sourceUrl ? (
                      <a
                        href={selected.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute right-3 top-3 rounded-lg border border-slate-200/80 bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      >
                        Mở ảnh gốc
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-4 lg:h-full lg:overflow-y-auto lg:pr-3">
                  {editMode ? (
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-slate-600">
                        Tiêu đề
                        <input value={draftTitle} maxLength={120} onChange={(event) => setDraftTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                      </label>
                      <label className="block text-xs font-semibold text-slate-600">
                        Mô tả
                        <textarea value={draftSummary} maxLength={800} rows={5} onChange={(event) => setDraftSummary(event.target.value)} className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                      </label>
                      <label className="block text-xs font-semibold text-slate-600">
                        Từ khóa, phân tách bằng dấu phẩy
                        <input value={draftKeywords} onChange={(event) => setDraftKeywords(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                      </label>
                      <label className="block text-xs font-semibold text-slate-600">
                        OCR, mỗi dòng một mục
                        <textarea value={draftVisibleText} rows={4} onChange={(event) => setDraftVisibleText(event.target.value)} className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-semibold text-slate-600">
                          Loại ảnh
                          <select value={draftImageType} onChange={(event) => setDraftImageType(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                            {IMAGE_TYPE_OPTIONS.map((imageType) => <option key={imageType} value={imageType}>{imageType}</option>)}
                          </select>
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">
                          Khuyến nghị retrieval
                          <select value={draftRecommendation} onChange={(event) => setDraftRecommendation(event.target.value as 'INCLUDE' | 'EXCLUDE' | 'REVIEW')} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100">
                            <option value="INCLUDE">INCLUDE</option>
                            <option value="REVIEW">REVIEW</option>
                            <option value="EXCLUDE">EXCLUDE</option>
                          </select>
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input type="checkbox" checked={draftSafetyCritical} onChange={(event) => setDraftSafetyCritical(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                        Nội dung liên quan an toàn
                      </label>
                    </div>
                  ) : (
                    <p className="text-sm leading-6 text-slate-700">{selected.summary}</p>
                  )}
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-slate-500">Loại ảnh</dt><dd className="font-medium text-slate-900">{selected.imageType}</dd></div>
                    <div><dt className="text-slate-500">Đề xuất AI</dt><dd className="font-medium text-slate-900">{selected.retrievalRecommendation}</dd></div>
                    <div><dt className="text-slate-500">Kích thước</dt><dd className="font-medium text-slate-900">{selected.width || '?'} × {selected.height || '?'}</dd></div>
                    <div><dt className="text-slate-500">Nguồn AI</dt><dd className="font-medium text-slate-900">{selected.providerLabel}</dd></div>
                  </dl>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Từ khóa</p><div className="mt-2 flex flex-wrap gap-1.5">{selected.keywords.length ? selected.keywords.map((keyword) => <span key={keyword} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">{keyword}</span>) : <span className="text-sm text-slate-400">Chưa có</span>}</div></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chữ nhìn thấy</p><p className="mt-1 text-sm text-slate-700">{selected.visibleText.join(' · ') || 'Chưa có OCR'}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phạm vi</p><p className="mt-1 text-sm text-slate-700">{selected.vehicleModels.join(', ') || 'Theo occurrence'} {selected.modelYears.length ? `· ${selected.modelYears.join(', ')}` : ''}</p><p className="mt-1 text-xs text-slate-500">{selected.sectionTitles.slice(0, 4).join(' · ')}</p></div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ngữ cảnh nguồn</p>
                    {selected.contextSnippets.length ? (
                      <div className="mt-2 space-y-2">
                        {selected.contextSnippets.map((snippet, index) => (
                          <pre key={`${selected.annotationId}-context-${index}`} className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-xs leading-5 text-slate-700">{snippet}</pre>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-amber-700">Occurrence này chưa có đoạn ngữ cảnh cô đọng.</p>
                    )}
                  </div>
                </div>
              </div>
              {selected.status === 'AI_DRAFT' && (
                <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
                  {editMode ? (
                    <>
                      <button type="button" disabled={reviewing} onClick={() => setEditMode(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Hủy chỉnh sửa</button>
                      <button type="button" disabled={reviewing} onClick={() => void saveRevision()} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Lưu revision</button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={reviewing} onClick={() => setEditMode(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-4 w-4" />Chỉnh sửa</button>
                      <button type="button" disabled={reviewing} onClick={() => requestDestructiveReview('REJECTED')} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Từ chối</button>
                      <button type="button" disabled={reviewing} onClick={() => void submitReview('APPROVED')} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">{reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Duyệt</button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
