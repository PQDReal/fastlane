'use client'

import { useEffect, useState } from 'react'
import { fetchManualArticleAction } from '@/lib/sales-agent/actions/manual-actions'
import { ArticleContent } from '@/app/user-manual/[modelId]/[articleId]/article-content'
import { Loader2, X, BookOpen } from 'lucide-react'

interface ManualReaderPanelProps {
  modelId: string
  articleId: string
  onClose: () => void
}

interface ArticleData {
  contentHtml: string
  modelName: string
  modelYear: string
  articleTitle: string
  searchData: { id: string; title: string }[]
}

export function ManualReaderPanel({ modelId, articleId, onClose }: ManualReaderPanelProps) {
  const [data, setData] = useState<ArticleData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)

    fetchManualArticleAction(modelId, articleId)
      .then((res) => {
        if (active) {
          setData(res)
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('Error fetching manual article for panel', err)
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [modelId, articleId])

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2 text-brand-700 font-medium text-sm">
          <BookOpen size={16} />
          <span>Trích xuất Hướng dẫn sử dụng</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          title="Đóng tài liệu"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-0 relative">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mb-2" size={24} />
            <span className="text-xs">Đang tải nội dung...</span>
          </div>
        ) : data ? (
          <div className="p-4 vf-manual-content text-sm">
            <ArticleContent
              modelId={modelId}
              contentHtml={data.contentHtml}
              modelName={data.modelName}
              modelYear={data.modelYear}
              articleTitle={data.articleTitle}
              searchData={data.searchData}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
            <BookOpen className="mb-2 opacity-50" size={32} />
            <span className="text-sm font-medium text-slate-600">Không tìm thấy tài liệu</span>
            <span className="text-xs mt-1">Vui lòng thử lại sau hoặc chọn tài liệu khác.</span>
          </div>
        )}
      </div>
    </div>
  )
}
