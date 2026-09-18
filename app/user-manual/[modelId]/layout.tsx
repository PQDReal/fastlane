import { getManualModel, getManualModels, getManualTree } from '@/lib/api/manuals-server'
import { ManualSidebar } from './manual-sidebar'
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return []
  try {
    const models = await getManualModels()
    return models.map((m) => ({ modelId: m.id }))
  } catch (error) {
    console.error('Failed to generate static params in layout:', error)
    return []
  }
}

export default async function ModelManualLayout(props: {
  children: React.ReactNode
  params: Promise<{ modelId: string }>
}) {
  const params = await props.params
  const { children } = props
  const decodedModelId = decodeURIComponent(params.modelId)
  const model = await getManualModel(decodedModelId)

  if (!model) {
    notFound()
  }

  const [tree, models] = await Promise.all([
    getManualTree(decodedModelId),
    getManualModels()
  ])

  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-5 text-white md:px-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#e6b32e]">Hướng dẫn sử dụng xe</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {model.model_series || model.name}
            </h1>
          </div>
          <span className="w-fit border border-[#e6b32e]/60 bg-[#e6b32e]/10 px-3 py-1.5 text-sm font-semibold text-[#f4cf6a]">
            Phiên bản năm {model.year}
          </span>
        </div>
      </header>

      <div className="flex w-full flex-1 flex-col md:flex-row">
        {/* Mobile Header / Sidebar */}
        <ManualSidebar tree={tree} modelId={decodedModelId} models={models} />

        {/* Content Area */}
        <div className="flex min-w-0 flex-1 flex-col bg-white">{children}</div>
      </div>
    </div>
  )
}
