'use client'

import { useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  Archive,
  BookOpen,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { ToastViewport, type ToastMessage } from '@/components/ui/toast'
import { MarkdownMessage } from '@/components/sales-agent/markdown-message'
import type {
  KnowledgeCategory,
  KnowledgeDocument,
  KnowledgeStatus,
} from '@/lib/sales-agent/knowledge/types'
import {
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_STATUS_LABELS,
} from '@/lib/sales-agent/knowledge/types'

type Props = {
  initialDocuments: KnowledgeDocument[]
  initialTotal: number
}

const CATEGORIES: Array<{ key: KnowledgeCategory | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Tất cả danh mục' },
  { key: 'WARRANTY_BATTERY', label: 'Bảo hành & Pin' },
  { key: 'DEPOSIT_DELIVERY', label: 'Đặt cọc & Nhận xe' },
  { key: 'TECHNICAL_GUIDE', label: 'Cẩm nang kỹ thuật' },
  { key: 'PROMOTIONS_FINANCING', label: 'Ưu đãi & Trả góp' },
]

export function KnowledgeManager({ initialDocuments, initialTotal }: Props) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>(initialDocuments)
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | 'ALL'>('ALL')
  const [selectedStatus, setSelectedStatus] = useState<KnowledgeStatus | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [isPending, startTransition] = useTransition()

  // Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<KnowledgeDocument | null>(null)
  const [editorTitle, setEditorTitle] = useState('')
  const [editorSlug, setEditorSlug] = useState('')
  const [editorCategory, setEditorCategory] = useState<KnowledgeCategory>('WARRANTY_BATTERY')
  const [editorSummary, setEditorSummary] = useState('')
  const [editorMarkdown, setEditorMarkdown] = useState('')
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')
  const [isSaving, setIsSaving] = useState(false)

  // Delete Modal State
  const [deletingDoc, setDeletingDoc] = useState<KnowledgeDocument | null>(null)
  const [isSyncingCache, setIsSyncingCache] = useState(false)

  async function handleSyncCache() {
    setIsSyncingCache(true)
    try {
      const res = await fetch('/api/v1/admin/sales-agent/cache', { method: 'POST' })
      if (!res.ok) throw new Error('Không thể làm mới cache.')
      const json = await res.json()
      const s = json.data?.status
      showToast(
        'success',
        'Đã làm mới Cache AI',
        `Đã đồng bộ ${s?.productsCount || 0} xe, ${s?.accessoriesCount || 0} phụ kiện và ${s?.knowledgeChunksCount || 0} đoạn tri thức vào RAM.`
      )
    } catch (err: any) {
      showToast('error', 'Lỗi đồng bộ cache', err?.message || 'Có lỗi xảy ra khi làm mới cache AI.')
    } finally {
      setIsSyncingCache(false)
    }
  }

  function showToast(kind: 'success' | 'error' | 'warning', title: string, message?: string) {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, kind, title, message }])
  }

  function handleOpenCreate() {
    setEditingDoc(null)
    setEditorTitle('')
    setEditorSlug('')
    setEditorCategory('WARRANTY_BATTERY')
    setEditorSummary('')
    setEditorMarkdown(`# Tiêu Đề Bài Viết\n\n## 1. Mục chính thứ nhất\nNội dung chi tiết...\n\n## 2. Mục chính thứ hai\nNội dung chi tiết...`)
    setActiveTab('write')
    setIsEditorOpen(true)
  }

  function handleOpenEdit(doc: KnowledgeDocument) {
    setEditingDoc(doc)
    setEditorTitle(doc.title)
    setEditorSlug(doc.slug)
    setEditorCategory(doc.category)
    setEditorSummary(doc.summary || '')
    setEditorMarkdown(doc.contentMarkdown)
    setActiveTab('write')
    setIsEditorOpen(true)
  }

  async function refreshDocuments() {
    try {
      const res = await fetch('/api/v1/admin/knowledge')
      if (res.ok) {
        const json = await res.json()
        setDocuments(json.data.documents || [])
      }
    } catch {
      // ignore
    }
  }

  async function handleSaveDraft() {
    if (!editorTitle.trim() || !editorMarkdown.trim()) {
      showToast('error', 'Thiếu thông tin', 'Vui lòng nhập tiêu đề và nội dung bài viết.')
      return
    }

    setIsSaving(true)
    try {
      if (editingDoc) {
        const res = await fetch(`/api/v1/admin/knowledge/${editingDoc.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editorTitle,
            category: editorCategory,
            summary: editorSummary,
            contentMarkdown: editorMarkdown,
          }),
        })
        if (!res.ok) throw new Error('Không thể lưu cập nhật.')
        showToast('success', 'Đã lưu bản nháp', `Cập nhật thành công tài liệu "${editorTitle}".`)
      } else {
        const res = await fetch('/api/v1/admin/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editorTitle,
            slug: editorSlug || undefined,
            category: editorCategory,
            summary: editorSummary,
            contentMarkdown: editorMarkdown,
          }),
        })
        if (!res.ok) throw new Error('Không thể tạo tài liệu.')
        showToast('success', 'Đã tạo bản nháp', `Tạo mới thành công tài liệu "${editorTitle}".`)
      }
      setIsEditorOpen(false)
      await refreshDocuments()
    } catch (err: any) {
      showToast('error', 'Lỗi lưu trữ', err?.message || 'Có lỗi xảy ra khi lưu tài liệu.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePublishDirect(docId?: string) {
    const targetId = docId || editingDoc?.id

    if (!docId && (!editorTitle.trim() || !editorMarkdown.trim())) {
      showToast('error', 'Thiếu thông tin', 'Vui lòng nhập tiêu đề và nội dung bài viết trước khi xuất bản.')
      return
    }

    setIsSaving(true)
    try {
      // If publishing from editor modal, first save updates
      let finalId = targetId
      if (!docId) {
        if (editingDoc) {
          await fetch(`/api/v1/admin/knowledge/${editingDoc.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: editorTitle,
              category: editorCategory,
              summary: editorSummary,
              contentMarkdown: editorMarkdown,
            }),
          })
          finalId = editingDoc.id
        } else {
          const createRes = await fetch('/api/v1/admin/knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: editorTitle,
              slug: editorSlug || undefined,
              category: editorCategory,
              summary: editorSummary,
              contentMarkdown: editorMarkdown,
            }),
          })
          const createJson = await createRes.json()
          finalId = createJson.data.document.id
        }
      }

      const res = await fetch(`/api/v1/admin/knowledge/${finalId}/publish`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Không thể xuất bản.')
      const json = await res.json()

      showToast(
        'success',
        'Xuất bản thành công',
        json.data?.message || 'Tài liệu đã được băm nhỏ và kích hoạt cho Sales Agent tra cứu.',
      )
      setIsEditorOpen(false)
      await refreshDocuments()
    } catch (err: any) {
      showToast('error', 'Lỗi xuất bản', err?.message || 'Có lỗi xảy ra khi xuất bản tài liệu.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleArchive(doc: KnowledgeDocument) {
    try {
      const res = await fetch(`/api/v1/admin/knowledge/${doc.id}/archive`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Không thể lưu trữ.')
      showToast('warning', 'Đã lưu trữ tài liệu', `Tài liệu "${doc.title}" đã tạm ngưng tra cứu trong Sales Agent.`)
      await refreshDocuments()
    } catch (err: any) {
      showToast('error', 'Lỗi lưu trữ', err?.message || 'Có lỗi xảy ra.')
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingDoc) return
    try {
      const res = await fetch(`/api/v1/admin/knowledge/${deletingDoc.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Không thể xóa.')
      showToast('success', 'Đã xóa tài liệu', `Đã xóa vĩnh viễn tài liệu "${deletingDoc.title}" và toàn bộ phân đoạn.`)
      setDeletingDoc(null)
      await refreshDocuments()
    } catch (err: any) {
      showToast('error', 'Lỗi xóa tài liệu', err?.message || 'Có lỗi xảy ra.')
    }
  }

  // Filtered documents list
  const filteredDocs = documents.filter((doc) => {
    if (selectedCategory !== 'ALL' && doc.category !== selectedCategory) return false
    if (selectedStatus !== 'ALL' && doc.status !== selectedStatus) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.slug.toLowerCase().includes(q) ||
        (doc.summary && doc.summary.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <div className="space-y-6">
      <ToastViewport toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Action Bar & Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setSelectedCategory(cat.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                selectedCategory === cat.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSyncCache}
            disabled={isSyncingCache}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900 shadow-xs transition hover:bg-amber-100 hover:border-amber-500 active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Làm mới bộ nhớ đệm AI (In-Memory Cache) tức thì"
          >
            <RefreshCw size={14} className={isSyncingCache ? 'animate-spin text-amber-600' : 'text-amber-600'} />
            <span>{isSyncingCache ? 'Đang làm mới cache...' : 'Làm mới Cache AI'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            <span>Thêm tài liệu mới</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm tài liệu theo tiêu đề, slug hoặc từ khóa..."
            className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-4 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-brand-500"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="PUBLISHED">Đã xuất bản (PUBLISHED)</option>
            <option value="DRAFT">Bản nháp (DRAFT)</option>
            <option value="ARCHIVED">Lưu trữ (ARCHIVED)</option>
          </select>

          <button
            type="button"
            onClick={() => refreshDocuments()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 active:scale-95"
            title="Làm mới danh sách"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Documents Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3.5">Tiêu đề tài liệu</th>
                <th className="px-4 py-3.5">Danh mục</th>
                <th className="px-4 py-3.5">Trạng thái</th>
                <th className="px-4 py-3.5">Phiên bản</th>
                <th className="px-4 py-3.5">Cập nhật</th>
                <th className="px-4 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <BookOpen size={28} className="mx-auto mb-2 opacity-40" />
                    <p>Không tìm thấy tài liệu tri thức nào phù hợp.</p>
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr key={doc.id} className="transition hover:bg-slate-50/70">
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900">{doc.title}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{doc.slug}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                        {KNOWLEDGE_CATEGORY_LABELS[doc.category] || doc.category}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {doc.status === 'PUBLISHED' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Đã xuất bản
                        </span>
                      ) : doc.status === 'DRAFT' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                          Bản nháp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                          Lưu trữ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-xs">
                      {doc.publishedVersion > 0 ? (
                        <span className="rounded-md bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
                          v{doc.publishedVersion}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-xs text-slate-400">
                      {new Date(doc.updatedAt).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(doc)}
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                          title="Chỉnh sửa tài liệu"
                        >
                          <Edit3 size={15} />
                        </button>
                        {doc.status !== 'PUBLISHED' ? (
                          <button
                            type="button"
                            onClick={() => void handlePublishDirect(doc.id)}
                            className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                            title="Xuất bản ngay vào Sales Agent"
                          >
                            <Send size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleArchive(doc)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                            title="Lưu trữ / Tạm ngưng tra cứu"
                          >
                            <Archive size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeletingDoc(doc)}
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 cursor-pointer"
                          title="Xóa tài liệu"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor Modal */}
      <AnimatePresence>
        {isEditorOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditorOpen(false)}
              className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs"
            />
            <motion.div
              role="dialog"
              aria-label="Soạn thảo tài liệu tri thức"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="fixed inset-2 sm:inset-0 m-auto z-50 flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200 bg-white shadow-2xl w-[calc(100vw-16px)] sm:w-[min(94vw,1080px)] h-[calc(100dvh-16px)] sm:h-[min(90vh,880px)]"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-brand-500/20 p-2 text-brand-300">
                    <BookOpen size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      {editingDoc ? 'Chỉnh Sửa Tài Liệu Tri Thức' : 'Tạo Tài Liệu Tri Thức Mới'}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Được tự động băm nhỏ (chunking) theo mục ## để Sales Agent tra cứu
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tiêu đề tài liệu <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={editorTitle}
                      onChange={(e) => setEditorTitle(e.target.value)}
                      placeholder="VD: Chính sách bảo hành ô tô điện VinFast"
                      className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs sm:text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Danh mục tri thức <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editorCategory}
                      onChange={(e) => setEditorCategory(e.target.value as KnowledgeCategory)}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs sm:text-sm text-slate-800 outline-none focus:border-brand-500"
                    >
                      <option value="WARRANTY_BATTERY">Chính sách bảo hành & Pin</option>
                      <option value="DEPOSIT_DELIVERY">Quy trình đặt cọc & Nhận xe</option>
                      <option value="TECHNICAL_GUIDE">Cẩm nang & Thông số kỹ thuật</option>
                      <option value="PROMOTIONS_FINANCING">Ưu đãi & Mua xe trả góp</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tóm tắt ngắn (Summary)
                  </label>
                  <input
                    value={editorSummary}
                    onChange={(e) => setEditorSummary(e.target.value)}
                    placeholder="Mô tả ngắn gọn nội dung tài liệu để dễ dàng nhận diện..."
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-xs sm:text-sm text-slate-800 outline-none focus:border-brand-500"
                  />
                </div>

                {/* Markdown Editor & Live Preview Tabs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveTab('write')}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                          activeTab === 'write'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        Soạn thảo Markdown
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('preview')}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                          activeTab === 'preview'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        Xem trước (Live Preview)
                      </button>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Gợi ý: Dùng <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600 font-mono">## 1. Tiêu đề mục</code> để hệ thống tự động băm nhỏ phân đoạn.
                    </span>
                  </div>

                  {activeTab === 'write' ? (
                    <textarea
                      value={editorMarkdown}
                      onChange={(e) => setEditorMarkdown(e.target.value)}
                      rows={14}
                      placeholder="Nhập nội dung tài liệu định dạng Markdown..."
                      className="w-full rounded-2xl border border-slate-200 p-4 font-mono text-xs sm:text-sm leading-relaxed text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 custom-scrollbar"
                    />
                  ) : (
                    <div className="min-h-[280px] max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-5 custom-scrollbar">
                      <MarkdownMessage content={editorMarkdown || '*(Chưa có nội dung)*'} />
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleSaveDraft()}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    Lưu bản nháp
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handlePublishDirect()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Send size={13} />
                    <span>Xuất bản ngay</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingDoc && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingDoc(null)}
              className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs"
            />
            <motion.div
              role="alertdialog"
              aria-label="Xác nhận xóa tài liệu"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="fixed inset-0 m-auto z-50 flex max-h-[240px] w-[90vw] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-red-100 p-2.5 text-red-600 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Xóa vĩnh viễn tài liệu?</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Hành động này sẽ xóa tài liệu <strong className="text-slate-800 font-semibold">{deletingDoc.title}</strong> và tự động xóa sạch toàn bộ phân đoạn (chunks) liên quan trong cơ sở dữ liệu.
                  </p>
                </div>
              </div>

              <div className="mt-auto flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setDeletingDoc(null)}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteConfirm()}
                  className="rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 active:scale-95"
                >
                  Xóa vĩnh viễn
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
