import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpenText, CalendarDays, CarFront, ExternalLink, ShieldCheck } from 'lucide-react'

import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { MarkdownMessage } from '@/components/sales-agent/markdown-message'
import { getKnowledgeSourceByChunkId } from '@/lib/sales-agent/knowledge/source-reader'

export const metadata: Metadata = {
  title: 'Nguồn tài liệu được tư vấn | FASTLANE',
  description: 'Đoạn tài liệu RAG đã được FASTLANE dùng làm nguồn cho câu trả lời tư vấn.',
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CATEGORY_LABELS: Record<string, string> = {
  TECHNICAL_GUIDE: 'Hướng dẫn kỹ thuật',
  WARRANTY_BATTERY: 'Bảo hành và pin',
  CHARGING_NETWORK: 'Sạc và trạm sạc',
  DEPOSIT_DELIVERY: 'Đặt cọc và giao xe',
  PROMOTIONS_FINANCING: 'Ưu đãi và tài chính',
  GENERAL_POLICY: 'Chính sách chung',
}

export default async function KnowledgeSourcePage({
  params,
}: {
  params: Promise<{ chunkId: string }>
}) {
  const { chunkId } = await params
  const source = await getKnowledgeSourceByChunkId(chunkId)
  if (!source) notFound()

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <article className="mx-auto max-w-4xl">
          <Link
            href="/"
            className="mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-brand-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Quay lại FASTLANE
          </Link>

          <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-gradient-to-br from-brand-50 via-white to-slate-50 px-5 py-6 sm:px-8 sm:py-8">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-700">
                <BookOpenText className="h-5 w-5" aria-hidden="true" />
                {CATEGORY_LABELS[source.category] || 'Tài liệu tham chiếu'}
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                {source.title}
              </h1>
              <p className="mt-3 text-base font-medium text-slate-700">{source.sectionTitle}</p>

              <dl className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
                {source.vehicleModel && (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                    <CarFront className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
                    <dt className="sr-only">Dòng xe</dt>
                    <dd>{source.vehicleModel}</dd>
                  </div>
                )}
                {source.modelYear && (
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
                    <dt className="sr-only">Đời xe</dt>
                    <dd>Đời {source.modelYear}</dd>
                  </div>
                )}
                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  <dt className="sr-only">Trạng thái</dt>
                  <dd>Nguồn đang phát hành · phiên bản {source.versionNo}</dd>
                </div>
              </dl>
            </div>

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900">
                <p className="leading-relaxed">
                  Đây là đúng đoạn nguồn RAG mà trợ lý đã dùng cho câu trả lời. Nội dung chỉ được hiển thị khi tài liệu vẫn là phiên bản đang phát hành.
                </p>
                {source.targetUrl && (
                  <Link
                    href={source.targetUrl}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800 active:scale-95 shrink-0"
                  >
                    <span>Đến trang tài liệu gốc</span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
                <MarkdownMessage content={source.content} />
              </div>
            </div>

            <footer className="border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-8">
              <p className="text-xs font-medium text-slate-500">Mã trích dẫn</p>
              <code className="mt-1 block break-all text-xs text-slate-700">{source.citationId}</code>
            </footer>
          </header>
        </article>
      </main>
      <Footer />
    </div>
  )
}
